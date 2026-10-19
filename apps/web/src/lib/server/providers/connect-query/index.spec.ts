import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../types.ts';
import { createConnectQueryProvider } from './index.ts';
import { AUTHORIZE_URL, TOKEN_URL } from './endpoints.ts';
import { alerts, garageSingle, telemetryMetrics } from './fixtures.ts';

const credentials = { clientId: 'client-123', clientSecret: 'secret-xyz' };
const redirectUri = 'https://ev.example.com/api/providers/connect-query/callback';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function setup(handler: Handler, timeoutMs?: number) {
	const fetch = vi.fn((url: string, init?: RequestInit) =>
		Promise.resolve(handler(url, init ?? {}))
	);
	return { fetch, provider: createConnectQueryProvider({ fetch, timeoutMs }) };
}

describe('authorize URL', () => {
	it('carries client, redirect, scope and state', () => {
		const { provider } = setup(() => json({}));
		const url = new URL(
			provider.authorizeUrl({ clientId: 'client-123', redirectUri, state: 'st4te' })
		);
		expect(url.origin + url.pathname).toBe(AUTHORIZE_URL);
		expect(Object.fromEntries(url.searchParams)).toEqual({
			response_type: 'code',
			client_id: 'client-123',
			redirect_uri: redirectUri,
			scope: 'client-123 offline_access openid',
			state: 'st4te'
		});
	});
});

describe('token requests', () => {
	it('exchanges the code with a form post', async () => {
		const { fetch, provider } = setup(() =>
			json({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 1800 })
		);
		const before = Date.now();
		const tokens = await provider.exchangeCode({ credentials, code: 'code-1', redirectUri });
		expect(tokens.accessToken).toBe('at-1');
		expect(tokens.refreshToken).toBe('rt-1');
		expect(tokens.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 1800_000);

		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe(TOKEN_URL);
		expect(init?.method).toBe('POST');
		expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
			grant_type: 'authorization_code',
			code: 'code-1',
			redirect_uri: redirectUri,
			client_id: 'client-123',
			client_secret: 'secret-xyz',
			scope: 'client-123 offline_access openid'
		});
	});

	it('refreshes and tolerates a missing refresh token and lifetime', async () => {
		const { fetch, provider } = setup(() => json({ access_token: 'at-2' }));
		const tokens = await provider.refresh({ credentials, refreshToken: 'rt-1', redirectUri });
		expect(tokens.refreshToken).toBeUndefined();
		expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
		const body = new URLSearchParams(String(fetch.mock.calls[0][1]?.body));
		expect(body.get('grant_type')).toBe('refresh_token');
		expect(body.get('refresh_token')).toBe('rt-1');
	});

	it('classifies failures', async () => {
		const run = (response: Response) =>
			setup(() => response).provider.refresh({ credentials, refreshToken: 'r', redirectUri });
		await expect(run(json({ error: 'invalid_grant' }, 400))).rejects.toMatchObject({
			code: 'auth'
		});
		await expect(run(json({}, 503))).rejects.toMatchObject({ code: 'http', status: 503 });
		await expect(run(json({}, 429, { 'retry-after': '120' }))).rejects.toMatchObject({
			code: 'rate_limited',
			retryAfter: 120
		});
		await expect(run(json({ token: 'nope' }))).rejects.toMatchObject({
			code: 'invalid_response'
		});
		await expect(run(new Response('<html>', { status: 200 }))).rejects.toMatchObject({
			code: 'invalid_response'
		});
	});

	it('does not put secrets into error messages', async () => {
		const { provider } = setup(() => json({ error: 'invalid_client', secret: 'secret-xyz' }, 401));
		const error = await provider
			.exchangeCode({ credentials, code: 'c', redirectUri })
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ProviderError);
		expect(String((error as Error).message)).not.toContain('secret-xyz');
	});

	it('times out', async () => {
		const { provider } = setup(
			(_url, init) =>
				new Promise<Response>((_resolve, reject) =>
					init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
				),
			20
		);
		await expect(
			provider.exchangeCode({ credentials, code: 'c', redirectUri })
		).rejects.toMatchObject({ code: 'timeout' });
	});
});

describe('data requests', () => {
	const routes =
		(overrides: Record<string, () => Response> = {}): Handler =>
		(url) => {
			const path = new URL(url).pathname.replace('/fcon-query/v1/', '');
			if (overrides[path]) return overrides[path]();
			if (path === 'garage') return json(garageSingle);
			if (path === 'telemetry') return json(telemetryMetrics);
			if (path === 'vehicle-health/alerts') return json(alerts);
			return json({}, 404);
		};

	it('fetches all endpoints with the bearer token and normalizes', async () => {
		const { fetch, provider } = setup(routes());
		const result = await provider.fetchSnapshot('at-1');
		expect(fetch).toHaveBeenCalledTimes(3);
		for (const [, init] of fetch.mock.calls) {
			expect((init?.headers as Record<string, string>).authorization).toBe('Bearer at-1');
		}
		expect(Object.keys(result.raw).sort()).toEqual(['alerts', 'garage', 'telemetry']);
		expect(result.raw.telemetry).toEqual({ status: 200, body: telemetryMetrics });
		expect(result.data).toMatchObject({ stateOfChargePct: 76.5, alertCount: 2 });
		expect(result.vehicles[0]).toEqual({ id: 'TESTVIN0000000001', name: 'Blue car' });
	});

	it('keeps partial results when one endpoint fails', async () => {
		const { provider } = setup(routes({ 'vehicle-health/alerts': () => json({}, 403) }));
		const result = await provider.fetchSnapshot('at-1');
		expect(result.raw.alerts.status).toBe(403);
		expect(result.data.alertCount).toBeUndefined();
		expect(result.data.rangeKm).toBe(312.4);
	});

	it('reports a rejected token, rate limits and total failure', async () => {
		await expect(
			setup(routes({ telemetry: () => json({}, 401) })).provider.fetchSnapshot('x')
		).rejects.toMatchObject({ code: 'auth' });
		await expect(
			setup(
				routes({ telemetry: () => json({}, 429, { 'retry-after': '30' }) })
			).provider.fetchSnapshot('x')
		).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 30 });
		await expect(setup(() => json({}, 500)).provider.fetchSnapshot('x')).rejects.toMatchObject({
			code: 'http',
			status: 500
		});
		await expect(
			setup(() => Promise.reject(new TypeError('fetch failed'))).provider.fetchSnapshot('x')
		).rejects.toMatchObject({ code: 'network' });
	});

	it('limits the response size', async () => {
		const huge = 'x'.repeat(2 * 1024 * 1024);
		const { provider } = setup(
			routes({ telemetry: () => new Response(`{"a":"${huge}"}`, { status: 200 }) })
		);
		const result = await provider.fetchSnapshot('at-1');
		expect(result.raw.telemetry).toEqual({ status: 200, body: null, error: 'too_large' });
		expect(result.data.alertCount).toBe(2);
		expect(result.data.alerts).toHaveLength(2);
	});

	it('lists vehicles from the garage', async () => {
		const { provider } = setup(routes());
		expect(await provider.listVehicles('at-1')).toEqual([
			{ id: 'TESTVIN0000000001', name: 'Blue car' }
		]);
		await expect(
			setup(routes({ garage: () => json({}, 401) })).provider.listVehicles('x')
		).rejects.toMatchObject({ code: 'auth' });
	});
});
