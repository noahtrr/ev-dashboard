// Invitations by mail: an admin invites an address, the link lets that address sign up even
// while registration is closed, with the address counting as confirmed.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { invitation, user } from '../db/schema.ts';

export const INVITE_DAYS = 7;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type InvitationState = 'pending' | 'expired' | 'accepted';
export type InvitationView = {
	id: string;
	email: string;
	createdAt: Date;
	expiresAt: Date;
	acceptedAt: Date | null;
	state: InvitationState;
};

/** The invitation a sign-up runs under; read by the user-create hook in config.ts. */
export const invitationContext = new AsyncLocalStorage<{ id: string; email: string }>();

export function createInvitations(db: Database, now = () => Date.now()) {
	/** Creates an invitation, replacing an open one for the same address. Returns the token. */
	async function create(invitedBy: string, email: string) {
		const address = normalizeEmail(email);
		await db
			.delete(invitation)
			.where(and(eq(invitation.email, address), isNull(invitation.acceptedAt)));
		const token = randomBytes(32).toString('base64url');
		const id = randomUUID();
		await db.insert(invitation).values({
			id,
			email: address,
			tokenHash: hash(token),
			invitedBy,
			createdAt: new Date(now()),
			expiresAt: new Date(now() + INVITE_DAYS * 86_400_000)
		});
		return { id, email: address, token };
	}

	/** A new link and validity for an open invitation; undefined when accepted or unknown. */
	async function renew(id: string) {
		const row = await db.query.invitation.findFirst({ where: eq(invitation.id, id) });
		if (!row || row.acceptedAt) return undefined;
		const token = randomBytes(32).toString('base64url');
		await db
			.update(invitation)
			.set({ tokenHash: hash(token), expiresAt: new Date(now() + INVITE_DAYS * 86_400_000) })
			.where(eq(invitation.id, id));
		return { id, email: row.email, token };
	}

	async function revoke(id: string) {
		await db.delete(invitation).where(and(eq(invitation.id, id), isNull(invitation.acceptedAt)));
	}

	/** The open, unexpired invitation for a token, with the inviter's name. */
	async function find(token: string) {
		if (!token) return undefined;
		const [row] = await db
			.select({
				id: invitation.id,
				email: invitation.email,
				expiresAt: invitation.expiresAt,
				inviter: user.name
			})
			.from(invitation)
			.innerJoin(user, eq(user.id, invitation.invitedBy))
			.where(
				and(
					eq(invitation.tokenHash, hash(token)),
					isNull(invitation.acceptedAt),
					gt(invitation.expiresAt, new Date(now()))
				)
			);
		return row;
	}

	async function accept(id: string) {
		await db
			.update(invitation)
			.set({ acceptedAt: new Date(now()) })
			.where(eq(invitation.id, id));
	}

	async function list(): Promise<InvitationView[]> {
		const rows = await db.select().from(invitation).orderBy(desc(invitation.createdAt)).limit(50);
		return rows.map((r) => ({
			id: r.id,
			email: r.email,
			createdAt: r.createdAt,
			expiresAt: r.expiresAt,
			acceptedAt: r.acceptedAt,
			state: r.acceptedAt ? 'accepted' : r.expiresAt.getTime() <= now() ? 'expired' : 'pending'
		}));
	}

	return { create, renew, revoke, find, accept, list };
}

export type Invitations = ReturnType<typeof createInvitations>;
