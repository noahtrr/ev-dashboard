import { describe, expect, it, vi } from 'vitest';
import { createGeocoder, formatAddress } from './geocode.ts';

const reply = (address: unknown, status = 200) =>
	new Response(JSON.stringify({ address }), { status });

function setup(fetchImpl: typeof fetch) {
	return createGeocoder({
		baseUrl: 'https://geo.example',
		userAgent: 'test-agent',
		fetch: fetchImpl,
		minGapMs: 0
	});
}

describe('formatAddress', () => {
	it('builds street and place', () => {
		expect(
			formatAddress({
				road: 'Unter den Linden',
				house_number: '1',
				postcode: '10117',
				city: 'Berlin'
			})
		).toBe('Unter den Linden 1, 10117 Berlin');
	});

	it('falls back to smaller places and tolerates missing parts', () => {
		expect(formatAddress({ village: 'Musterdorf' })).toBe('Musterdorf');
		expect(formatAddress({})).toBeNull();
		expect(formatAddress('nope')).toBeNull();
	});
});

describe('createGeocoder', () => {
	it('sends an identifying request and caches nearby positions', async () => {
		const fetchMock = vi.fn(async () => reply({ road: 'Teststraße', city: 'Berlin' }));
		const geo = setup(fetchMock as unknown as typeof fetch);
		expect(await geo.lookup(52.520008, 13.404954, 'de')).toBe('Teststraße, Berlin');
		expect(await geo.lookup(52.520011, 13.404951, 'de')).toBe('Teststraße, Berlin');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(url.origin + url.pathname).toBe('https://geo.example/reverse');
		expect(url.searchParams.get('lat')).toBe('52.5200');
		expect((init.headers as Record<string, string>)['user-agent']).toBe('test-agent');
	});

	it('shares one request between concurrent lookups', async () => {
		const fetchMock = vi.fn(async () => reply({ city: 'Berlin' }));
		const geo = setup(fetchMock as unknown as typeof fetch);
		const [a, b] = await Promise.all([geo.lookup(1, 2, 'en'), geo.lookup(1, 2, 'en')]);
		expect(a).toBe('Berlin');
		expect(b).toBe('Berlin');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('returns null on errors and remembers the failure', async () => {
		const fetchMock = vi.fn(async () => {
			throw new Error('offline');
		});
		const geo = setup(fetchMock as unknown as typeof fetch);
		expect(await geo.lookup(1, 2, 'en')).toBeNull();
		expect(await geo.lookup(1, 2, 'en')).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const failing = setup((async () => reply(null, 500)) as unknown as typeof fetch);
		expect(await failing.lookup(1, 2, 'en')).toBeNull();
	});
});
