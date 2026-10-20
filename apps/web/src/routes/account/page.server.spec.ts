import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveKey } from '#lib/server/crypto.ts';
import { openDatabase } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import { createNotifier } from '#lib/server/push/notifier.ts';
import { newVapidScalar, vapidKeys } from '#lib/server/push/webpush.ts';
import { DEFAULT_PROVIDER_ID } from '#lib/server/providers/index.ts';
import type { VehicleProvider } from '#lib/server/providers/types.ts';
import { getVehicleApiCredentials } from '#lib/server/vehicle-api.ts';
import { createVehicleService, type VehicleService } from '#lib/server/vehicles/service.ts';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('$app/env/private', () => ({ POLL_INTERVAL_SECONDS: 300 }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { actions, load } = await import('./+page.server.ts');

const SECRET = 'very-secret-client-secret-value';
const alice = { id: 'u-alice', name: 'Alice', email: 'alice@example.com', role: 'admin' };
const bob = { id: 'u-bob', name: 'Bob', email: 'bob@example.com', role: 'user' };

function formRequest(fields: Record<string, string>) {
	return new Request('http://localhost/account', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
}

// Only the parts of the request event the account page uses.
type Event = Parameters<typeof load>[0];
const event = (locals: Partial<App.Locals>, request?: Request) =>
	({ locals: { locale: 'de', ...locals }, request }) as unknown as Event;

let db: ReturnType<typeof openDatabase>['db'];
let vehicles: VehicleService;
const key = deriveKey('k'.repeat(43));

// Stand-in for the real provider module: no network.
const provider: VehicleProvider = {
	id: DEFAULT_PROVIDER_ID,
	authorizeUrl: ({ state }) => `https://provider.example/authorize?state=${state}`,
	exchangeCode: async () => ({
		accessToken: 'ACCESS-TOKEN',
		refreshToken: 'REFRESH-TOKEN',
		expiresAt: new Date(Date.now() + 3600_000)
	}),
	refresh: async () => {
		throw new Error('not used');
	},
	listVehicles: async () => [],
	fetchSnapshot: async () => ({ data: {}, raw: {}, vehicles: [] })
};

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	vehicles = createVehicleService({
		db,
		key,
		providers: new Map([[provider.id, provider]]),
		appUrl: 'https://ev.example.com',
		pollIntervalMs: 300_000,
		log: () => {}
	});
	const notifier = createNotifier({
		db,
		keys: vapidKeys(newVapidScalar()),
		subject: 'https://ev.example.com'
	});
	state.app = { db, encryptionKey: key, methods: { passkey: true }, notifier, vehicles };
	const now = new Date();
	await db.insert(user).values([
		{ ...alice, emailVerified: false, createdAt: now, updatedAt: now },
		{ ...bob, emailVerified: false, createdAt: now, updatedAt: now }
	]);
});

async function save(locals: Partial<App.Locals>, fields: Record<string, string>) {
	return actions.saveVehicleApi(event(locals, formRequest(fields)) as never);
}

describe('account page: vehicle API credentials', () => {
	it('stores the credentials encrypted and never returns the secret to the page', async () => {
		await save({ user: alice }, { clientId: '  my-client  ', clientSecret: SECRET });

		const data = await load(event({ user: alice }));
		expect(data.vehicleApi).toMatchObject({ configured: true, clientId: 'my-client' });
		expect(JSON.stringify(data)).not.toContain(SECRET);
		expect(Object.keys(data.vehicleApi)).not.toContain('clientSecret');

		// The server can still read it back for the provider.
		expect(await getVehicleApiCredentials(db, key, alice.id)).toEqual({
			clientId: 'my-client',
			clientSecret: SECRET
		});
	});

	it('keeps entries per user', async () => {
		await save({ user: alice }, { clientId: 'alice-id', clientSecret: SECRET });
		const data = await load(event({ user: bob }));
		expect(data.vehicleApi).toEqual({ configured: false });
	});

	it('validates input', async () => {
		const result = await save({ user: alice }, { clientId: ' ', clientSecret: SECRET });
		expect(result).toMatchObject({ status: 400, data: { vehicleError: 'required' } });
		const tooLong = await save(
			{ user: alice },
			{ clientId: 'x'.repeat(300), clientSecret: SECRET }
		);
		expect(tooLong).toMatchObject({ status: 400, data: { vehicleError: 'tooLong' } });
	});

	it('deletes the entry', async () => {
		await save({ user: alice }, { clientId: 'alice-id', clientSecret: SECRET });
		await actions.deleteVehicleApi(event({ user: alice }) as never);
		expect((await load(event({ user: alice }))).vehicleApi).toEqual({ configured: false });
	});

	it('rejects anonymous requests', async () => {
		await expect(save({}, { clientId: 'a', clientSecret: 'b' })).rejects.toMatchObject({
			status: 401
		});
		await expect(load(event({}))).rejects.toMatchObject({ status: 401 });
	});
});

async function connectAlice() {
	await save({ user: alice }, { clientId: 'alice-id', clientSecret: SECRET });
	const start = await vehicles.startAuthorization(alice.id, DEFAULT_PROVIDER_ID);
	if (!start.ok) throw new Error(start.error);
	const result = await vehicles.completeAuthorization(alice.id, DEFAULT_PROVIDER_ID, {
		state: new URL(start.url).searchParams.get('state'),
		code: 'code',
		error: null
	});
	if (!result.ok) throw new Error(result.error);
	return result.connectionId;
}

describe('account page: vehicle connections', () => {
	it('shows the redirect URI and connections without tokens', async () => {
		const id = await connectAlice();
		const data = await load(event({ user: alice }));
		expect(data.redirectUri).toBe('https://ev.example.com/api/providers/connect-query/callback');
		expect(data.connections).toHaveLength(1);
		expect(data.connections[0]).toMatchObject({ id, status: 'active' });
		const text = JSON.stringify(data);
		expect(text).not.toContain('ACCESS-TOKEN');
		expect(text).not.toContain('REFRESH-TOKEN');
		expect(text).not.toContain(SECRET);
	});

	it('starts the authorization with a redirect to the provider', async () => {
		const missing = await actions.connectVehicle(event({ user: alice }) as never);
		expect(missing).toMatchObject({ status: 400, data: { connectError: 'missing_credentials' } });

		await save({ user: alice }, { clientId: 'alice-id', clientSecret: SECRET });
		await expect(actions.connectVehicle(event({ user: alice }) as never)).rejects.toMatchObject({
			status: 303,
			location: expect.stringMatching(/^https:\/\/provider\.example\/authorize\?state=[\w-]{43}$/)
		});
	});

	it('lets only the owner fetch or disconnect', async () => {
		const id = await connectAlice();
		await expect(
			actions.fetchNow(event({ user: bob }, formRequest({ connectionId: id })) as never)
		).rejects.toMatchObject({ status: 404 });
		await expect(
			actions.disconnect(
				event({ user: bob }, formRequest({ connectionId: id, confirm: 'yes' })) as never
			)
		).rejects.toMatchObject({ status: 404 });
		expect(await vehicles.listConnections(alice.id)).toHaveLength(1);

		const fetched = await actions.fetchNow(
			event({ user: alice }, formRequest({ connectionId: id })) as never
		);
		expect(fetched).toEqual({ fetchResult: { id, ok: true } });
	});

	it('disconnects only after confirmation', async () => {
		const id = await connectAlice();
		const unconfirmed = await actions.disconnect(
			event({ user: alice }, formRequest({ connectionId: id })) as never
		);
		expect(unconfirmed).toMatchObject({ status: 400 });
		expect(await vehicles.listConnections(alice.id)).toHaveLength(1);

		const done = await actions.disconnect(
			event({ user: alice }, formRequest({ connectionId: id, confirm: 'yes' })) as never
		);
		expect(done).toEqual({ disconnected: true });
		expect(await vehicles.listConnections(alice.id)).toHaveLength(0);
	});

	it('rejects anonymous requests', async () => {
		await expect(actions.connectVehicle(event({}) as never)).rejects.toMatchObject({
			status: 401
		});
		await expect(
			actions.disconnect(event({}, formRequest({ connectionId: 'x', confirm: 'yes' })) as never)
		).rejects.toMatchObject({ status: 401 });
	});
});

describe('account page: sign-in card', () => {
	it('shows the address and its state', async () => {
		const data = await load(event({ user: bob }));
		expect(data.signin).toEqual({
			email: 'bob@example.com',
			emailVerified: false,
			hasPassword: false
		});
		expect(data).not.toHaveProperty('invitations');
	});
});

describe('account page: notifications', () => {
	it('shows the public push key, the choice and the devices', async () => {
		const data = await load(event({ user: alice }));
		expect(data.notifications.publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/);
		expect(data.notifications.devices).toEqual([]);
		expect(data.notifications.prefs.lowChargePct).toBe(20);
		expect(data.notifications.pollMinutes).toBe(5);
	});
});
