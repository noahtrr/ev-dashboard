import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { decrypt, deriveKey } from '../crypto.ts';
import { openDatabase } from '../db/index.ts';
import { providerOAuthState, snapshot, user, vehicleConnection } from '../db/schema.ts';
import { ProviderError, type ProviderSnapshot, type VehicleProvider } from '../providers/types.ts';
import { saveVehicleApiCredentials } from '../vehicle-api.ts';
import {
	backoffMs,
	createVehicleService,
	MAX_BACKOFF_MS,
	STATE_TTL_MS,
	type VehicleService
} from './service.ts';

const key = deriveKey('k'.repeat(43));
const PROVIDER = 'mock';
const INTERVAL = 300_000;

const snapshotResult = (soc = 50): ProviderSnapshot => ({
	data: { stateOfChargePct: soc },
	raw: { telemetry: { status: 200, body: { soc } } },
	vehicles: [{ id: 'VIN1', name: 'My car' }]
});

function mockProvider() {
	return {
		id: PROVIDER,
		authorizeUrl: vi.fn<VehicleProvider['authorizeUrl']>(
			({ clientId, state, redirectUri }) =>
				`https://auth.example/authorize?client_id=${clientId}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`
		),
		exchangeCode: vi.fn<VehicleProvider['exchangeCode']>(async () => ({
			accessToken: 'access-1',
			refreshToken: 'refresh-1',
			expiresAt: new Date(clock.t + 3600_000)
		})),
		refresh: vi.fn<VehicleProvider['refresh']>(async () => ({
			accessToken: 'access-2',
			expiresAt: new Date(clock.t + 3600_000)
		})),
		listVehicles: vi.fn<VehicleProvider['listVehicles']>(async () => []),
		fetchSnapshot: vi.fn<VehicleProvider['fetchSnapshot']>(async () => snapshotResult())
	} satisfies VehicleProvider;
}

const clock = { t: Date.UTC(2026, 9, 18, 12, 0, 0) };
let db: ReturnType<typeof openDatabase>['db'];
let provider: ReturnType<typeof mockProvider>;
let service: VehicleService;
const logs: string[] = [];

beforeEach(async () => {
	clock.t = Date.UTC(2026, 9, 18, 12, 0, 0);
	db = openDatabase(':memory:').db;
	provider = mockProvider();
	logs.length = 0;
	service = createVehicleService({
		db,
		key,
		providers: new Map([[PROVIDER, provider]]),
		appUrl: 'https://ev.example.com',
		pollIntervalMs: INTERVAL,
		now: () => clock.t,
		random: () => 0.5,
		log: (m) => logs.push(m)
	});
	const now = new Date(clock.t);
	await db.insert(user).values(
		['alice', 'bob'].map((id) => ({
			id,
			name: id,
			email: `${id}@example.com`,
			emailVerified: false,
			createdAt: now,
			updatedAt: now
		}))
	);
	await saveVehicleApiCredentials(db, key, 'alice', {
		clientId: 'alice-client',
		clientSecret: 'alice-secret'
	});
});

async function startState(userId = 'alice') {
	const result = await service.startAuthorization(userId, PROVIDER);
	if (!result.ok) throw new Error(result.error);
	return new URL(result.url).searchParams.get('state')!;
}

async function connect(userId = 'alice') {
	const state = await startState(userId);
	const result = await service.completeAuthorization(userId, PROVIDER, {
		state,
		code: 'code-1',
		error: null
	});
	if (!result.ok) throw new Error(result.error);
	return result.connectionId;
}

const row = async (id: string) =>
	(await db.query.vehicleConnection.findFirst({ where: eq(vehicleConnection.id, id) }))!;

describe('authorization state', () => {
	it('builds the authorize URL with the redirect URI and a random state', async () => {
		const result = await service.startAuthorization('alice', PROVIDER);
		expect(result.ok).toBe(true);
		const url = new URL((result as { url: string }).url);
		expect(url.searchParams.get('client_id')).toBe('alice-client');
		expect(url.searchParams.get('redirect_uri')).toBe(
			'https://ev.example.com/api/providers/mock/callback'
		);
		expect(url.searchParams.get('state')).toMatch(/^[\w-]{43}$/);
		// Only a hash is stored.
		const [stored] = await db.select().from(providerOAuthState);
		expect(stored.stateHash).not.toBe(url.searchParams.get('state'));
	});

	it('requires saved credentials and a known provider', async () => {
		expect(await service.startAuthorization('bob', PROVIDER)).toEqual({
			ok: false,
			error: 'missing_credentials'
		});
		expect(await service.startAuthorization('alice', 'nope')).toEqual({
			ok: false,
			error: 'unknown_provider'
		});
	});

	it('is single-use', async () => {
		const state = await startState();
		const params = { state, code: 'c', error: null };
		expect((await service.completeAuthorization('alice', PROVIDER, params)).ok).toBe(true);
		expect(await service.completeAuthorization('alice', PROVIDER, params)).toEqual({
			ok: false,
			error: 'state'
		});
	});

	it('is bound to the user who started it and is consumed by a foreign attempt', async () => {
		const state = await startState();
		expect(
			await service.completeAuthorization('bob', PROVIDER, { state, code: 'c', error: null })
		).toEqual({ ok: false, error: 'state' });
		expect(
			await service.completeAuthorization('alice', PROVIDER, { state, code: 'c', error: null })
		).toEqual({ ok: false, error: 'state' });
		expect(provider.exchangeCode).not.toHaveBeenCalled();
	});

	it('expires', async () => {
		const state = await startState();
		clock.t += STATE_TTL_MS + 1;
		expect(
			await service.completeAuthorization('alice', PROVIDER, { state, code: 'c', error: null })
		).toEqual({ ok: false, error: 'state' });
	});

	it('rejects missing or unknown states and reports a denied consent', async () => {
		for (const state of [null, '', 'forged', 'x'.repeat(500)]) {
			expect(
				await service.completeAuthorization('alice', PROVIDER, { state, code: 'c', error: null })
			).toEqual({ ok: false, error: 'state' });
		}
		const state = await startState();
		expect(
			await service.completeAuthorization('alice', PROVIDER, {
				state,
				code: null,
				error: 'access_denied'
			})
		).toEqual({ ok: false, error: 'denied' });
	});

	it('reports a failed code exchange without leaking details', async () => {
		provider.exchangeCode.mockRejectedValueOnce(new ProviderError('auth', 400));
		const state = await startState();
		expect(
			await service.completeAuthorization('alice', PROVIDER, { state, code: 'c', error: null })
		).toEqual({ ok: false, error: 'exchange' });
		expect(await db.select().from(vehicleConnection)).toHaveLength(0);
		expect(logs.join()).not.toContain('alice-secret');
	});
});

describe('tokens', () => {
	it('stores tokens encrypted and bound to the connection', async () => {
		const id = await connect();
		const stored = await row(id);
		expect(stored.accessToken).not.toContain('access-1');
		expect(stored.refreshToken).not.toContain('refresh-1');
		expect(decrypt(stored.accessToken, key, `${id}:access_token`)).toBe('access-1');
		expect(() => decrypt(stored.accessToken, key, `other:access_token`)).toThrow();
		expect(provider.exchangeCode).toHaveBeenCalledWith(
			expect.objectContaining({
				credentials: { clientId: 'alice-client', clientSecret: 'alice-secret' },
				code: 'code-1',
				redirectUri: 'https://ev.example.com/api/providers/mock/callback'
			}),
			expect.anything()
		);
	});

	it('uses the stored token while valid and refreshes shortly before expiry', async () => {
		const id = await connect();
		await service.pollConnection(id);
		expect(provider.refresh).not.toHaveBeenCalled();
		expect(provider.fetchSnapshot).toHaveBeenLastCalledWith('access-1', expect.anything());

		clock.t += 3600_000 - 60_000; // one minute before expiry
		await service.pollConnection(id);
		expect(provider.refresh).toHaveBeenCalledTimes(1);
		expect(provider.refresh.mock.calls[0][0]).toMatchObject({ refreshToken: 'refresh-1' });
		expect(provider.fetchSnapshot).toHaveBeenLastCalledWith('access-2', expect.anything());

		const stored = await row(id);
		expect(decrypt(stored.accessToken, key, `${id}:access_token`)).toBe('access-2');
		// The provider did not rotate the refresh token: the old one is kept.
		expect(decrypt(stored.refreshToken!, key, `${id}:refresh_token`)).toBe('refresh-1');
		expect(stored.accessTokenExpiresAt.getTime()).toBe(clock.t + 3600_000);
	});

	it('refreshes once and retries when the provider rejects a token early', async () => {
		const id = await connect();
		provider.fetchSnapshot.mockRejectedValueOnce(new ProviderError('auth', 401));
		expect(await service.pollConnection(id)).toEqual({ ok: true });
		expect(provider.refresh).toHaveBeenCalledTimes(1);
		expect(provider.fetchSnapshot).toHaveBeenCalledTimes(2);
	});

	it('marks the connection for re-authorization when the refresh is rejected', async () => {
		const id = await connect();
		clock.t += 3600_000;
		provider.refresh.mockRejectedValueOnce(new ProviderError('auth', 400));
		expect(await service.pollConnection(id)).toEqual({ ok: false, error: 'reauth' });
		expect(await row(id)).toMatchObject({ status: 'reauth', lastError: 'auth' });
		// Not polled any more.
		expect(await service.pollDue()).toBe(0);
		const [view] = await service.listConnections('alice');
		expect(view.status).toBe('reauth');
	});

	it('marks re-authorization when the credentials were deleted', async () => {
		const id = await connect();
		await db.delete((await import('../db/schema.ts')).vehicleApiCredential);
		clock.t += 3600_000;
		await service.pollConnection(id);
		expect(await row(id)).toMatchObject({ status: 'reauth', lastError: 'missing_credentials' });
	});

	it('treats a failed refresh due to a provider outage as temporary', async () => {
		const id = await connect();
		clock.t += 3600_000;
		provider.refresh.mockRejectedValueOnce(new ProviderError('http', 503));
		expect(await service.pollConnection(id)).toEqual({ ok: false, error: 'http' });
		expect(await row(id)).toMatchObject({ status: 'active', failureCount: 1 });
	});
});

describe('polling', () => {
	it('stores a snapshot and updates the connection', async () => {
		const id = await connect();
		expect(await service.pollDue()).toBe(1);
		const stored = await row(id);
		expect(stored).toMatchObject({
			label: 'My car',
			externalId: 'VIN1',
			failureCount: 0,
			lastError: null
		});
		expect(stored.lastSuccessAt?.getTime()).toBe(clock.t);
		expect(stored.nextPollAt?.getTime()).toBe(clock.t + INTERVAL);
		const latest = await service.latestSnapshot('alice', id);
		expect(latest?.data).toEqual({ stateOfChargePct: 50 });
		expect(latest?.raw.telemetry.body).toEqual({ soc: 50 });
		// Not due again until the interval passed.
		expect(await service.pollDue()).toBe(0);
		clock.t += INTERVAL;
		expect(await service.pollDue()).toBe(1);
	});

	it('stores raw responses only when they changed', async () => {
		const id = await connect();
		const garage = { status: 200, body: { vin: 'VIN1' } };
		const result = (soc: number): ProviderSnapshot => ({
			...snapshotResult(soc),
			raw: { ...snapshotResult(soc).raw, garage }
		});
		provider.fetchSnapshot.mockResolvedValueOnce(result(50));
		await service.pollConnection(id);
		clock.t += INTERVAL;
		provider.fetchSnapshot.mockResolvedValueOnce(result(50));
		await service.pollConnection(id);
		clock.t += INTERVAL;
		provider.fetchSnapshot.mockResolvedValueOnce(result(40));
		await service.pollConnection(id);

		const rows = await db
			.select({ raw: snapshot.raw })
			.from(snapshot)
			.where(eq(snapshot.connectionId, id))
			.orderBy(snapshot.fetchedAt);
		expect(rows.map((r) => Object.keys(JSON.parse(r.raw)).sort())).toEqual([
			['garage', 'telemetry'],
			[],
			['telemetry']
		]);
		const latest = await service.latestSnapshot('alice', id);
		expect(latest?.data).toEqual({ stateOfChargePct: 40 });
		expect(latest?.raw).toEqual({ telemetry: { status: 200, body: { soc: 40 } }, garage });
	});

	it('backs off per connection after errors and resets on success', async () => {
		const id = await connect();
		provider.fetchSnapshot.mockRejectedValue(new ProviderError('network'));
		const delays: number[] = [];
		for (let i = 0; i < 3; i++) {
			await service.pollConnection(id);
			const stored = await row(id);
			delays.push(stored.nextPollAt!.getTime() - clock.t);
			clock.t = stored.nextPollAt!.getTime();
		}
		expect(delays).toEqual([2 * INTERVAL, 4 * INTERVAL, 8 * INTERVAL]);
		expect(await row(id)).toMatchObject({ failureCount: 3, lastError: 'network' });

		provider.fetchSnapshot.mockResolvedValue(snapshotResult());
		await service.pollConnection(id);
		expect(await row(id)).toMatchObject({ failureCount: 0, lastError: null });
	});

	it('honours Retry-After and caps the backoff', () => {
		expect(backoffMs(INTERVAL, 1, 3600)).toBe(3600_000);
		expect(backoffMs(INTERVAL, 20)).toBe(MAX_BACKOFF_MS);
		expect(backoffMs(INTERVAL, 0)).toBe(INTERVAL);
	});

	it('never runs two polls of the same connection at once', async () => {
		const id = await connect();
		let release!: () => void;
		provider.fetchSnapshot.mockImplementationOnce(
			() => new Promise((resolve) => (release = () => resolve(snapshotResult())))
		);
		const first = service.pollConnection(id);
		const second = service.pollConnection(id);
		await vi.waitFor(() => expect(provider.fetchSnapshot).toHaveBeenCalledTimes(1));
		expect(await service.fetchNow('alice', id)).toEqual({ ok: false, error: 'busy' });
		release();
		expect(await first).toEqual({ ok: true });
		expect(await second).toEqual({ ok: true });
		expect(provider.fetchSnapshot).toHaveBeenCalledTimes(1);
	});

	it('limits manual fetches', async () => {
		const id = await connect();
		expect(await service.fetchNow('alice', id)).toEqual({ ok: true });
		expect(await service.fetchNow('alice', id)).toEqual({ ok: false, error: 'too_soon' });
		clock.t += 61_000;
		expect(await service.fetchNow('alice', id)).toEqual({ ok: true });
	});

	it('prunes old snapshots and keeps everything with retention 0', async () => {
		const id = await connect();
		await service.pollConnection(id);
		clock.t += 400 * 24 * 3600_000;
		await service.pollConnection(id);
		await service.prune(0);
		expect(await db.select().from(snapshot)).toHaveLength(2);
		await service.prune(365);
		expect(await db.select().from(snapshot)).toHaveLength(1);
	});
});

describe('ownership', () => {
	it('hides other users’ connections everywhere', async () => {
		const id = await connect('alice');
		await service.pollConnection(id);
		expect(await service.listConnections('bob')).toEqual([]);
		expect(await service.getConnection('bob', id)).toBeUndefined();
		expect(await service.latestSnapshot('bob', id)).toBeUndefined();
		expect(await service.fetchNow('bob', id)).toEqual({ ok: false, error: 'not_found' });
		expect(await service.disconnect('bob', id)).toBe(false);
		expect(await service.getConnection('alice', id)).toMatchObject({ id, snapshotCount: 1 });
	});

	it('never exposes tokens in views', async () => {
		const id = await connect();
		const views = JSON.stringify([
			await service.listConnections('alice'),
			await service.getConnection('alice', id)
		]);
		expect(views).not.toMatch(/access|refresh|token|v1\./i);
	});

	it('disconnect deletes tokens and snapshots', async () => {
		const id = await connect();
		await service.pollConnection(id);
		expect(await service.disconnect('alice', id)).toBe(true);
		expect(await db.select().from(vehicleConnection)).toHaveLength(0);
		expect(await db.select().from(snapshot)).toHaveLength(0);
	});

	it('supports several connections per user', async () => {
		await connect();
		await connect();
		expect(await service.listConnections('alice')).toHaveLength(2);
	});
});
