// Process-wide singletons (database, auth, encryption key), created on first use.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as env from '$app/env/private';
import { createAuth, OIDC_PROVIDER_ID, type Auth, type AuthSettings } from './auth/config.ts';
import { deriveKey } from './crypto.ts';
import { openDatabase, type Database } from './db/index.ts';
import { loadOrCreateSecret } from './secrets.ts';
import type { LoginMethods } from '../auth-shared.ts';

type App = { db: Database; auth: Auth; encryptionKey: Buffer; methods: LoginMethods };

let app: App | undefined;

function client(id?: string, secret?: string) {
	return id && secret ? { clientId: id, clientSecret: secret } : undefined;
}

function create(): App {
	const dataDir = env.DATA_DIR;
	mkdirSync(dataDir, { recursive: true });
	const { db } = openDatabase(join(dataDir, 'ev-dashboard.db'));

	const oidcClient = client(env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET);
	const settings: AuthSettings = {
		baseURL: env.APP_URL,
		secret: loadOrCreateSecret(dataDir, 'auth-secret', env.AUTH_SECRET),
		emailPassword: env.AUTH_EMAIL_PASSWORD,
		passkey: env.AUTH_PASSKEY,
		allowSignup: env.AUTH_ALLOW_SIGNUP,
		github: client(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
		google: client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
		oidc:
			oidcClient && env.OIDC_ISSUER
				? { ...oidcClient, issuer: env.OIDC_ISSUER, name: env.OIDC_NAME }
				: undefined
	};

	const social: LoginMethods['social'] = [];
	if (settings.github) social.push({ id: 'github', label: 'GitHub' });
	if (settings.google) social.push({ id: 'google', label: 'Google' });
	if (settings.oidc) social.push({ id: OIDC_PROVIDER_ID, label: settings.oidc.name });

	return {
		db,
		auth: createAuth(settings, db),
		encryptionKey: deriveKey(loadOrCreateSecret(dataDir, 'encryption-key', env.ENCRYPTION_KEY)),
		methods: {
			emailPassword: settings.emailPassword,
			passkey: settings.passkey,
			social,
			allowSignup: settings.allowSignup
		}
	};
}

export function getApp(): App {
	app ??= create();
	return app;
}
