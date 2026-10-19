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

beforeEach(() => {
	state.app = { vehicles, geocoder };
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
	});

	it('is a 404 for unknown sessions, bad ids and other users', async () => {
		await expect(call('alice', 'c1', String(T0 + 60 * MIN))).rejects.toMatchObject({
			status: 404
		});
		await expect(call('alice', 'c1', 'abc')).rejects.toMatchObject({ status: 404 });
		await expect(call('bob', 'c1', String(T0))).rejects.toMatchObject({ status: 404 });
	});
});
