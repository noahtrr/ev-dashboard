import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { load } = await import('./+page.server.ts');

type Event = Parameters<typeof load>[0];
const call = (userId: string, id: string, search = '') =>
	load({
		locals: { locale: 'de', user: { id: userId, name: '', email: '', role: 'user' } },
		params: { id },
		url: new URL(`http://localhost/vehicles/${id}/consumption${search}`)
	} as unknown as Event) as Promise<Exclude<Awaited<ReturnType<typeof load>>, void>>;

const T0 = Date.parse('2026-10-18T07:00:00Z');
const entry = (min: number, values: Record<string, unknown>) => ({
	startAt: new Date(T0 + min * 60_000),
	distanceKm: 20,
	startSocPct: 80,
	endSocPct: 76,
	outsideTempC: 9.5,
	gap: false,
	...values
});

state.app = {
	vehicles: {
		getConnection: vi.fn(async (userId: string, id: string) =>
			userId === 'alice' && id === 'c1'
				? { id: 'c1', label: 'Car', batteryCapacityKwh: 77 }
				: undefined
		)
	},
	logbook: {
		list: vi.fn(async () => [
			entry(0, {}),
			entry(60, { gap: true }),
			entry(120, { distanceKm: 0.6 }),
			entry(180, { endSocPct: 90 }),
			entry(240, { startSocPct: null }),
			entry(300, { outsideTempC: null })
		])
	}
};

describe('consumption page', () => {
	it('sends only trips that say something about consumption', async () => {
		const data = await call('alice', 'c1', '?range=month');
		expect(data.range).toBe('month');
		expect(data.connection.batteryCapacityKwh).toBe(77);
		expect(data.trips).toEqual([
			{ t: T0, km: 20, usedPct: 4, tempC: 9.5 },
			{ t: T0 + 300 * 60_000, km: 20, usedPct: 4, tempC: null }
		]);
	});

	it('falls back to twelve months and hides other owners’ vehicles', async () => {
		expect((await call('alice', 'c1', '?range=decade')).range).toBe('year');
		await expect(call('bob', 'c1')).rejects.toMatchObject({ status: 404 });
	});
});
