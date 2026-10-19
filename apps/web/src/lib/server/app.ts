// Process-wide singletons (database, auth, encryption key), created on first use.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as env from '$app/env/private';
import { createAuth, OIDC_PROVIDER_ID, type Auth, type AuthSettings } from './auth/config.ts';
import { deriveKey } from './crypto.ts';
import { openDatabase, type Database } from './db/index.ts';
import { createTemplateStore, type TemplateStore } from './export/templates.ts';
import { createGeocoder, type Geocoder } from './geocode.ts';
import { createProviders } from './providers/index.ts';
import { loadOrCreateSecret } from './secrets.ts';
import { createLogbook, type Logbook } from './vehicles/logbook.ts';
import { createPoller, type Poller } from './vehicles/poller.ts';
import { createVehicleService, type VehicleService } from './vehicles/service.ts';
import type { LoginMethods } from '../auth-shared.ts';

type App = {
	db: Database;
	auth: Auth;
	encryptionKey: Buffer;
	methods: LoginMethods;
	vehicles: VehicleService;
	logbook: Logbook;
	templates: TemplateStore;
	/** Absent when GEOCODING_ENABLED is false. */
	geocoder?: Geocoder;
};

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

	const encryptionKey = deriveKey(
		loadOrCreateSecret(dataDir, 'encryption-key', env.ENCRYPTION_KEY)
	);

	const vehicles = createVehicleService({
		db,
		key: encryptionKey,
		providers: createProviders(),
		appUrl: env.APP_URL,
		pollIntervalMs: env.POLL_INTERVAL_SECONDS * 1000
	});

	return {
		db,
		auth: createAuth(settings, db),
		encryptionKey,
		vehicles,
		logbook: createLogbook({ db, maxGapMs: vehicles.staleAfterMs }),
		templates: createTemplateStore(db),
		geocoder: env.GEOCODING_ENABLED
			? createGeocoder({
					baseUrl: env.GEOCODING_URL,
					userAgent: `ev-dashboard/${env.APP_VERSION} (+${env.APP_URL})`
				})
			: undefined,
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

/** How often the poller looks for due connections (each has its own schedule). */
const POLLER_PERIOD_MS = 30_000;
const PRUNE_EVERY_MS = 24 * 3600 * 1000;

// On globalThis so a dev-server reload does not start a second loop.
const POLLER_KEY = Symbol.for('ev-dashboard.vehicle-poller');
type PollerGlobal = typeof globalThis & { [POLLER_KEY]?: Poller };

/** Starts the vehicle data poller once per process and stops it on shutdown. */
export function startVehiclePoller() {
	const g = globalThis as PollerGlobal;
	if (g[POLLER_KEY]) return;
	const { vehicles, logbook } = getApp();
	let lastPrune = 0;
	const poller = createPoller({
		periodMs: POLLER_PERIOD_MS,
		initialDelayMs: 5_000,
		tick: async () => {
			await vehicles.pollDue();
			// Finished trips are copied into the trip log before pruning can remove them.
			await logbook.recordAll();
			if (Date.now() - lastPrune >= PRUNE_EVERY_MS) {
				lastPrune = Date.now();
				await vehicles.prune(env.RETENTION_DAYS);
			}
		},
		onError: (error) => console.error('[vehicles] poller run failed:', (error as Error)?.name)
	});
	g[POLLER_KEY] = poller;
	poller.start();

	const shutdown = () => {
		vehicles.stop();
		void poller.stop();
	};
	// Emitted by adapter-node after the HTTP server closed (SIGTERM/SIGINT).
	(process as NodeJS.EventEmitter).once('sveltekit:shutdown', shutdown);
}
