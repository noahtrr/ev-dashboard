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

beforeEach(() => {
	state.app = { vehicles };
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
