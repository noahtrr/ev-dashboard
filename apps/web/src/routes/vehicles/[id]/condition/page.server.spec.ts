import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { load } = await import('./+page.server.ts');

type Event = Parameters<typeof load>[0];
const call = (userId: string, id: string) =>
	load({
		locals: { locale: 'de', user: { id: userId, name: '', email: '', role: 'user' } },
		params: { id }
	} as unknown as Event) as Promise<Exclude<Awaited<ReturnType<typeof load>>, void>>;

const fetchedAt = new Date('2026-10-19T16:30:00Z');
let data: Record<string, unknown> = {};

const vehicles = {
	getConnection: vi.fn(async (userId: string, id: string) =>
		userId === 'alice' && id === 'c1' ? { id: 'c1', label: 'Car' } : undefined
	),
	latestValues: vi.fn(async () => ({ fetchedAt, data })),
	history: vi.fn(async () => [
		{ at: new Date('2026-10-19T10:10:00Z'), data: { battery12vVoltage: 12.6 } },
		{ at: new Date('2026-10-19T10:40:00Z'), data: { battery12vVoltage: 12.4 } },
		{ at: new Date('2026-10-19T11:10:00Z'), data: {} }
	])
};
const logbook = {
	list: vi.fn(async () => [
		{ startAt: new Date('2026-10-19T15:00:00Z'), distanceKm: 12.5 },
		{ startAt: new Date('2026-10-19T16:00:00Z'), distanceKm: 8 }
	])
};

beforeEach(() => {
	state.app = { vehicles, logbook };
	vehicles.history.mockClear();
	data = {};
});

describe('vehicle condition page', () => {
	it('judges the latest values and lists trips', async () => {
		data = { doorsLocked: true, doorsClosed: false, doors: [{ part: 'rearLeft', closed: false }] };
		const page = await call('alice', 'c1');
		expect(page.connection).toEqual({ id: 'c1', label: 'Car' });
		expect(page.fetchedAt).toBe(fetchedAt);
		expect(page.condition).toEqual({
			known: true,
			issues: [{ kind: 'doorOpen', parts: ['rearLeft'] }]
		});
		expect(page.trips).toEqual([
			{ t: Date.parse('2026-10-19T15:00:00Z'), km: 12.5 },
			{ t: Date.parse('2026-10-19T16:00:00Z'), km: 8 }
		]);
		// No 12 V values reported: the history is not read.
		expect(page.voltages).toEqual([]);
		expect(vehicles.history).not.toHaveBeenCalled();
	});

	it('charts the lowest 12 V reading per hour', async () => {
		data = { battery12vVoltage: 12.5 };
		const page = await call('alice', 'c1');
		expect(page.voltages).toEqual([{ t: Date.parse('2026-10-19T10:00:00Z'), v: 12.4 }]);
	});

	it('is a 404 for other users', async () => {
		await expect(call('bob', 'c1')).rejects.toMatchObject({ status: 404 });
	});
});
