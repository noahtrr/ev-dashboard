import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/index.ts';
import type { Mail, Mailer } from '../mail/mailer.ts';
import { createAuth, countUsers, type AuthSettings } from './config.ts';
import { invitationContext } from './invitations.ts';

function setup(overrides: Partial<AuthSettings> = {}) {
	const { db } = openDatabase(':memory:');
	const auth = createAuth(
		{
			baseURL: 'http://localhost:3000',
			secret: 'test-secret-test-secret-test-secret-123',
			emailPassword: true,
			passkey: true,
			allowSignup: false,
			rateLimit: false,
			...overrides
		},
		db
	);
	const signUp = (email: string) =>
		auth.api.signUpEmail({ body: { name: email, email, password: 'correct horse battery' } });
	return { auth, db, signUp };
}

describe('sign-up policy (Better Auth integration)', () => {
	it('makes the very first account admin', async () => {
		const { signUp } = setup();
		const { user } = await signUp('first@example.com');
		expect(user.role).toBe('admin');
	});

	it('refuses a second account by default', async () => {
		const { signUp, db } = setup();
		await signUp('first@example.com');
		await expect(signUp('second@example.com')).rejects.toMatchObject({
			body: { code: 'SIGNUP_DISABLED' }
		});
		expect(await countUsers(db)).toBe(1);
	});

	it('allows further regular accounts with AUTH_ALLOW_SIGNUP', async () => {
		const { signUp } = setup({ allowSignup: true });
		await signUp('first@example.com');
		const { user } = await signUp('second@example.com');
		expect(user.role).toBe('user');
	});

	it('ignores a role sent by the client', async () => {
		const { auth, signUp } = setup({ allowSignup: true });
		await signUp('first@example.com');
		const { user } = (await auth.api.signUpEmail({
			body: { name: 'x', email: 'x@example.com', password: 'correct horse battery', role: 'admin' }
		} as never)) as unknown as Awaited<ReturnType<typeof signUp>>;
		expect(user.role).toBe('user');
	});

	it('lets the admin sign in afterwards', async () => {
		const { auth, signUp } = setup();
		await signUp('first@example.com');
		const result = await auth.api.signInEmail({
			body: { email: 'first@example.com', password: 'correct horse battery' }
		});
		expect(result.user.email).toBe('first@example.com');
		await expect(
			auth.api.signInEmail({ body: { email: 'first@example.com', password: 'wrong password' } })
		).rejects.toMatchObject({ body: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
	});
});

describe('email confirmation, password reset and invitations (with a mail server)', () => {
	function withMail(overrides: Partial<AuthSettings> = {}) {
		const sent: Mail[] = [];
		const mailer: Mailer = {
			info: { host: 'smtp.example.com', port: 587, from: 'ev@example.com' },
			send: async (mail) => {
				sent.push(mail);
			}
		};
		const ctx = setup({ mailer, ...overrides });
		const tokenOf = (mail: Mail) => {
			const link = /https?:\/\/\S+/.exec(mail.text)?.[0] ?? '';
			const url = new URL(link);
			return url.searchParams.get('token') ?? url.pathname.split('/').pop()!;
		};
		return { ...ctx, sent, mailer, tokenOf };
	}
	const signIn = (auth: ReturnType<typeof setup>['auth'], email: string, password: string) =>
		auth.api.signInEmail({ body: { email, password } });

	it('confirms the first admin right away, without a mail', async () => {
		const { auth, signUp, sent } = withMail();
		const { user } = await signUp('first@example.com');
		expect(user).toMatchObject({ role: 'admin', emailVerified: true });
		expect(sent).toEqual([]);
		await expect(signIn(auth, 'first@example.com', 'correct horse battery')).resolves.toBeDefined();
	});

	it('requires new accounts to confirm their address', async () => {
		const { auth, signUp, sent, tokenOf } = withMail({ allowSignup: true });
		await signUp('first@example.com');
		const result = await signUp('second@example.com');
		expect(result.token).toBeNull();
		expect(result.user.emailVerified).toBe(false);
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ to: 'second@example.com' });
		expect(sent[0].subject).toMatch(/E-Mail-Adresse|email address/i);

		await expect(signIn(auth, 'second@example.com', 'correct horse battery')).rejects.toMatchObject(
			{
				body: { code: 'EMAIL_NOT_VERIFIED' }
			}
		);

		await auth.api.verifyEmail({ query: { token: tokenOf(sent[0]) } });
		await expect(
			signIn(auth, 'second@example.com', 'correct horse battery')
		).resolves.toMatchObject({ user: { emailVerified: true } });
	});

	it('lets an invited address sign up while registration is closed', async () => {
		const { auth, signUp, sent } = withMail();
		await signUp('first@example.com');
		const { user } = await invitationContext.run({ id: 'i1', email: 'carla@example.com' }, () =>
			signUp('Carla@example.com')
		);
		expect(user).toMatchObject({ role: 'user', emailVerified: true });
		expect(sent).toEqual([]);
		await expect(signIn(auth, 'carla@example.com', 'correct horse battery')).resolves.toBeDefined();
	});

	it('does not open registration for another address than the invited one', async () => {
		const { signUp, db } = withMail();
		await signUp('first@example.com');
		// With confirmation on, the answer looks like a sign-up so it reveals no addresses.
		const result = await invitationContext.run({ id: 'i1', email: 'carla@example.com' }, () =>
			signUp('mallory@example.com')
		);
		expect(result.token).toBeNull();
		expect(await countUsers(db)).toBe(1);
	});

	it('resets a password by mail', async () => {
		const { auth, signUp, sent, tokenOf } = withMail();
		await signUp('first@example.com');
		await auth.api.requestPasswordReset({
			body: { email: 'first@example.com', redirectTo: '/reset-password' }
		});
		expect(sent).toHaveLength(1);
		expect(sent[0].text).toContain('/reset-password');
		await auth.api.resetPassword({
			body: { token: tokenOf(sent[0]), newPassword: 'a brand new password' }
		});
		await expect(signIn(auth, 'first@example.com', 'a brand new password')).resolves.toBeDefined();
		await expect(signIn(auth, 'first@example.com', 'correct horse battery')).rejects.toMatchObject({
			body: { code: 'INVALID_EMAIL_OR_PASSWORD' }
		});
	});

	it('keeps quiet about unknown addresses and failing mail servers', async () => {
		const { auth, signUp, sent, mailer } = withMail();
		await signUp('first@example.com');
		await auth.api.requestPasswordReset({ body: { email: 'nobody@example.com' } });
		expect(sent).toEqual([]);

		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mailer.send = async () => {
			throw new Error('connection refused');
		};
		await expect(
			auth.api.requestPasswordReset({ body: { email: 'first@example.com' } })
		).resolves.toBeDefined();
		expect(log).toHaveBeenCalledWith('[mail] sending the reset mail failed:', 'connection refused');
		log.mockRestore();
	});

	it('needs no confirmation without a mail server', async () => {
		const { auth, signUp } = setup({ allowSignup: true });
		await signUp('first@example.com');
		const result = await signUp('second@example.com');
		expect(result.token).toBeTruthy();
		await expect(
			signIn(auth, 'second@example.com', 'correct horse battery')
		).resolves.toBeDefined();
	});
});
