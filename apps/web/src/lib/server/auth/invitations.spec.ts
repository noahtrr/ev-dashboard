import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.ts';
import { user } from '../db/schema.ts';
import { createInvitations, INVITE_DAYS, type Invitations } from './invitations.ts';

const DAY = 86_400_000;
let clock: number;
let invitations: Invitations;

beforeEach(async () => {
	const { db } = openDatabase(':memory:');
	clock = Date.UTC(2026, 9, 19, 12);
	invitations = createInvitations(db, () => clock);
	const now = new Date(clock);
	await db.insert(user).values({
		id: 'u-admin',
		name: 'Admin',
		email: 'admin@example.com',
		emailVerified: true,
		role: 'admin',
		createdAt: now,
		updatedAt: now
	});
});

describe('invitations', () => {
	it('finds an open invitation by its token, with the inviter', async () => {
		const invite = await invitations.create('u-admin', '  Carla@Example.com ');
		expect(invite.email).toBe('carla@example.com');
		expect(invite.token).toMatch(/^[\w-]{43}$/);
		expect(await invitations.find(invite.token)).toEqual({
			id: invite.id,
			email: 'carla@example.com',
			expiresAt: new Date(clock + INVITE_DAYS * DAY),
			inviter: 'Admin'
		});
		expect(await invitations.find('wrong')).toBeUndefined();
		expect(await invitations.find('')).toBeUndefined();
	});

	it('expires after seven days', async () => {
		const invite = await invitations.create('u-admin', 'carla@example.com');
		clock += INVITE_DAYS * DAY;
		expect(await invitations.find(invite.token)).toBeUndefined();
		expect((await invitations.list())[0].state).toBe('expired');
	});

	it('replaces an open invitation for the same address', async () => {
		const first = await invitations.create('u-admin', 'carla@example.com');
		const second = await invitations.create('u-admin', 'CARLA@example.com');
		expect(await invitations.find(first.token)).toBeUndefined();
		expect(await invitations.find(second.token)).toBeDefined();
		expect(await invitations.list()).toHaveLength(1);
	});

	it('renews link and validity', async () => {
		const invite = await invitations.create('u-admin', 'carla@example.com');
		clock += 6 * DAY;
		const renewed = await invitations.renew(invite.id);
		expect(renewed?.token).not.toBe(invite.token);
		expect(await invitations.find(invite.token)).toBeUndefined();
		clock += 6 * DAY;
		expect(await invitations.find(renewed!.token)).toMatchObject({ email: 'carla@example.com' });
		expect(await invitations.renew('unknown')).toBeUndefined();
	});

	it('cannot be used, renewed or revoked once accepted', async () => {
		const invite = await invitations.create('u-admin', 'carla@example.com');
		await invitations.accept(invite.id);
		expect(await invitations.find(invite.token)).toBeUndefined();
		expect(await invitations.renew(invite.id)).toBeUndefined();
		await invitations.revoke(invite.id);
		expect(await invitations.list()).toMatchObject([{ state: 'accepted' }]);
	});

	it('revokes an open invitation', async () => {
		const invite = await invitations.create('u-admin', 'carla@example.com');
		await invitations.revoke(invite.id);
		expect(await invitations.find(invite.token)).toBeUndefined();
		expect(await invitations.list()).toEqual([]);
	});

	it('lists the newest first with their state', async () => {
		await invitations.create('u-admin', 'a@example.com');
		clock += 1000;
		await invitations.create('u-admin', 'b@example.com');
		const list = await invitations.list();
		expect(list.map((i) => [i.email, i.state])).toEqual([
			['b@example.com', 'pending'],
			['a@example.com', 'pending']
		]);
	});
});
