// Vehicle connections: OAuth authorization, encrypted token storage with refresh, polling
// with per-connection backoff, snapshots and retention. All user-facing functions take the
// user ID and only ever touch that user's rows.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, isNull, lt, lte, ne, or } from 'drizzle-orm';
import { decrypt, encrypt } from '../crypto.ts';
import type { Database } from '../db/index.ts';
import { providerOAuthState, snapshot, vehicleConnection } from '../db/schema.ts';
import { callbackPath } from '../providers/index.ts';
import { vehicleLabel } from '../providers/normalize.ts';
import {
	ProviderError,
	type ProviderErrorCode,
	type RawResponses,
	type TokenSet,
	type VehicleData,
	type VehicleProvider
} from '../providers/types.ts';
import { getVehicleApiCredentials } from '../vehicle-api.ts';

/** Pending authorizations expire after this. */
export const STATE_TTL_MS = 10 * 60 * 1000;
/** Refresh the access token when it expires within this window. */
export const REFRESH_MARGIN_MS = 2 * 60 * 1000;
/** Upper bound for the per-connection error backoff. */
export const MAX_BACKOFF_MS = 6 * 3600 * 1000;
/** "Fetch now" is refused when the last attempt is more recent than this. */
export const MANUAL_FETCH_MIN_GAP_MS = 60 * 1000;
/** How many snapshots with stored raw responses are searched for the latest one per endpoint. */
const RAW_LOOKBACK = 50;

export type ConnectionStatus = 'active' | 'reauth';

export type ConnectionView = {
	id: string;
	providerId: string;
	label: string | null;
	status: ConnectionStatus;
	lastSuccessAt: Date | null;
	lastErrorAt: Date | null;
	lastError: ProviderErrorCode | null;
	createdAt: Date;
	snapshotCount: number;
};

export type SnapshotView = { fetchedAt: Date; data: VehicleData; raw: RawResponses };

export type StartResult =
	{ ok: true; url: string } | { ok: false; error: 'unknown_provider' | 'missing_credentials' };

export type CallbackResult =
	| { ok: true; connectionId: string }
	| { ok: false; error: 'state' | 'denied' | 'missing_credentials' | 'exchange' };

export type FetchNowResult =
	| { ok: true }
	| { ok: false; error: 'not_found' | 'reauth' | 'too_soon' | 'busy' | ProviderErrorCode };

export type VehicleServiceOptions = {
	db: Database;
	key: Buffer;
	providers: Map<string, VehicleProvider>;
	/** Public origin (APP_URL), base of the redirect URI. */
	appUrl: string;
	pollIntervalMs: number;
	now?: () => number;
	random?: () => number;
	log?: (message: string) => void;
};

const hashState = (state: string) => createHash('sha256').update(state).digest('hex');

const ERROR_CODES: ProviderErrorCode[] = [
	'auth',
	'rate_limited',
	'http',
	'timeout',
	'network',
	'invalid_response',
	'missing_credentials',
	'internal'
];

function errorCode(error: unknown): ProviderErrorCode {
	return error instanceof ProviderError ? error.code : 'internal';
}

function parseJson<T>(text: string, fallback: T): T {
	try {
		return JSON.parse(text) as T;
	} catch {
		return fallback;
	}
}

/** Delay before the next attempt after `failures` consecutive errors. */
export function backoffMs(intervalMs: number, failures: number, retryAfterS?: number) {
	const exp = intervalMs * 2 ** Math.min(Math.max(failures, 0), 10);
	return Math.max(Math.min(exp, MAX_BACKOFF_MS), (retryAfterS ?? 0) * 1000);
}

export function createVehicleService(options: VehicleServiceOptions) {
	const { db, key, providers, appUrl, pollIntervalMs } = options;
	const now = options.now ?? Date.now;
	const random = options.random ?? Math.random;
	const log = options.log ?? ((message: string) => console.warn(`[vehicles] ${message}`));
	const inFlight = new Map<string, Promise<FetchNowResult>>();
	const abort = new AbortController();

	/** ±10 % so many connections do not hit the provider at the same moment. */
	const jitter = (ms: number) => Math.round(ms * (0.9 + random() * 0.2));

	const redirectUri = (providerId: string) => `${appUrl}${callbackPath(providerId)}`;

	const tokenContext = (connectionId: string, kind: 'access' | 'refresh') =>
		`${connectionId}:${kind}_token`;

	function encryptTokens(connectionId: string, tokens: TokenSet) {
		return {
			accessToken: encrypt(tokens.accessToken, key, tokenContext(connectionId, 'access')),
			accessTokenExpiresAt: tokens.expiresAt,
			...(tokens.refreshToken && {
				refreshToken: encrypt(tokens.refreshToken, key, tokenContext(connectionId, 'refresh'))
			})
		};
	}

	async function startAuthorization(userId: string, providerId: string): Promise<StartResult> {
		const provider = providers.get(providerId);
		if (!provider) return { ok: false, error: 'unknown_provider' };
		const credentials = await getVehicleApiCredentials(db, key, userId);
		if (!credentials) return { ok: false, error: 'missing_credentials' };

		const state = randomBytes(32).toString('base64url');
		const t = now();
		await db.delete(providerOAuthState).where(lt(providerOAuthState.expiresAt, new Date(t)));
		await db.insert(providerOAuthState).values({
			stateHash: hashState(state),
			userId,
			providerId,
			expiresAt: new Date(t + STATE_TTL_MS),
			createdAt: new Date(t)
		});
		return {
			ok: true,
			url: provider.authorizeUrl({
				clientId: credentials.clientId,
				redirectUri: redirectUri(providerId),
				state
			})
		};
	}

	/** Checks and deletes the state. True only for this user, provider and within the TTL. */
	async function consumeState(userId: string, providerId: string, state: string) {
		if (!state || state.length > 200) return false;
		const stateHash = hashState(state);
		const row = await db.query.providerOAuthState.findFirst({
			where: eq(providerOAuthState.stateHash, stateHash)
		});
		if (!row) return false;
		// Single use: gone whether it matches or not.
		await db.delete(providerOAuthState).where(eq(providerOAuthState.stateHash, stateHash));
		return (
			row.userId === userId && row.providerId === providerId && row.expiresAt.getTime() > now()
		);
	}

	async function completeAuthorization(
		userId: string,
		providerId: string,
		params: { state: string | null; code: string | null; error: string | null }
	): Promise<CallbackResult> {
		const provider = providers.get(providerId);
		if (!provider || !(await consumeState(userId, providerId, params.state ?? ''))) {
			return { ok: false, error: 'state' };
		}
		if (params.error || !params.code) return { ok: false, error: 'denied' };
		if (params.code.length > 4096) return { ok: false, error: 'exchange' };
		const credentials = await getVehicleApiCredentials(db, key, userId);
		if (!credentials) return { ok: false, error: 'missing_credentials' };

		let tokens: TokenSet;
		try {
			tokens = await provider.exchangeCode(
				{ credentials, code: params.code, redirectUri: redirectUri(providerId) },
				{ signal: abort.signal }
			);
		} catch (error) {
			log(`code exchange failed for provider ${providerId}: ${errorCode(error)}`);
			return { ok: false, error: 'exchange' };
		}

		const id = randomUUID();
		const t = new Date(now());
		await db.insert(vehicleConnection).values({
			id,
			userId,
			providerId,
			...encryptTokens(id, tokens),
			status: 'active',
			nextPollAt: t,
			createdAt: t,
			updatedAt: t
		});
		return { ok: true, connectionId: id };
	}

	async function ownedConnection(userId: string, id: string) {
		return db.query.vehicleConnection.findFirst({
			where: and(eq(vehicleConnection.id, id), eq(vehicleConnection.userId, userId))
		});
	}

	function toView(
		row: typeof vehicleConnection.$inferSelect,
		snapshotCount: number
	): ConnectionView {
		return {
			id: row.id,
			providerId: row.providerId,
			label: row.label,
			status: row.status === 'reauth' ? 'reauth' : 'active',
			lastSuccessAt: row.lastSuccessAt,
			lastErrorAt: row.lastErrorAt,
			lastError: ERROR_CODES.includes(row.lastError as ProviderErrorCode)
				? (row.lastError as ProviderErrorCode)
				: row.lastError
					? 'internal'
					: null,
			createdAt: row.createdAt,
			snapshotCount
		};
	}

	async function countSnapshots(connectionId: string) {
		const [row] = await db
			.select({ n: count() })
			.from(snapshot)
			.where(eq(snapshot.connectionId, connectionId));
		return row?.n ?? 0;
	}

	async function listConnections(userId: string): Promise<ConnectionView[]> {
		const rows = await db
			.select()
			.from(vehicleConnection)
			.where(eq(vehicleConnection.userId, userId))
			.orderBy(asc(vehicleConnection.createdAt));
		return Promise.all(rows.map(async (row) => toView(row, await countSnapshots(row.id))));
	}

	async function getConnection(userId: string, id: string) {
		const row = await ownedConnection(userId, id);
		return row ? toView(row, await countSnapshots(row.id)) : undefined;
	}

	async function latestSnapshot(userId: string, id: string): Promise<SnapshotView | undefined> {
		if (!(await ownedConnection(userId, id))) return undefined;
		const row = await db.query.snapshot.findFirst({
			where: eq(snapshot.connectionId, id),
			orderBy: desc(snapshot.fetchedAt)
		});
		if (!row) return undefined;
		return {
			fetchedAt: row.fetchedAt,
			data: parseJson<VehicleData>(row.data, {}),
			raw: await latestRaw(id)
		};
	}

	/**
	 * Snapshots store a raw response only when it differs from the previous one, so the
	 * current raw state is the newest stored response per endpoint.
	 */
	async function latestRaw(connectionId: string): Promise<RawResponses> {
		const rows = await db
			.select({ raw: snapshot.raw })
			.from(snapshot)
			.where(and(eq(snapshot.connectionId, connectionId), ne(snapshot.raw, '{}')))
			.orderBy(desc(snapshot.fetchedAt))
			.limit(RAW_LOOKBACK);
		const merged: RawResponses = {};
		for (const row of rows) {
			for (const [endpoint, response] of Object.entries(parseJson<RawResponses>(row.raw, {}))) {
				merged[endpoint] ??= response;
			}
		}
		return merged;
	}

	/** Keeps only the raw responses that changed since the last stored ones. */
	async function changedRaw(connectionId: string, raw: RawResponses): Promise<RawResponses> {
		const previous = await latestRaw(connectionId);
		return Object.fromEntries(
			Object.entries(raw).filter(
				([endpoint, response]) =>
					!(endpoint in previous) || JSON.stringify(previous[endpoint]) !== JSON.stringify(response)
			)
		);
	}

	async function markReauth(id: string, code: ProviderErrorCode) {
		const t = new Date(now());
		await db
			.update(vehicleConnection)
			.set({ status: 'reauth', lastError: code, lastErrorAt: t, lastAttemptAt: t, updatedAt: t })
			.where(eq(vehicleConnection.id, id));
		log(`connection ${id} needs re-authorization (${code})`);
	}

	class ReauthRequired extends Error {
		constructor(readonly code: ProviderErrorCode) {
			super(code);
		}
	}

	/** Returns a valid access token, refreshing (and storing) it when needed. */
	async function accessToken(
		row: typeof vehicleConnection.$inferSelect,
		provider: VehicleProvider,
		force = false
	): Promise<string> {
		if (!force && row.accessTokenExpiresAt.getTime() - now() > REFRESH_MARGIN_MS) {
			return decrypt(row.accessToken, key, tokenContext(row.id, 'access'));
		}
		if (!row.refreshToken) throw new ReauthRequired('auth');
		const credentials = await getVehicleApiCredentials(db, key, row.userId);
		if (!credentials) throw new ReauthRequired('missing_credentials');
		let tokens: TokenSet;
		try {
			tokens = await provider.refresh(
				{
					credentials,
					refreshToken: decrypt(row.refreshToken, key, tokenContext(row.id, 'refresh')),
					redirectUri: redirectUri(row.providerId)
				},
				{ signal: abort.signal }
			);
		} catch (error) {
			if (error instanceof ProviderError && error.code === 'auth') throw new ReauthRequired('auth');
			throw error;
		}
		const values = encryptTokens(row.id, tokens);
		await db
			.update(vehicleConnection)
			.set({ ...values, updatedAt: new Date(now()) })
			.where(eq(vehicleConnection.id, row.id));
		Object.assign(row, values);
		return tokens.accessToken;
	}

	async function poll(id: string): Promise<FetchNowResult> {
		const row = await db.query.vehicleConnection.findFirst({
			where: eq(vehicleConnection.id, id)
		});
		if (!row) return { ok: false, error: 'not_found' };
		if (row.status !== 'active') return { ok: false, error: 'reauth' };
		const provider = providers.get(row.providerId);
		if (!provider) return { ok: false, error: 'internal' };

		const started = new Date(now());
		try {
			let result;
			try {
				result = await provider.fetchSnapshot(await accessToken(row, provider), {
					signal: abort.signal
				});
			} catch (error) {
				// A rejected access token: refresh once and retry.
				if (!(error instanceof ProviderError && error.code === 'auth')) throw error;
				result = await provider.fetchSnapshot(await accessToken(row, provider, true), {
					signal: abort.signal
				});
			}
			const t = new Date(now());
			await db.insert(snapshot).values({
				connectionId: id,
				fetchedAt: t,
				data: JSON.stringify(result.data),
				raw: JSON.stringify(await changedRaw(id, result.raw))
			});
			const vehicle = result.vehicles[0];
			await db
				.update(vehicleConnection)
				.set({
					lastSuccessAt: t,
					lastAttemptAt: started,
					lastError: null,
					lastErrorAt: null,
					failureCount: 0,
					nextPollAt: new Date(t.getTime() + jitter(pollIntervalMs)),
					updatedAt: t,
					...(!row.label &&
						vehicleLabel(result.vehicles) && { label: vehicleLabel(result.vehicles) }),
					...(!row.externalId && vehicle?.id && { externalId: vehicle.id })
				})
				.where(eq(vehicleConnection.id, id));
			return { ok: true };
		} catch (error) {
			if (error instanceof ReauthRequired) {
				await markReauth(id, error.code);
				return { ok: false, error: 'reauth' };
			}
			if (abort.signal.aborted) return { ok: false, error: 'internal' };
			const code = errorCode(error);
			if (code === 'internal') log(`connection ${id} poll failed: ${(error as Error)?.name}`);
			else log(`connection ${id} poll failed: ${code}`);
			const failures = row.failureCount + 1;
			const retryAfter = error instanceof ProviderError ? error.retryAfter : undefined;
			const t = new Date(now());
			await db
				.update(vehicleConnection)
				.set({
					lastError: code,
					lastErrorAt: t,
					lastAttemptAt: started,
					failureCount: failures,
					nextPollAt: new Date(
						t.getTime() + jitter(backoffMs(pollIntervalMs, failures, retryAfter))
					),
					updatedAt: t
				})
				.where(eq(vehicleConnection.id, id));
			return { ok: false, error: code };
		}
	}

	/** Polls one connection; concurrent calls for the same connection share one run. */
	function pollConnection(id: string): Promise<FetchNowResult> {
		const running = inFlight.get(id);
		if (running) return running;
		const run = poll(id)
			.catch((error: unknown) => {
				log(`connection ${id} poll crashed: ${(error as Error)?.name}`);
				return { ok: false, error: 'internal' } as FetchNowResult;
			})
			.finally(() => inFlight.delete(id));
		inFlight.set(id, run);
		return run;
	}

	/** Polls every active connection that is due, one after another. */
	async function pollDue(): Promise<number> {
		const due = await db
			.select({ id: vehicleConnection.id })
			.from(vehicleConnection)
			.where(
				and(
					eq(vehicleConnection.status, 'active'),
					or(
						isNull(vehicleConnection.nextPollAt),
						lte(vehicleConnection.nextPollAt, new Date(now()))
					)
				)
			)
			.orderBy(asc(vehicleConnection.nextPollAt));
		let polled = 0;
		for (const { id } of due) {
			if (abort.signal.aborted) break;
			await pollConnection(id);
			polled++;
		}
		return polled;
	}

	async function fetchNow(userId: string, id: string): Promise<FetchNowResult> {
		const row = await ownedConnection(userId, id);
		if (!row) return { ok: false, error: 'not_found' };
		if (row.status !== 'active') return { ok: false, error: 'reauth' };
		if (inFlight.has(id)) return { ok: false, error: 'busy' };
		if (row.lastAttemptAt && now() - row.lastAttemptAt.getTime() < MANUAL_FETCH_MIN_GAP_MS) {
			return { ok: false, error: 'too_soon' };
		}
		return pollConnection(id);
	}

	/** Deletes the connection, its tokens and (by cascade) its snapshots. */
	async function disconnect(userId: string, id: string): Promise<boolean> {
		if (!(await ownedConnection(userId, id))) return false;
		await db
			.delete(vehicleConnection)
			.where(and(eq(vehicleConnection.id, id), eq(vehicleConnection.userId, userId)));
		return true;
	}

	/** Removes snapshots older than `retentionDays` (0 = keep) and expired OAuth states. */
	async function prune(retentionDays: number) {
		const t = now();
		await db.delete(providerOAuthState).where(lt(providerOAuthState.expiresAt, new Date(t)));
		if (retentionDays <= 0) return;
		await db
			.delete(snapshot)
			.where(lt(snapshot.fetchedAt, new Date(t - retentionDays * 24 * 3600 * 1000)));
	}

	return {
		redirectUri,
		startAuthorization,
		completeAuthorization,
		listConnections,
		getConnection,
		latestSnapshot,
		pollConnection,
		pollDue,
		fetchNow,
		disconnect,
		prune,
		/** Aborts outstanding provider requests (shutdown). */
		stop: () => abort.abort()
	};
}

export type VehicleService = ReturnType<typeof createVehicleService>;
