import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { actions, load } = await import('./+page.server.ts');

type Event = Parameters<typeof load>[0];
const call = (userId: string | undefined, id: string) =>
	load({
		locals: {
			locale: 'en',
			user: userId ? { id: userId, name: '', email: '', role: 'user' } : undefined
		},
		params: { id }
	} as unknown as Event);

const connection = { id: 'c1', status: 'active', label: 'Car' };
const fetchedAt = new Date('2026-10-18T12:00:00Z');
const vehicles = {
	getConnection: vi.fn(async (userId: string, id: string) =>
		userId === 'alice' && id === 'c1' ? connection : undefined
	),
	setBatteryCapacity: vi.fn(
		async (userId: string, id: string) => userId === 'alice' && id === 'c1'
	),
	latestSnapshot: vi.fn(async (userId: string, id: string) =>
		userId === 'alice' && id === 'c1'
			? {
					fetchedAt,
					data: { stateOfChargePct: 80 },
					raw: {
						telemetry: { status: 200, body: { soc: 80 } },
						alerts: { status: 0, body: null, error: 'timeout' }
					}
				}
			: undefined
	)
};

const owns = (userId: string, id: string) => userId === 'alice' && id === 'c1';
const costs = {
	settings: vi.fn(async (userId: string, id: string) =>
		owns(userId, id)
			? {
					home: { latitude: 52.5, longitude: 13.4 },
					lossPct: null,
					prices: [{ id: 'p1', kind: 'home', from: '2026-01-01', ct: 32 }]
				}
			: undefined
	),
	setPrice: vi.fn(async (userId: string, id: string) => owns(userId, id)),
	deletePrice: vi.fn(async (userId: string, id: string) => owns(userId, id)),
	setLoss: vi.fn(async (userId: string, id: string) => owns(userId, id)),
	setHome: vi.fn(async (userId: string, id: string) => owns(userId, id))
};
const geocoder = { lookup: vi.fn(async () => 'Hauptstraße 1, 10115 Berlin') };

beforeEach(() => {
	state.app = { vehicles, costs, geocoder };
});

describe('vehicle detail page', () => {
	it('shows the owner the latest values and raw responses', async () => {
		const data = await call('alice', 'c1');
		expect(data.connection).toBe(connection);
		expect(data.snapshot).toEqual({ fetchedAt, data: { stateOfChargePct: 80 } });
		expect(data.raw).toEqual([
			{
				endpoint: 'telemetry',
				status: 200,
				error: undefined,
				text: '{\n  "soc": 80\n}',
				truncated: false
			},
			{ endpoint: 'alerts', status: 0, error: 'timeout', text: 'null', truncated: false }
		]);
		expect(data.costs).toMatchObject({
			prices: [{ id: 'p1', kind: 'home', from: '2026-01-01', ct: 32 }],
			lossPct: null,
			defaultLossPct: 10,
			home: { latitude: 52.5, longitude: 13.4 }
		});
		expect(await data.costs.homeAddress).toBe('Hauptstraße 1, 10115 Berlin');
	});

	it('is a 404 for anyone else and a 401 without session', async () => {
		await expect(call('bob', 'c1')).rejects.toMatchObject({ status: 404 });
		await expect(call('alice', 'other')).rejects.toMatchObject({ status: 404 });
		await expect(call(undefined, 'c1')).rejects.toMatchObject({ status: 401 });
		expect(vehicles.latestSnapshot).not.toHaveBeenCalledWith('bob', 'c1');
	});
});

describe('capacity action', () => {
	type ActionEvent = Parameters<typeof actions.capacity>[0];
	const save = (userId: string, id: string, capacity: string) => {
		const body = new FormData();
		body.set('capacity', capacity);
		return actions.capacity({
			locals: { locale: 'en', user: { id: userId, name: '', email: '', role: 'user' } },
			params: { id },
			request: new Request('http://localhost/', { method: 'POST', body })
		} as unknown as ActionEvent);
	};

	it('stores a valid capacity and clears an empty one', async () => {
		expect(await save('alice', 'c1', '77,4')).toEqual({ capacitySaved: true });
		expect(vehicles.setBatteryCapacity).toHaveBeenLastCalledWith('alice', 'c1', 77.4);
		await save('alice', 'c1', '');
		expect(vehicles.setBatteryCapacity).toHaveBeenLastCalledWith('alice', 'c1', null);
	});

	it('rejects invalid input and other users', async () => {
		expect(await save('alice', 'c1', '900')).toMatchObject({
			status: 400,
			data: { capacityError: true }
		});
		await expect(save('bob', 'c1', '50')).rejects.toMatchObject({ status: 404 });
	});
});

describe('cost settings actions', () => {
	type ActionEvent = Parameters<typeof actions.price>[0];
	const post = (name: keyof typeof actions, userId: string, fields: Record<string, string>) => {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);
		return actions[name]({
			locals: { locale: 'en', user: { id: userId, name: '', email: '', role: 'user' } },
			params: { id: 'c1' },
			request: new Request('http://localhost/', { method: 'POST', body })
		} as unknown as ActionEvent);
	};

	it('stores a price from a day on', async () => {
		expect(await post('price', 'alice', { kind: 'away', ct: '49,5', from: '2026-03-01' })).toEqual({
			priceSaved: 'away'
		});
		expect(costs.setPrice).toHaveBeenLastCalledWith('alice', 'c1', 'away', '2026-03-01', 49.5);
	});

	it('rejects invalid prices and other users', async () => {
		for (const fields of [
			{ kind: 'home', ct: '', from: '2026-03-01' },
			{ kind: 'home', ct: '600', from: '2026-03-01' },
			{ kind: 'home', ct: '30', from: '2026-02-30' },
			{ kind: 'gas', ct: '30', from: '2026-03-01' }
		]) {
			expect(await post('price', 'alice', fields)).toMatchObject({ status: 400 });
		}
		await expect(
			post('price', 'bob', { kind: 'home', ct: '30', from: '2026-03-01' })
		).rejects.toMatchObject({ status: 404 });
		await expect(post('deletePrice', 'bob', { id: 'p1' })).rejects.toMatchObject({ status: 404 });
	});

	it('stores or clears the charging losses and clears the home location', async () => {
		expect(await post('loss', 'alice', { loss: '12' })).toEqual({ lossSaved: true });
		expect(costs.setLoss).toHaveBeenLastCalledWith('alice', 'c1', 12);
		await post('loss', 'alice', { loss: '' });
		expect(costs.setLoss).toHaveBeenLastCalledWith('alice', 'c1', null);
		expect(await post('loss', 'alice', { loss: '80' })).toMatchObject({
			status: 400,
			data: { lossError: true }
		});
		await post('clearHome', 'alice', {});
		expect(costs.setHome).toHaveBeenLastCalledWith('alice', 'c1', null);
	});
});
