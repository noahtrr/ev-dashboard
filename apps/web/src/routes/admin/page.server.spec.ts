import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserAdmin } from '#lib/server/admin/users.ts';
import { createInvitations } from '#lib/server/auth/invitations.ts';
import { openDatabase } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import type { Mail, Mailer } from '#lib/server/mail/mailer.ts';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { actions, load } = await import('./+page.server.ts');

const alice = { id: 'u-alice', name: 'Alice', email: 'alice@example.com', role: 'admin' };
const bob = { id: 'u-bob', name: 'Bob', email: 'bob@example.com', role: 'user' };

function formRequest(fields: Record<string, string>) {
	return new Request('http://localhost/admin', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
}

type Event = Parameters<typeof load>[0];
const event = (locals: Partial<App.Locals>, request?: Request) =>
	({ locals: { locale: 'de', ...locals }, request }) as unknown as Event;

let db: ReturnType<typeof openDatabase>['db'];

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	state.app = {
		db,
		users: createUserAdmin(db),
		invitations: createInvitations(db),
		methods: { allowSignup: true, mail: false },
		mailer: undefined,
		appUrl: 'https://ev.example.com'
	};
	const now = new Date();
	await db.insert(user).values([
		{
			...alice,
			emailVerified: true,
			createdAt: new Date(now.getTime() - 30 * 86_400_000),
			updatedAt: now
		},
		{ ...bob, emailVerified: false, createdAt: now, updatedAt: now }
	]);
});

describe('admin page', () => {
	it('lists the accounts with totals and the sign-up state', async () => {
		const data = await load(event({ user: alice }));
		expect(data.allowSignup).toBe(true);
		expect(data.stats).toEqual({ total: 2, recent: 1, locked: 0 });
		expect(data.users.map((u) => u.email)).toEqual(['bob@example.com', 'alice@example.com']);
		expect(data.mailInfo).toBeNull();
		expect(data.invitations).toBeNull();
	});

	it('is for admins only', async () => {
		await expect(load(event({ user: bob }))).rejects.toMatchObject({ status: 403 });
		await expect(load(event({}))).rejects.toMatchObject({ status: 401 });
	});
});

describe('admin page: invitations and mail', () => {
	let sent: Mail[];
	let mailer: Mailer;

	beforeEach(() => {
		sent = [];
		mailer = {
			info: { host: 'smtp.example.com', port: 587, from: 'ev@example.com' },
			send: async (mail) => {
				sent.push(mail);
			}
		};
		state.app = { ...(state.app as object), methods: { allowSignup: false, mail: true }, mailer };
	});

	const run = (name: keyof typeof actions, locals: Partial<App.Locals>, fields = {}) =>
		actions[name](event(locals, formRequest(fields)) as never) as Promise<unknown>;

	it('sends an invitation with a sign-up link', async () => {
		const result = await run('invite', { user: alice }, { email: ' Carla@Example.com ' });
		expect(result).toEqual({ inviteSent: 'carla@example.com' });
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('carla@example.com');
		expect(sent[0].subject).toContain('Alice');
		expect(sent[0].text).toMatch(/https:\/\/ev\.example\.com\/signup\?invite=[\w-]{43}/);

		const data = await load(event({ user: alice }));
		expect(data.invitations).toMatchObject([{ email: 'carla@example.com', state: 'pending' }]);
		expect(data.mailInfo).toEqual(mailer.info);
	});

	it('validates the address and skips existing accounts', async () => {
		expect(await run('invite', { user: alice }, { email: 'no-address' })).toMatchObject({
			status: 400,
			data: { inviteError: 'invalid' }
		});
		expect(await run('invite', { user: alice }, { email: 'BOB@example.com' })).toMatchObject({
			status: 400,
			data: { inviteError: 'exists' }
		});
		expect(sent).toEqual([]);
	});

	it('drops the invitation when the mail cannot be sent', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mailer.send = async () => {
			throw new Error('connection refused');
		};
		expect(await run('invite', { user: alice }, { email: 'carla@example.com' })).toMatchObject({
			status: 502,
			data: { inviteError: 'failed' }
		});
		expect((await load(event({ user: alice }))).invitations).toEqual([]);
		log.mockRestore();
	});

	it('resends with a new link and revokes', async () => {
		await run('invite', { user: alice }, { email: 'carla@example.com' });
		const [{ id }] = (await load(event({ user: alice }))).invitations!;
		expect(await run('resendInvite', { user: alice }, { id })).toEqual({
			inviteSent: 'carla@example.com'
		});
		expect(sent).toHaveLength(2);
		expect(sent[1].text).not.toBe(sent[0].text);

		await run('revokeInvite', { user: alice }, { id });
		expect((await load(event({ user: alice }))).invitations).toEqual([]);
		await expect(run('resendInvite', { user: alice }, { id })).rejects.toMatchObject({
			status: 404
		});
	});

	it('sends a test mail and reports the server answer', async () => {
		expect(await run('testMail', { user: alice })).toEqual({ testSent: 'alice@example.com' });
		expect(sent[0]).toMatchObject({ to: 'alice@example.com' });
		mailer.send = async () => {
			throw new Error('535 authentication failed');
		};
		expect(await run('testMail', { user: alice })).toMatchObject({
			status: 502,
			data: { testError: '535 authentication failed' }
		});
	});

	it('is for admins only', async () => {
		for (const name of ['invite', 'resendInvite', 'revokeInvite', 'testMail'] as const) {
			await expect(
				run(name, { user: bob }, { email: 'x@example.com', id: 'x' })
			).rejects.toMatchObject({ status: 403 });
		}
		await expect(load(event({ user: bob }))).rejects.toMatchObject({ status: 403 });
	});
});
