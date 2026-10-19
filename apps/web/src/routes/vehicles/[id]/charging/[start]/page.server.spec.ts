import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));
vi.mock('$app/env/private', () => ({ MAP_TILES_URL: 'tiles', MAP_GLYPHS_URL: 'glyphs' }));

const { actions, load } = await import('./+page.server.ts');

type Event = Parameters<typeof load>[0];
const call = (userId: string, id: string, start: string) =>
	load({
		locals: { locale: 'de', user: { id: userId, name: '', email: '', role: 'user' } },
		params: { id, start }
	} as unknown as Event) as Promise<Exclude<Awaited<ReturnType<typeof load>>, void>>;

const MIN = 60_000;
const T0 = Date.parse('2026-10-18T18:00:00Z');
const point = (min: number, soc: number, charging: boolean) => ({
	at: new Date(T0 + min * MIN),
	data: {
		stateOfChargePct: soc,
		chargingState: charging ? 'charging' : 'notCharging',
		latitude: 52.5,
		longitude: 13.4
	}
});
const points = [point(-5, 40, false), point(0, 41, true), point(5, 45, true), point(10, 48, false)];

const vehicles = {
	staleAfterMs: 30 * MIN,
	getConnection: vi.fn(async (userId: string, id: string) =>
		userId === 'alice' && id === 'c1'
			? { id: 'c1', label: 'Car', batteryCapacityKwh: 80 }
			: undefined
	),
	history: vi.fn(async () => points)
};
const geocoder = { lookup: vi.fn(async () => 'Hauptstraße 1, 10115 Berlin') };

const costs = {
	settings: vi.fn(async () => ({
		home: { latitude: 52.5, longitude: 13.4 },
		lossPct: null,
		prices: [{ id: 'p1', kind: 'home', from: '2026-01-01', ct: 32 }]
	})),
	entry: vi.fn(async () => ({ priceCt: null, costEur: 9.5 })),
	setHome: vi.fn(async () => true),
	setEntry: vi.fn(async () => true)
};

beforeEach(() => {
	state.app = { vehicles, geocoder, costs };
});

describe('charging session page', () => {
	it('finds the session by any time inside it', async () => {
		const data = await call('alice', 'c1', String(T0 + 3 * MIN));
		expect(data.session.start).toEqual(new Date(T0));
		expect(data.session.addedPct).toBe(5);
		expect(data.session.addedKwh).toBe(4);
		expect(data.details.samples).toBe(2);
		expect(await data.address).toBe('Hauptstraße 1, 10115 Berlin');
		expect(geocoder.lookup).toHaveBeenCalledWith(52.5, 13.4, 'de');
		expect(data.costs).toEqual({
			prices: [{ id: 'p1', kind: 'home', from: '2026-01-01', ct: 32 }],
			lossPct: 10,
			home: true,
			hasHome: true,
			entry: { priceCt: null, costEur: 9.5 }
		});
		expect(costs.entry).toHaveBeenCalledWith('alice', 'c1', new Date(T0));
	});

	it('is a 404 for unknown sessions, bad ids and other users', async () => {
		await expect(call('alice', 'c1', String(T0 + 60 * MIN))).rejects.toMatchObject({
			status: 404
		});
		await expect(call('alice', 'c1', 'abc')).rejects.toMatchObject({ status: 404 });
		await expect(call('bob', 'c1', String(T0))).rejects.toMatchObject({ status: 404 });
	});
});

describe('charging session cost actions', () => {
	type ActionEvent = Parameters<typeof actions.entry>[0];
	const post = (
		name: keyof typeof actions,
		userId: string,
		fields: Record<string, string> = {}
	) => {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);
		return actions[name]({
			locals: { locale: 'de', user: { id: userId, name: '', email: '', role: 'user' } },
			params: { id: 'c1', start: String(T0) },
			request: new Request('http://localhost/', { method: 'POST', body })
		} as unknown as ActionEvent);
	};

	it('stores either a price or an amount', async () => {
		expect(await post('entry', 'alice', { ct: '59,9', eur: '' })).toEqual({ entrySaved: true });
		expect(costs.setEntry).toHaveBeenLastCalledWith(
			'alice',
			'c1',
			expect.objectContaining({ start: new Date(T0) }),
			{ priceCt: 59.9, costEur: null }
		);
		await post('entry', 'alice', { ct: '', eur: '12,40' });
		expect(costs.setEntry).toHaveBeenLastCalledWith('alice', 'c1', expect.anything(), {
			priceCt: null,
			costEur: 12.4
		});
		for (const fields of [
			{ ct: '', eur: '' },
			{ ct: '30', eur: '10' },
			{ ct: '900', eur: '' }
		]) {
			expect(await post('entry', 'alice', fields)).toMatchObject({
				status: 400,
				data: { entryError: true }
			});
		}
		await post('clearEntry', 'alice');
		expect(costs.setEntry).toHaveBeenLastCalledWith('alice', 'c1', expect.anything(), {
			priceCt: null,
			costEur: null
		});
	});

	it('makes the session’s place the home location', async () => {
		await post('home', 'alice');
		expect(costs.setHome).toHaveBeenLastCalledWith('alice', 'c1', {
			latitude: 52.5,
			longitude: 13.4
		});
	});

	it('is a 404 for other users', async () => {
		costs.setEntry.mockClear();
		await expect(post('entry', 'bob', { ct: '30', eur: '' })).rejects.toMatchObject({
			status: 404
		});
		await expect(post('home', 'bob')).rejects.toMatchObject({ status: 404 });
		expect(costs.setEntry).not.toHaveBeenCalled();
	});
});
