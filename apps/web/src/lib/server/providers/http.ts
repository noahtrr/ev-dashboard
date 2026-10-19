// Outbound HTTP for provider modules: timeout, response size limit, no secrets in errors.
import { ProviderError } from './types.ts';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpOptions = {
	fetch?: FetchLike;
	timeoutMs?: number;
	maxBytes?: number;
	signal?: AbortSignal;
};

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_BYTES = 1024 * 1024;

export type HttpResult = {
	status: number;
	headers: Headers;
	/** Parsed JSON, or `null` (see `error`). */
	body: unknown;
	error?: 'too_large' | 'invalid_json' | 'empty';
};

/** Reads at most `maxBytes` of the body; returns `undefined` when it is larger. */
async function readLimited(response: Response, maxBytes: number): Promise<string | undefined> {
	const declared = Number(response.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) {
		await response.body?.cancel();
		return undefined;
	}
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			return undefined;
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString('utf8');
}

/**
 * Sends a request and parses a JSON response. Network failures and timeouts throw a
 * `ProviderError`; HTTP error statuses are returned so callers can decide.
 */
export async function requestJson(
	url: string,
	init: RequestInit,
	options: HttpOptions = {}
): Promise<HttpResult> {
	const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
	let response: Response;
	try {
		response = await (options.fetch ?? fetch)(url, {
			...init,
			signal,
			redirect: 'error',
			headers: { accept: 'application/json', ...init.headers }
		});
	} catch {
		throw new ProviderError(timeout.aborted ? 'timeout' : 'network');
	}
	let text: string | undefined;
	try {
		text = await readLimited(response, options.maxBytes ?? DEFAULT_MAX_BYTES);
	} catch {
		throw new ProviderError(timeout.aborted ? 'timeout' : 'network', response.status);
	}
	const base = { status: response.status, headers: response.headers };
	if (text === undefined) return { ...base, body: null, error: 'too_large' };
	if (!text.trim()) return { ...base, body: null, error: 'empty' };
	try {
		return { ...base, body: JSON.parse(text) as unknown };
	} catch {
		return { ...base, body: null, error: 'invalid_json' };
	}
}

/** Parses Retry-After (seconds or HTTP date) into seconds, if present and sane. */
export function retryAfterSeconds(headers: Headers, now = Date.now()): number | undefined {
	const value = headers.get('retry-after')?.trim();
	if (!value) return undefined;
	const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
	if (!Number.isFinite(seconds) || seconds < 0) return undefined;
	return Math.min(Math.ceil(seconds), 24 * 3600);
}
