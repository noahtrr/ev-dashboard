import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserAdmin } from '#lib/server/admin/users.ts';
import { openDatabase } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { actions, load } = await import('./+page.server.ts');

const alice = { id: 'u-alice', name: 'Alice', email: 'alice@example.com', role: 'admin' };
const bob = { id: 'u-bob', name: 'Bob', email: 'bob@example.com', role: 'user' };

type Event = Parameters<typeof load>[0];
const event = (locals: Partial<App.Locals>, id: string, fields?: Record<string, string>) =>
	({
		locals: { locale: 'de', ...locals },
		params: { id },
		request: fields
			? new Request('http://localhost/admin/users/x', {
					method: 'POST',
					body: new URLSearchParams(fields)
				})
			: undefined
	}) as unknown as Event;

const run = (
	name: keyof typeof actions,
	locals: Partial<App.Locals>,
	id: string,
	fields: Record<string, string> = {}
) => actions[name](event(locals, id, fields) as never) as Promise<unknown>;

beforeEach(async () => {
	const { db } = openDatabase(':memory:');
	state.app = { db, users: createUserAdmin(db), methods: { mail: false } };
	const now = new Date();
	await db.insert(user).values([
		{ ...alice, emailVerified: true, createdAt: now, updatedAt: now },
		{ ...bob, emailVerified: false, createdAt: now, updatedAt: now }
	]);
});

describe('admin user page', () => {
	it('shows the account and whether it is the own one', async () => {
		expect(await load(event({ user: alice }, bob.id))).toMatchObject({
			account: { email: 'bob@example.com', role: 'user' },
			self: false,
			mail: false
		});
		expect(await load(event({ user: alice }, alice.id))).toMatchObject({ self: true });
		await expect(load(event({ user: alice }, 'nobody'))).rejects.toMatchObject({ status: 404 });
	});

	it('changes the role, locks and unlocks', async () => {
		expect(await run('role', { user: alice }, bob.id, { role: 'admin' })).toEqual({
			roleSaved: true
		});
		expect(await run('role', { user: alice }, bob.id, { role: 'owner' })).toMatchObject({
			status: 400,
			data: { error: 'invalid' }
		});
		expect(await run('lock', { user: alice }, bob.id, { reason: 'Spam' })).toEqual({
			locked: true
		});
		expect(await load(event({ user: alice }, bob.id))).toMatchObject({
			account: { lockReason: 'Spam' }
		});
		expect(await run('unlock', { user: alice }, bob.id)).toEqual({ unlocked: true });
		expect(await run('signOut', { user: alice }, bob.id)).toEqual({ signedOut: true });
	});

	it('reports what is not allowed', async () => {
		expect(await run('lock', { user: alice }, alice.id)).toMatchObject({
			status: 400,
			data: { error: 'self' }
		});
		expect(await run('delete', { user: alice }, bob.id, { email: 'x@example.com' })).toMatchObject({
			status: 400,
			data: { error: 'confirm' }
		});
		await expect(run('unlock', { user: alice }, 'nobody')).rejects.toMatchObject({ status: 404 });
	});

	it('deletes and goes back to the list', async () => {
		await expect(
			run('delete', { user: alice }, bob.id, { email: 'bob@example.com' })
		).rejects.toMatchObject({ status: 303, location: '/admin?deleted=1' });
		await expect(load(event({ user: alice }, bob.id))).rejects.toMatchObject({ status: 404 });
	});

	it('is for admins only', async () => {
		await expect(load(event({ user: bob }, bob.id))).rejects.toMatchObject({ status: 403 });
		for (const name of ['role', 'signOut', 'lock', 'unlock', 'delete'] as const) {
			await expect(run(name, { user: bob }, alice.id, { role: 'user' })).rejects.toMatchObject({
				status: 403
			});
		}
	});
});
