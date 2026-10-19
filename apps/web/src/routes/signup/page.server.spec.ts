import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '#lib/server/auth/config.ts';
import { createInvitations, type Invitations } from '#lib/server/auth/invitations.ts';
import { openDatabase } from '#lib/server/db/index.ts';
import type { Mailer } from '#lib/server/mail/mailer.ts';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { actions, load } = await import('./+page.server.ts');

const PASSWORD = 'correct horse battery';
let auth: ReturnType<typeof createAuth>;
let invitations: Invitations;
let methods: { emailPassword: boolean; allowSignup: boolean };
const sent: unknown[] = [];

beforeEach(async () => {
	const { db } = openDatabase(':memory:');
	sent.length = 0;
	const mailer: Mailer = {
		info: { host: 'smtp.example.com', port: 587, from: 'ev@example.com' },
		send: async (mail) => {
			sent.push(mail);
		}
	};
	auth = createAuth(
		{
			baseURL: 'http://localhost:3000',
			secret: 'test-secret-test-secret-test-secret-123',
			emailPassword: true,
			passkey: false,
			allowSignup: false,
			rateLimit: false,
			mailer
		},
		db
	);
	invitations = createInvitations(db);
	methods = { emailPassword: true, allowSignup: false };
	state.app = { db, auth, invitations, methods };
	await auth.api.signUpEmail({
		body: { name: 'Admin', email: 'admin@example.com', password: PASSWORD }
	});
});

const adminId = async () =>
	(await auth.api.signInEmail({ body: { email: 'admin@example.com', password: PASSWORD } })).user
		.id;

type LoadEvent = Parameters<typeof load>[0];
const loadAt = (search: string) =>
	load({
		locals: {},
		url: new URL(`http://localhost:3000/signup${search}`)
	} as unknown as LoadEvent) as Promise<Record<string, unknown>>;

function submit(fields: Record<string, string>) {
	const cookies = { set: vi.fn() };
	const request = new Request('http://localhost:3000/signup?/invite', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
	return {
		cookies,
		result: actions.invite({ request, cookies } as never) as Promise<unknown>
	};
}

describe('sign-up page with an invitation', () => {
	it('shows the invitation while registration is closed', async () => {
		const invite = await invitations.create(await adminId(), 'carla@example.com');
		expect(await loadAt(`?invite=${invite.token}`)).toMatchObject({
			invite: { email: 'carla@example.com', inviter: 'Admin' },
			inviteInvalid: false
		});
		expect(await loadAt('?invite=nope')).toMatchObject({ invite: null, inviteInvalid: true });
		await expect(loadAt('')).rejects.toMatchObject({ status: 303, location: '/login' });
	});

	it('creates a confirmed account, signs it in and uses up the invitation', async () => {
		const invite = await invitations.create(await adminId(), 'carla@example.com');
		const { result, cookies } = submit({ token: invite.token, name: 'Carla', password: PASSWORD });
		await expect(result).rejects.toMatchObject({ status: 303, location: '/' });
		expect(cookies.set).toHaveBeenCalledWith(
			expect.stringContaining('session_token'),
			expect.any(String),
			expect.objectContaining({ path: '/' })
		);
		expect(sent).toEqual([]);
		const { user } = await auth.api.signInEmail({
			body: { email: 'carla@example.com', password: PASSWORD }
		});
		expect(user).toMatchObject({ name: 'Carla', emailVerified: true, role: 'user' });
		expect(await invitations.find(invite.token)).toBeUndefined();
	});

	it('refuses unknown invitations and short passwords', async () => {
		expect(await submit({ token: 'nope', password: PASSWORD }).result).toMatchObject({
			status: 400,
			data: { code: 'INVITE_INVALID' }
		});
		const invite = await invitations.create(await adminId(), 'carla@example.com');
		expect(await submit({ token: invite.token, password: 'short' }).result).toMatchObject({
			status: 400,
			data: { code: 'PASSWORD_TOO_SHORT' }
		});
		expect(await invitations.find(invite.token)).toBeDefined();
	});
});
