import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { load } = await import('./+page.server.ts');

type Event = Parameters<typeof load>[0];
const call = (userId: string, id: string, search = '') =>
	load({
		locals: { locale: 'de', user: { id: userId, name: '', email: '', role: 'user' } },
		params: { id },
		url: new URL(`http://localhost/vehicles/${id}/costs${search}`)
	} as unknown as Event) as Promise<Exclude<Awaited<ReturnType<typeof load>>, void>>;

const T0 = Date.parse('2026-10-18T07:00:00Z');
const owns = (userId: string, id: string) => userId === 'alice' && id === 'c1';
const session = {
	t: T0,
	end: T0 + 3600_000,
	addedPct: 20,
	home: true,
	priceCt: null,
	costEur: null
};

state.app = {
	vehicles: {
		getConnection: vi.fn(async (userId: string, id: string) =>
			owns(userId, id)
				? { id: 'c1', label: 'Car', batteryCapacityKwh: 77, status: 'active' }
				: undefined
		)
	},
	costs: {
		settings: vi.fn(async (userId: string, id: string) =>
			owns(userId, id) ? { home: null, lossPct: null, prices: [] } : undefined
		),
		sessions: vi.fn(async () => [session])
	},
	logbook: {
		list: vi.fn(async () => [
			{ startAt: new Date(T0), distanceKm: 20, purpose: 'business', note: 'secret' }
		])
	}
};

describe('costs page', () => {
	it('sends sessions, trips and settings for the browser to work out', async () => {
		const data = await call('alice', 'c1', '?range=year');
		expect(data).toEqual({
			connection: { id: 'c1', label: 'Car', batteryCapacityKwh: 77 },
			range: 'year',
			ranges: ['month', 'year', 'all'],
			prices: [],
			lossPct: 10,
			hasHome: false,
			sessions: [session],
			trips: [{ t: T0, km: 20, purpose: 'business' }]
		});
	});

	it('falls back to the month and hides other owners’ vehicles', async () => {
		expect((await call('alice', 'c1', '?range=decade')).range).toBe('month');
		await expect(call('bob', 'c1')).rejects.toMatchObject({ status: 404 });
	});
});
