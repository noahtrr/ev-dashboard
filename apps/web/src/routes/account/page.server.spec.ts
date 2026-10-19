import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveKey } from '#lib/server/crypto.ts';
import { openDatabase } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import { getVehicleApiCredentials } from '#lib/server/vehicle-api.ts';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
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
const key = deriveKey('k'.repeat(43));

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	state.app = { db, encryptionKey: key, methods: { passkey: true } };
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
