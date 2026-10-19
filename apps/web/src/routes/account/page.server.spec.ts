import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveKey } from '#lib/server/crypto.ts';
import { openDatabase } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import { DEFAULT_PROVIDER_ID } from '#lib/server/providers/index.ts';
import type { VehicleProvider } from '#lib/server/providers/types.ts';
import { getVehicleApiCredentials } from '#lib/server/vehicle-api.ts';
import { createInvitations } from '#lib/server/auth/invitations.ts';
import type { Mail, Mailer } from '#lib/server/mail/mailer.ts';
import { createVehicleService, type VehicleService } from '#lib/server/vehicles/service.ts';

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
	state.app = { db, encryptionKey: key, methods: { passkey: true }, vehicles };
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

describe('account page: invitations and mail', () => {
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
		state.app = {
			...(state.app as object),
			methods: { passkey: true, mail: true },
			mailer,
			invitations: createInvitations(db),
			appUrl: 'https://ev.example.com'
		};
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
		const data = await load(event({ user: bob }));
		expect(data.mailInfo).toBeNull();
		expect(data.invitations).toBeNull();
		expect(data.mail).toBe(true);
		expect(data.signin).toEqual({
			email: 'bob@example.com',
			emailVerified: false,
			hasPassword: false
		});
	});
});
