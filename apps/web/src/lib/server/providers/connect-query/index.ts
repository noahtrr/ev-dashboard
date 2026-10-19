// Provider module for the "Connect Query" vehicle data API (read-only, OAuth 2.0
// authorization code flow, one token per consented vehicle).
import { requestJson, retryAfterSeconds, type FetchLike, type HttpResult } from '../http.ts';
import {
	normalizeAlerts,
	isRecord,
	normalizeTelemetry,
	normalizeVehicles,
	toNumber
} from '../normalize.ts';
import {
	ProviderError,
	type ClientCredentials,
	type ProviderSnapshot,
	type RawResponse,
	type RequestOptions,
	type TokenSet,
	type VehicleProvider
} from '../types.ts';
import { DATA_ENDPOINTS, DEFAULT_ENDPOINTS, scopeFor, type Endpoints } from './endpoints.ts';

export const CONNECT_QUERY_ID = 'connect-query';

/** Token responses are small; data responses get the default limit (1 MiB). */
const TOKEN_MAX_BYTES = 64 * 1024;
/** Used when the token response has no usable lifetime. */
const DEFAULT_TOKEN_LIFETIME_S = 30 * 60;

export type ConnectQueryOptions = {
	/** Tests only: point the module at a mock server instead of the real API. */
	endpoints?: Endpoints;
	fetch?: FetchLike;
	timeoutMs?: number;
};

function lifetimeSeconds(body: Record<string, unknown>, now: number): number {
	const expiresIn = toNumber(body.expires_in);
	if (expiresIn !== undefined) return expiresIn;
	const expiresOn = toNumber(body.expires_on);
	if (expiresOn !== undefined) return expiresOn - now / 1000;
	return DEFAULT_TOKEN_LIFETIME_S;
}

export function parseTokenResponse(result: HttpResult, now = Date.now()): TokenSet {
	if (result.status === 429) {
		throw new ProviderError('rate_limited', 429, retryAfterSeconds(result.headers, now));
	}
	if (result.status === 400 || result.status === 401 || result.status === 403) {
		// invalid_grant, invalid_client, revoked consent …: retrying will not help.
		throw new ProviderError('auth', result.status);
	}
	if (result.status < 200 || result.status >= 300) throw new ProviderError('http', result.status);
	const body = result.body;
	if (!isRecord(body) || typeof body.access_token !== 'string' || !body.access_token) {
		throw new ProviderError('invalid_response', result.status);
	}
	const lifetime = Math.min(Math.max(lifetimeSeconds(body, now), 60), 24 * 3600);
	const refresh = typeof body.refresh_token === 'string' && body.refresh_token;
	return {
		accessToken: body.access_token,
		...(refresh && { refreshToken: refresh }),
		expiresAt: new Date(now + lifetime * 1000)
	};
}

export function createConnectQueryProvider(options: ConnectQueryOptions = {}): VehicleProvider {
	const endpoints = options.endpoints ?? DEFAULT_ENDPOINTS;
	const http = (signal?: AbortSignal, maxBytes?: number) => ({
		fetch: options.fetch,
		timeoutMs: options.timeoutMs,
		signal,
		maxBytes
	});

	async function token(
		credentials: ClientCredentials,
		grant: Record<string, string>,
		{ signal }: RequestOptions = {}
	): Promise<TokenSet> {
		const form = new URLSearchParams({
			...grant,
			client_id: credentials.clientId,
			client_secret: credentials.clientSecret,
			scope: scopeFor(credentials.clientId)
		});
		const result = await requestJson(
			endpoints.tokenUrl,
			{
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: form.toString()
			},
			http(signal, TOKEN_MAX_BYTES)
		);
		return parseTokenResponse(result);
	}

	async function get(
		accessToken: string,
		path: string,
		signal?: AbortSignal
	): Promise<{ raw: RawResponse; headers?: Headers }> {
		try {
			const result = await requestJson(
				`${endpoints.queryBase}/${path}`,
				{ method: 'GET', headers: { authorization: `Bearer ${accessToken}` } },
				http(signal)
			);
			return {
				raw: {
					status: result.status,
					body: result.body,
					...(result.error && { error: result.error })
				},
				headers: result.headers
			};
		} catch (error) {
			if (signal?.aborted) throw error;
			const code = error instanceof ProviderError ? error.code : 'network';
			return { raw: { status: 0, body: null, error: code } };
		}
	}

	return {
		id: CONNECT_QUERY_ID,

		authorizeUrl({ clientId, redirectUri, state }) {
			const url = new URL(endpoints.authorizeUrl);
			url.searchParams.set('response_type', 'code');
			url.searchParams.set('client_id', clientId);
			url.searchParams.set('redirect_uri', redirectUri);
			url.searchParams.set('scope', scopeFor(clientId));
			url.searchParams.set('state', state);
			return url.toString();
		},

		exchangeCode({ credentials, code, redirectUri }, requestOptions) {
			return token(
				credentials,
				{ grant_type: 'authorization_code', code, redirect_uri: redirectUri },
				requestOptions
			);
		},

		refresh({ credentials, refreshToken, redirectUri }, requestOptions) {
			return token(
				credentials,
				{ grant_type: 'refresh_token', refresh_token: refreshToken, redirect_uri: redirectUri },
				requestOptions
			);
		},

		async listVehicles(accessToken, { signal } = {}) {
			const { raw } = await get(accessToken, DATA_ENDPOINTS.garage, signal);
			if (raw.status === 401) throw new ProviderError('auth', 401);
			if (raw.status < 200 || raw.status >= 300) {
				throw new ProviderError(raw.status ? 'http' : 'network', raw.status || undefined);
			}
			return normalizeVehicles(raw.body);
		},

		async fetchSnapshot(accessToken, { signal } = {}): Promise<ProviderSnapshot> {
			const names = Object.keys(DATA_ENDPOINTS) as (keyof typeof DATA_ENDPOINTS)[];
			const results = await Promise.all(
				names.map((name) => get(accessToken, DATA_ENDPOINTS[name], signal))
			);
			const raw = Object.fromEntries(names.map((name, i) => [name, results[i].raw]));

			if (results.some((r) => r.raw.status === 401)) throw new ProviderError('auth', 401);
			const limited = results.find((r) => r.raw.status === 429);
			if (limited) {
				throw new ProviderError(
					'rate_limited',
					429,
					limited.headers ? retryAfterSeconds(limited.headers) : undefined
				);
			}
			const usable = results.filter(
				(r) => r.raw.status >= 200 && r.raw.status < 300 && r.raw.body !== null
			);
			if (usable.length === 0) {
				const telemetry = raw.telemetry;
				if (telemetry.status >= 200 && telemetry.status < 300) {
					throw new ProviderError('invalid_response', telemetry.status);
				}
				if (telemetry.status === 0) {
					throw new ProviderError(telemetry.error === 'timeout' ? 'timeout' : 'network');
				}
				throw new ProviderError('http', telemetry.status);
			}

			const ok = (r: RawResponse) => r.status >= 200 && r.status < 300;
			const data = ok(raw.telemetry) ? normalizeTelemetry(raw.telemetry.body) : {};
			const alerts = ok(raw.alerts) ? normalizeAlerts(raw.alerts.body) : undefined;
			if (alerts) {
				data.alerts = alerts;
				data.alertCount = alerts.length;
			}
			const vehicles = ok(raw.garage) ? normalizeVehicles(raw.garage.body) : [];
			return { data, raw, vehicles };
		}
	};
}
