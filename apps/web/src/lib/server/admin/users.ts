// Account management for admins: overview, role, lock, sign-out and deletion. Admins see
// account metadata only, never another user's vehicle data.
import { and, count, desc, eq, gt, isNotNull, max, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import {
	account,
	chargeSession,
	passkey,
	session,
	trip,
	user,
	vehicleConnection
} from '../db/schema.ts';

/** How someone signs in: `password`, `passkey` or a provider id such as `github`. */
export type SignInMethod = string;

export type UserSummary = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	role: string;
	createdAt: Date;
	lockedAt: Date | null;
	lastActiveAt: Date | null;
	vehicles: number;
	methods: SignInMethod[];
};

export type UserSession = {
	id: string;
	device: string;
	ip: string | null;
	lastActiveAt: Date;
};

export type UserDetail = UserSummary & {
	lockReason: string | null;
	sessions: UserSession[];
	trips: number;
	chargeSessions: number;
};

export type AdminError = 'not_found' | 'self' | 'last_admin' | 'confirm';
export type AdminResult = { ok: true } | { ok: false; error: AdminError };

/** Browser and system from a user agent, e.g. "Safari · iPhone"; null when unknown. */
export function deviceLabel(userAgent: string | null | undefined): string | null {
	if (!userAgent) return null;
	const ua = userAgent;
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /Firefox\//.test(ua)
			? 'Firefox'
			: /Chrome\/|CriOS\//.test(ua)
				? 'Chrome'
				: /Safari\//.test(ua)
					? 'Safari'
					: null;
	const system = /iPhone/.test(ua)
		? 'iPhone'
		: /iPad/.test(ua)
			? 'iPad'
			: /Android/.test(ua)
				? 'Android'
				: /Windows/.test(ua)
					? 'Windows'
					: /Mac OS X|Macintosh/.test(ua)
						? 'macOS'
						: /Linux/.test(ua)
							? 'Linux'
							: null;
	const parts = [browser, system].filter(Boolean);
	return parts.length ? parts.join(' · ') : null;
}

/** Shortened address: enough to tell networks apart, not to locate anyone. */
export function maskIp(ip: string | null | undefined): string | null {
	if (!ip) return null;
	const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip);
	if (v4) return `${v4[1]}.${v4[2]}.x.x`;
	if (ip.includes(':')) return `${ip.split(':').slice(0, 2).join(':')}:…`;
	return null;
}

export function createUserAdmin(db: Database, now = () => Date.now()) {
	async function methodsByUser() {
		const rows = await db
			.select({ userId: account.userId, providerId: account.providerId })
			.from(account);
		const keys = await db.selectDistinct({ userId: passkey.userId }).from(passkey);
		const map = new Map<string, Set<string>>();
		const add = (id: string, method: string) => {
			if (!map.has(id)) map.set(id, new Set());
			map.get(id)!.add(method);
		};
		for (const r of rows) add(r.userId, r.providerId === 'credential' ? 'password' : r.providerId);
		for (const k of keys) add(k.userId, 'passkey');
		return map;
	}

	async function list(): Promise<UserSummary[]> {
		const [rows, vehicles, active, methods] = await Promise.all([
			db.select().from(user).orderBy(desc(user.createdAt)),
			db
				.select({ userId: vehicleConnection.userId, n: count() })
				.from(vehicleConnection)
				.groupBy(vehicleConnection.userId),
			db
				.select({ userId: session.userId, at: max(session.updatedAt) })
				.from(session)
				.groupBy(session.userId),
			methodsByUser()
		]);
		const vehicleCount = new Map(vehicles.map((v) => [v.userId, v.n]));
		const lastActive = new Map(active.map((a) => [a.userId, a.at]));
		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			email: r.email,
			emailVerified: r.emailVerified,
			role: r.role,
			createdAt: r.createdAt,
			lockedAt: r.lockedAt,
			lastActiveAt: lastActive.get(r.id) ?? null,
			vehicles: vehicleCount.get(r.id) ?? 0,
			methods: [...(methods.get(r.id) ?? [])].sort()
		}));
	}

	async function get(id: string): Promise<UserDetail | undefined> {
		const summary = (await list()).find((u) => u.id === id);
		if (!summary) return undefined;
		const [row] = await db
			.select({ lockReason: user.lockReason })
			.from(user)
			.where(eq(user.id, id));
		const sessions = await db
			.select()
			.from(session)
			.where(and(eq(session.userId, id), gt(session.expiresAt, new Date(now()))))
			.orderBy(desc(session.updatedAt));
		const [trips] = await db
			.select({ n: count() })
			.from(trip)
			.innerJoin(vehicleConnection, eq(vehicleConnection.id, trip.connectionId))
			.where(eq(vehicleConnection.userId, id));
		const [charges] = await db
			.select({ n: count() })
			.from(chargeSession)
			.innerJoin(vehicleConnection, eq(vehicleConnection.id, chargeSession.connectionId))
			.where(eq(vehicleConnection.userId, id));
		return {
			...summary,
			lockReason: row?.lockReason ?? null,
			sessions: sessions.map((s) => ({
				id: s.id,
				device: deviceLabel(s.userAgent) ?? '',
				ip: maskIp(s.ipAddress),
				lastActiveAt: s.updatedAt
			})),
			trips: trips?.n ?? 0,
			chargeSessions: charges?.n ?? 0
		};
	}

	async function find(id: string) {
		const [row] = await db
			.select({ id: user.id, role: user.role, email: user.email })
			.from(user)
			.where(eq(user.id, id));
		return row;
	}

	async function otherAdmins(id: string) {
		const [row] = await db
			.select({ n: count() })
			.from(user)
			.where(and(eq(user.role, 'admin'), sql`${user.id} <> ${id}`));
		return row?.n ?? 0;
	}

	/** Changes the role; never the own one, and never removes the last admin. */
	async function setRole(
		actorId: string,
		id: string,
		role: 'admin' | 'user'
	): Promise<AdminResult> {
		const target = await find(id);
		if (!target) return { ok: false, error: 'not_found' };
		if (id === actorId) return { ok: false, error: 'self' };
		if (role === 'user' && target.role === 'admin' && (await otherAdmins(id)) === 0) {
			return { ok: false, error: 'last_admin' };
		}
		await db
			.update(user)
			.set({ role, updatedAt: new Date(now()) })
			.where(eq(user.id, id));
		return { ok: true };
	}

	async function signOut(id: string): Promise<AdminResult> {
		if (!(await find(id))) return { ok: false, error: 'not_found' };
		await db.delete(session).where(eq(session.userId, id));
		return { ok: true };
	}

	/** Locks an account and ends its sessions; sign-in is refused until it is unlocked. */
	async function lock(actorId: string, id: string, reason: string): Promise<AdminResult> {
		if (!(await find(id))) return { ok: false, error: 'not_found' };
		if (id === actorId) return { ok: false, error: 'self' };
		await db
			.update(user)
			.set({
				lockedAt: new Date(now()),
				lockReason: reason.trim().slice(0, 200) || null,
				updatedAt: new Date(now())
			})
			.where(eq(user.id, id));
		await db.delete(session).where(eq(session.userId, id));
		return { ok: true };
	}

	async function unlock(id: string): Promise<AdminResult> {
		if (!(await find(id))) return { ok: false, error: 'not_found' };
		await db
			.update(user)
			.set({ lockedAt: null, lockReason: null, updatedAt: new Date(now()) })
			.where(eq(user.id, id));
		return { ok: true };
	}

	/** Deletes the account with everything it owns; the email has to be typed to confirm. */
	async function remove(actorId: string, id: string, confirmEmail: string): Promise<AdminResult> {
		const target = await find(id);
		if (!target) return { ok: false, error: 'not_found' };
		if (id === actorId) return { ok: false, error: 'self' };
		if (confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
			return { ok: false, error: 'confirm' };
		}
		if (target.role === 'admin' && (await otherAdmins(id)) === 0) {
			return { ok: false, error: 'last_admin' };
		}
		// Sessions, sign-in methods, vehicles and their history go with it (foreign keys).
		await db.delete(user).where(eq(user.id, id));
		return { ok: true };
	}

	/** Totals for the header: accounts, new in the last 7 days, locked. */
	async function stats() {
		const weekAgo = new Date(now() - 7 * 86_400_000);
		const [[all], [recent], [locked]] = await Promise.all([
			db.select({ n: count() }).from(user),
			db.select({ n: count() }).from(user).where(gt(user.createdAt, weekAgo)),
			db.select({ n: count() }).from(user).where(isNotNull(user.lockedAt))
		]);
		return { total: all?.n ?? 0, recent: recent?.n ?? 0, locked: locked?.n ?? 0 };
	}

	return { list, get, setRole, signOut, lock, unlock, remove, stats };
}

export type UserAdmin = ReturnType<typeof createUserAdmin>;
