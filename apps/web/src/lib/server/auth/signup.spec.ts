import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.ts';
import { createAuth, countUsers, type AuthSettings } from './config.ts';

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
