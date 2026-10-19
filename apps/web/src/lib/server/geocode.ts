// Street address for a position via a Nominatim-compatible reverse geocoding service.
// Follows the public Nominatim usage policy: identifying User-Agent, at most one request per
// second, results cached. Failures yield no address, never an exception.
import { isRecord } from './providers/normalize.ts';

type FetchLike = typeof fetch;

export type GeocoderOptions = {
	/** Service base URL, e.g. https://nominatim.openstreetmap.org */
	baseUrl: string;
	userAgent: string;
	fetch?: FetchLike;
	now?: () => number;
	timeoutMs?: number;
	/** Minimum gap between two requests to the service. */
	minGapMs?: number;
};

const CACHE_MAX = 1000;
const TTL_MS = 30 * 24 * 3600 * 1000;
/** Failures are retried after this long, not on every page view. */
const FAILURE_TTL_MS = 10 * 60 * 1000;
/** ~11 m: positions closer than this share one address lookup. */
const PRECISION = 4;

type Entry = { address: string | null; expiresAt: number };

/** "Street 1, 12345 City" from a Nominatim `address` object. */
export function formatAddress(address: unknown): string | null {
	if (!isRecord(address)) return null;
	const str = (...keys: string[]) => {
		for (const key of keys) {
			const v = address[key];
			if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 100);
		}
		return undefined;
	};
	const street = [str('road', 'pedestrian', 'footway', 'path', 'square'), str('house_number')]
		.filter(Boolean)
		.join(' ');
	const place = [
		str('postcode'),
		str('city', 'town', 'village', 'municipality', 'hamlet', 'suburb')
	]
		.filter(Boolean)
		.join(' ');
	const text = [street, place].filter(Boolean).join(', ');
	return text || null;
}

export function createGeocoder(options: GeocoderOptions) {
	const doFetch = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const timeoutMs = options.timeoutMs ?? 5000;
	const minGapMs = options.minGapMs ?? 1100;
	const cache = new Map<string, Entry>();
	const pending = new Map<string, Promise<string | null>>();
	// Serializes requests so the service sees at most one per `minGapMs`.
	let queue: Promise<unknown> = Promise.resolve();
	let lastRequestAt = -Infinity;

	function remember(key: string, address: string | null) {
		cache.delete(key);
		cache.set(key, { address, expiresAt: now() + (address ? TTL_MS : FAILURE_TTL_MS) });
		if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
	}

	async function request(lat: number, lon: number, language: string): Promise<string | null> {
		const wait = lastRequestAt + minGapMs - now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		lastRequestAt = now();
		const url = new URL('/reverse', options.baseUrl);
		url.search = new URLSearchParams({
			format: 'jsonv2',
			lat: lat.toFixed(PRECISION),
			lon: lon.toFixed(PRECISION),
			zoom: '18',
			addressdetails: '1'
		}).toString();
		try {
			const res = await doFetch(url, {
				headers: { 'user-agent': options.userAgent, 'accept-language': language },
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (!res.ok) return null;
			const body: unknown = await res.json();
			return isRecord(body) ? formatAddress(body.address) : null;
		} catch {
			return null;
		}
	}

	/** Address for a position, from the cache or the service. Never throws. */
	function lookup(lat: number, lon: number, language: string): Promise<string | null> {
		const key = `${lat.toFixed(PRECISION)},${lon.toFixed(PRECISION)},${language}`;
		const hit = cache.get(key);
		if (hit && hit.expiresAt > now()) return Promise.resolve(hit.address);
		const running = pending.get(key);
		if (running) return running;
		const result = (queue = queue.then(() => request(lat, lon, language))).then((address) => {
			remember(key, address as string | null);
			pending.delete(key);
			return address as string | null;
		});
		pending.set(key, result);
		return result;
	}

	return { lookup };
}

export type Geocoder = ReturnType<typeof createGeocoder>;
