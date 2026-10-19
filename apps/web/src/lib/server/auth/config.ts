import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { genericOAuth } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { count, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import type { Mailer } from '../mail/mailer.ts';
import { renderMail, type MailKind } from '../mail/templates.ts';
import { MIN_PASSWORD_LENGTH } from '../../auth-shared.ts';
import { pickLocale } from '../../i18n.ts';
import { invitationContext, normalizeEmail } from './invitations.ts';
import { decideSignup } from './policy.ts';

type OAuthClient = { clientId: string; clientSecret: string };

export type AuthSettings = {
	/** Public origin, e.g. https://ev.example.com */
	baseURL: string;
	secret: string;
	emailPassword: boolean;
	passkey: boolean;
	allowSignup: boolean;
	github?: OAuthClient;
	google?: OAuthClient;
	oidc?: OAuthClient & { issuer: string; name: string };
	/** Better Auth only rate-limits in production by default; we always do. */
	rateLimit?: boolean;
	/** With a mailer, password reset works and new addresses must be confirmed. */
	mailer?: Mailer;
};

/** Link validity: password reset one hour, email confirmation 24 hours. */
export const RESET_TOKEN_SECONDS = 3600;
export const VERIFY_TOKEN_SECONDS = 24 * 3600;

/** Provider ID of the generic OIDC provider; part of its callback URL. */
export const OIDC_PROVIDER_ID = 'oidc';

export async function countUsers(db: Database) {
	const [row] = await db.select({ n: count() }).from(schema.user);
	return row?.n ?? 0;
}

export function createAuth(settings: AuthSettings, db: Database) {
	const passkeyPlugin = passkey({
		rpID: new URL(settings.baseURL).hostname,
		rpName: 'EV Dashboard',
		origin: settings.baseURL
	});
	const oidcPlugin =
		settings.oidc &&
		genericOAuth({
			config: [
				{
					providerId: OIDC_PROVIDER_ID,
					discoveryUrl: `${settings.oidc.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
					clientId: settings.oidc.clientId,
					clientSecret: settings.oidc.clientSecret,
					scopes: ['openid', 'email', 'profile'],
					pkce: true
				}
			]
		});

	const { mailer } = settings;
	/** Sends a mail in the language of the request; failures are logged, not shown. */
	async function mail(
		kind: MailKind,
		to: { email: string; name?: string },
		url: string,
		request?: Request
	) {
		if (!mailer) return;
		try {
			await mailer.send(
				renderMail({
					kind,
					locale: pickLocale(request?.headers.get('accept-language')),
					to: to.email,
					name: to.name,
					url,
					appUrl: settings.baseURL
				})
			);
		} catch (error) {
			console.error(`[mail] sending the ${kind} mail failed:`, (error as Error)?.message);
		}
	}

	return betterAuth({
		appName: 'EV Dashboard',
		baseURL: settings.baseURL,
		secret: settings.secret,
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		emailAndPassword: {
			enabled: settings.emailPassword,
			autoSignIn: true,
			minPasswordLength: MIN_PASSWORD_LENGTH,
			// Without mail nobody could confirm an address, so it is only required with one.
			requireEmailVerification: mailer !== undefined,
			resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
			revokeSessionsOnPasswordReset: true,
			...(mailer && {
				sendResetPassword: ({ user, url }, request) =>
					mail('reset', { email: user.email, name: user.name }, url, request)
			})
		},
		...(mailer && {
			emailVerification: {
				sendOnSignUp: true,
				sendOnSignIn: true,
				autoSignInAfterVerification: true,
				expiresIn: VERIFY_TOKEN_SECONDS,
				sendVerificationEmail: async ({ user, url }, request) => {
					// A changed address gets the mail at the new address before it is stored.
					const [stored] = await db
						.select({ email: schema.user.email })
						.from(schema.user)
						.where(eq(schema.user.id, user.id));
					const kind = stored && stored.email !== user.email ? 'changeEmail' : 'verify';
					// Invited accounts and the first admin are confirmed already.
					if (kind === 'verify' && user.emailVerified) return;
					await mail(kind, { email: user.email, name: user.name }, url, request);
				}
			}
		}),
		account: {
			// Signing in with GitHub, Google or SSO links to the existing account with the same
			// email, but only when the provider reports that email as verified.
			accountLinking: { enabled: true }
		},
		socialProviders: {
			...(settings.github && { github: settings.github }),
			...(settings.google && { google: settings.google })
		},
		user: {
			// The new address only replaces the old one once its link was opened.
			changeEmail: { enabled: mailer !== undefined },
			additionalFields: {
				role: { type: 'string', required: true, defaultValue: 'user', input: false }
			}
		},
		databaseHooks: {
			user: {
				create: {
					// Runs for every new user, whatever the method (email, social, SSO).
					before: async (user) => {
						// An invitation for exactly this address opens registration and confirms it.
						const invited = invitationContext.getStore();
						const viaInvite = invited !== undefined && invited.email === normalizeEmail(user.email);
						const decision = decideSignup(await countUsers(db), settings.allowSignup || viaInvite);
						if (!decision.allowed) {
							throw new APIError('FORBIDDEN', {
								code: 'SIGNUP_DISABLED',
								message: 'Registration is disabled on this instance'
							});
						}
						// The first account is created during setup, maybe before mail works.
						const verified = user.emailVerified || viaInvite || decision.role === 'admin';
						return { data: { ...user, emailVerified: verified, role: decision.role } };
					}
				}
			}
		},
		rateLimit: {
			enabled: settings.rateLimit ?? true,
			window: 60,
			max: 100,
			customRules: {
				'/sign-in/*': { window: 60, max: 10 },
				'/sign-up/*': { window: 60, max: 5 },
				'/passkey/*': { window: 60, max: 20 },
				'/request-password-reset': { window: 60, max: 3 },
				'/send-verification-email': { window: 60, max: 3 },
				'/change-email': { window: 60, max: 3 }
			}
		},
		advanced: {
			// Caddy sets X-Real-IP to the client address; X-Forwarded-For covers other setups.
			ipAddress: { ipAddressHeaders: ['x-real-ip', 'x-forwarded-for'] }
		},
		telemetry: { enabled: false },
		plugins: [...(settings.passkey ? [passkeyPlugin] : []), ...(oidcPlugin ? [oidcPlugin] : [])]
	});
}

export type Auth = ReturnType<typeof createAuth>;
