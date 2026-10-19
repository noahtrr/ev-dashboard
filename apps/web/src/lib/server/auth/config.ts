import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { genericOAuth } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { count } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { MIN_PASSWORD_LENGTH } from '../../auth-shared.ts';
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
};

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

	return betterAuth({
		appName: 'EV Dashboard',
		baseURL: settings.baseURL,
		secret: settings.secret,
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		emailAndPassword: {
			enabled: settings.emailPassword,
			autoSignIn: true,
			minPasswordLength: MIN_PASSWORD_LENGTH
		},
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
			additionalFields: {
				role: { type: 'string', required: true, defaultValue: 'user', input: false }
			}
		},
		databaseHooks: {
			user: {
				create: {
					// Runs for every new user, whatever the method (email, social, SSO).
					before: async (user) => {
						const decision = decideSignup(await countUsers(db), settings.allowSignup);
						if (!decision.allowed) {
							throw new APIError('FORBIDDEN', {
								code: 'SIGNUP_DISABLED',
								message: 'Registration is disabled on this instance'
							});
						}
						return { data: { ...user, role: decision.role } };
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
				'/passkey/*': { window: 60, max: 20 }
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
