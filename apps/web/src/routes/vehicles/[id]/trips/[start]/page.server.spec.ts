import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));
vi.mock('$app/env/private', () => ({ MAP_TILES_URL: 'tiles', MAP_GLYPHS_URL: 'glyphs' }));

const { load } = await import('./+page.server.ts');

type Event = Parameters<typeof load>[0];
const call = (userId: string, id: string, start: string) =>
	load({
		locals: { locale: 'de', user: { id: userId, name: '', email: '', role: 'user' } },
		params: { id, start }
	} as unknown as Event) as Promise<Exclude<Awaited<ReturnType<typeof load>>, void>>;

const MIN = 60_000;
const T0 = Date.parse('2026-10-18T07:00:00Z');
const point = (min: number, odometerKm: number, latitude: number, soc: number) => ({
	at: new Date(T0 + min * MIN),
	data: { odometerKm, latitude, longitude: 13.4, stateOfChargePct: soc }
});
const points = [
	point(0, 100, 52.5, 80),
	point(5, 104, 52.53, 79),
	point(10, 110, 52.56, 78),
	point(15, 110, 52.56, 78)
];

const vehicles = {
	staleAfterMs: 30 * MIN,
	getConnection: vi.fn(async (userId: string, id: string) =>
		userId === 'alice' && id === 'c1'
			? { id: 'c1', label: 'Car', batteryCapacityKwh: 80 }
			: undefined
	),
	history: vi.fn(async () => points)
};
const geocoder = { lookup: vi.fn(async (lat: number) => (lat > 52.55 ? 'Ziel 1' : 'Start 1')) };

beforeEach(() => {
	state.app = { vehicles, geocoder };
});

describe('trip page', () => {
	it('finds the trip by any time inside it and looks up both addresses', async () => {
		const data = await call('alice', 'c1', String(T0 + 7 * MIN));
		expect(data.trip.start).toEqual(new Date(T0));
		expect(data.trip.distanceKm).toBe(10);
		expect(data.trip.usedKwh).toBe(1.6);
		expect(data.details.path).toHaveLength(3);
		expect(await data.startAddress).toBe('Start 1');
		expect(await data.endAddress).toBe('Ziel 1');
	});

	it('is a 404 for unknown trips, bad ids and other users', async () => {
		await expect(call('alice', 'c1', String(T0 + 60 * MIN))).rejects.toMatchObject({
			status: 404
		});
		await expect(call('alice', 'c1', '1e9')).rejects.toMatchObject({ status: 404 });
		await expect(call('bob', 'c1', String(T0))).rejects.toMatchObject({ status: 404 });
	});
});
