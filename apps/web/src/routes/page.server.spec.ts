import { describe, expect, it, vi } from 'vitest';
import { defaultHomeLayout, type HomeLayout } from '#lib/home-layout.ts';

const state = vi.hoisted(() => ({ app: undefined as unknown, layout: [] as HomeLayout }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));
vi.mock('$app/env/private', () => ({ MAP_TILES_URL: 'tiles', MAP_GLYPHS_URL: 'glyphs' }));

const { load } = await import('./+page.server.ts');

type Event = Parameters<typeof load>[0];
const call = () =>
	load({
		locals: { locale: 'de', user: { id: 'alice', name: '', email: '', role: 'user' } },
		url: new URL('http://localhost/')
	} as unknown as Event) as Promise<Exclude<Awaited<ReturnType<typeof load>>, void>>;

const T0 = Date.now() - 3600_000;
const entry = {
	startAt: new Date(T0),
	distanceKm: 30,
	gap: false,
	startSocPct: 80,
	endSocPct: 74,
	outsideTempC: null,
	purpose: 'private'
};
const logbook = { list: vi.fn(async () => [entry]) };
const costs = {
	settings: vi.fn(async () => ({ home: null, lossPct: null, prices: [] })),
	sessions: vi.fn(async () => [])
};

state.app = {
	preferences: { homeLayout: vi.fn(async () => state.layout) },
	vehicles: {
		listConnections: vi.fn(async () => [
			{ id: 'c1', label: 'Car', status: 'active', batteryCapacityKwh: 77 }
		]),
		latestValues: vi.fn(async () => ({ fetchedAt: new Date(T0), data: {} })),
		history: vi.fn(async () => []),
		staleAfterMs: 900_000
	},
	logbook,
	costs,
	geocoder: undefined
};

describe('home page', () => {
	it('sends the layout and skips the data of hidden modules', async () => {
		state.layout = defaultHomeLayout();
		const data = await call();
		expect(data.layout).toEqual(defaultHomeLayout());
		expect(data.costs).toBeNull();
		expect(data.consumption).toBeNull();
		expect(costs.settings).not.toHaveBeenCalled();
		expect(logbook.list).not.toHaveBeenCalled();
	});

	it('loads costs and consumption once they are switched on', async () => {
		state.layout = defaultHomeLayout().map((m) => ({ ...m, on: true }));
		const data = await call();
		expect(data.selected?.batteryCapacityKwh).toBe(77);
		expect(data.costs).toEqual({
			prices: [],
			lossPct: 10,
			sessions: [],
			trips: [{ t: T0, km: 30, purpose: 'private' }]
		});
		expect(data.consumption).toEqual([{ t: T0, km: 30, usedPct: 6, tempC: null }]);
	});

	it('sends the private trips of the year for a vehicle with an allowance', async () => {
		state.layout = defaultHomeLayout();
		const vehicles = (state.app as { vehicles: { listConnections: ReturnType<typeof vi.fn> } })
			.vehicles;
		vehicles.listConnections.mockResolvedValueOnce([
			{
				id: 'c1',
				label: 'Car',
				status: 'active',
				batteryCapacityKwh: 77,
				privateQuotaKm: 5000,
				privateQuotaWarnPct: null
			}
		]);
		logbook.list.mockResolvedValueOnce([
			entry,
			{ ...entry, startAt: new Date(T0 - 60_000), purpose: 'business' }
		]);
		const data = await call();
		expect(data.quota).toEqual({ km: 5000, warnPct: null, trips: [{ t: T0, km: 30 }] });
	});
});
