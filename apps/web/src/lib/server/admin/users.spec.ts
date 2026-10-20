import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createAuth } from '../auth/config.ts';
import { openDatabase } from '../db/index.ts';
import { account, session, trip, user, vehicleConnection } from '../db/schema.ts';
import { createUserAdmin, deviceLabel, maskIp, type UserAdmin } from './users.ts';

const T0 = Date.UTC(2026, 9, 20, 10);
const DAY = 86_400_000;
let db: ReturnType<typeof openDatabase>['db'];
let users: UserAdmin;

const person = (id: string, role = 'user', days = 0) => ({
	id,
	name: id[0].toUpperCase() + id.slice(1),
	email: `${id}@example.com`,
	role,
	createdAt: new Date(T0 - days * DAY),
	updatedAt: new Date(T0)
});

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	users = createUserAdmin(db, () => T0);
	await db
		.insert(user)
		.values([person('alice', 'admin', 30), person('bob', 'user', 2), person('carla', 'user', 10)]);
	await db.insert(account).values([
		{
			id: 'a1',
			accountId: 'alice',
			providerId: 'credential',
			userId: 'alice',
			updatedAt: new Date(T0)
		},
		{ id: 'a2', accountId: 'gh-1', providerId: 'github', userId: 'alice', updatedAt: new Date(T0) },
		{ id: 'a3', accountId: 'g-1', providerId: 'google', userId: 'bob', updatedAt: new Date(T0) }
	]);
	await db.insert(session).values([
		{
			id: 's1',
			token: 't1',
			userId: 'bob',
			expiresAt: new Date(T0 + 7 * DAY),
			updatedAt: new Date(T0 - 3600_000),
			ipAddress: '91.64.12.34',
			userAgent:
				'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
		},
		{
			id: 's2',
			token: 't2',
			userId: 'bob',
			expiresAt: new Date(T0 - DAY),
			updatedAt: new Date(T0 - 2 * DAY)
		}
	]);
	await db.insert(vehicleConnection).values({
		id: 'c1',
		userId: 'bob',
		providerId: 'mock',
		accessToken: 'x',
		accessTokenExpiresAt: new Date(T0)
	});
	await db.insert(trip).values({
		id: 'trip1',
		connectionId: 'c1',
		startAt: new Date(T0 - DAY),
		endAt: new Date(T0 - DAY + 1800_000),
		distanceKm: 12
	} as typeof trip.$inferInsert);
});

describe('user administration', () => {
	it('lists accounts newest first with methods, vehicles and last activity', async () => {
		const list = await users.list();
		expect(list.map((u) => u.id)).toEqual(['bob', 'carla', 'alice']);
		expect(list[0]).toMatchObject({
			methods: ['google'],
			vehicles: 1,
			lastActiveAt: new Date(T0 - 3600_000),
			lockedAt: null
		});
		expect(list[2].methods).toEqual(['github', 'password']);
		expect(list[1]).toMatchObject({ vehicles: 0, lastActiveAt: null, methods: [] });
		expect(await users.stats()).toEqual({ total: 3, recent: 1, locked: 0 });
	});

	it('shows open sessions without full addresses, and counts what a deletion removes', async () => {
		const detail = await users.get('bob');
		expect(detail?.sessions).toEqual([
			{
				id: 's1',
				device: 'Safari · iPhone',
				ip: '91.64.x.x',
				lastActiveAt: new Date(T0 - 3600_000)
			}
		]);
		expect(detail).toMatchObject({ trips: 1, chargeSessions: 0, lockReason: null });
		expect(await users.get('nobody')).toBeUndefined();
	});

	it('changes roles but keeps at least one admin and never the own role', async () => {
		expect(await users.setRole('alice', 'alice', 'user')).toEqual({ ok: false, error: 'self' });
		expect(await users.setRole('alice', 'bob', 'admin')).toEqual({ ok: true });
		expect(await users.setRole('bob', 'alice', 'user')).toEqual({ ok: true });
		// Bob is the only admin now.
		expect(await users.setRole('alice', 'bob', 'user')).toEqual({ ok: false, error: 'last_admin' });
		expect(await users.setRole('bob', 'nobody', 'user')).toEqual({ ok: false, error: 'not_found' });
	});

	it('locks an account, ends its sessions and unlocks it again', async () => {
		expect(await users.lock('alice', 'alice', '')).toEqual({ ok: false, error: 'self' });
		expect(await users.lock('alice', 'bob', '  Unknown account  ')).toEqual({ ok: true });
		const locked = await users.get('bob');
		expect(locked).toMatchObject({ lockedAt: new Date(T0), lockReason: 'Unknown account' });
		expect(locked?.sessions).toEqual([]);
		expect(await db.select().from(session).where(eq(session.userId, 'bob'))).toEqual([]);
		expect((await users.stats()).locked).toBe(1);

		await users.unlock('bob');
		expect(await users.get('bob')).toMatchObject({ lockedAt: null, lockReason: null });
	});

	it('signs an account out everywhere', async () => {
		await users.signOut('bob');
		expect((await users.get('bob'))?.sessions).toEqual([]);
	});

	it('deletes an account with its vehicles and history after typing the address', async () => {
		expect(await users.remove('alice', 'bob', 'wrong@example.com')).toEqual({
			ok: false,
			error: 'confirm'
		});
		expect(await users.remove('alice', 'alice', 'alice@example.com')).toEqual({
			ok: false,
			error: 'self'
		});
		expect(await users.remove('alice', 'bob', ' BOB@example.com ')).toEqual({ ok: true });
		expect(await users.get('bob')).toBeUndefined();
		expect(await db.select().from(vehicleConnection)).toEqual([]);
		expect(await db.select().from(trip)).toEqual([]);
		expect(await db.select().from(account).where(eq(account.userId, 'bob'))).toEqual([]);
	});
});

describe('sign-in of locked accounts', () => {
	it('is refused for every method, because no session can be created', async () => {
		const { db } = openDatabase(':memory:');
		const auth = createAuth(
			{
				baseURL: 'http://localhost:3000',
				secret: 'test-secret-test-secret-test-secret-123',
				emailPassword: true,
				passkey: false,
				allowSignup: true,
				rateLimit: false
			},
			db
		);
		const body = { name: 'Admin', email: 'admin@example.com', password: 'correct horse battery' };
		await auth.api.signUpEmail({ body });
		const second = await auth.api.signUpEmail({
			body: { ...body, name: 'Dave', email: 'dave@example.com' }
		});
		await createUserAdmin(db).lock('some-admin', second.user.id, '');
		await expect(
			auth.api.signInEmail({ body: { email: 'dave@example.com', password: body.password } })
		).rejects.toMatchObject({ body: { code: 'ACCOUNT_LOCKED' } });
		await createUserAdmin(db).unlock(second.user.id);
		await expect(
			auth.api.signInEmail({ body: { email: 'dave@example.com', password: body.password } })
		).resolves.toMatchObject({ user: { email: 'dave@example.com' } });
	});
});

describe('device and address helpers', () => {
	it('names browser and system', () => {
		expect(
			deviceLabel(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
			)
		).toBe('Edge · Windows');
		expect(
			deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')
		).toBe('Firefox · Linux');
		expect(deviceLabel('curl/8.0')).toBeNull();
		expect(deviceLabel(null)).toBeNull();
	});

	it('shortens addresses', () => {
		expect(maskIp('203.0.113.7')).toBe('203.0.x.x');
		expect(maskIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:…');
		expect(maskIp('')).toBeNull();
	});
});
