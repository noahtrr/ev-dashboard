import { describe, expect, it, vi } from 'vitest';
import { BackupError } from '#lib/server/backup.ts';

const backups = vi.hoisted(() => ({
	importVehicle: vi.fn(async (_u: string, _v: unknown, target: object) =>
		'connectionId' in target && target.connectionId === 'foreign'
			? undefined
			: { connectionId: 'c1', created: 'create' in target, prices: 0 }
	),
	importTrips: vi.fn(async (_u: string, _c: string, trips: unknown) => {
		if (!Array.isArray(trips)) throw new BackupError('trips');
		return { added: trips.length, skipped: 0 };
	}),
	importCharges: vi.fn(async () => undefined),
	importSettings: vi.fn(async () => true),
	importTemplate: vi.fn(async () => 'added')
}));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => ({ backups }) }));

const { POST } = await import('./+server.ts');

type Event = Parameters<typeof POST>[0];
const post = (body: object | string, signedIn = true) =>
	POST({
		locals: { locale: 'de', user: signedIn ? { id: 'alice' } : undefined },
		request: new Request('http://localhost/api/backup/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	} as unknown as Event);

describe('POST /api/backup/import', () => {
	it('runs each step for the signed-in user', async () => {
		expect(await (await post({ step: 'vehicle', vehicle: {}, target: 'new' })).json()).toEqual({
			connectionId: 'c1',
			created: true,
			prices: 0
		});
		expect(backups.importVehicle).toHaveBeenLastCalledWith('alice', {}, { create: true });
		await post({ step: 'vehicle', vehicle: {}, target: 'c1' });
		expect(backups.importVehicle).toHaveBeenLastCalledWith('alice', {}, { connectionId: 'c1' });
		expect(
			await (await post({ step: 'trips', connectionId: 'c1', trips: [{}, {}] })).json()
		).toEqual({ added: 2, skipped: 0 });
		expect(await (await post({ step: 'settings', settings: {} })).json()).toEqual({
			changed: true
		});
		expect(await (await post({ step: 'template', template: {} })).json()).toEqual({
			result: 'added'
		});
	});

	it('answers 404 for vehicles of others and 400 for invalid data', async () => {
		await expect(post({ step: 'vehicle', vehicle: {}, target: 'foreign' })).rejects.toMatchObject({
			status: 404
		});
		await expect(
			post({ step: 'charges', connectionId: 'x', chargeSessions: [] })
		).rejects.toMatchObject({
			status: 404
		});
		await expect(post({ step: 'trips', connectionId: 'c1', trips: 'x' })).rejects.toMatchObject({
			status: 400
		});
		await expect(post({ step: 'drop' })).rejects.toMatchObject({ status: 400 });
		await expect(post('{nope')).rejects.toMatchObject({ status: 400 });
		await expect(post({ step: 'settings' }, false)).rejects.toMatchObject({ status: 401 });
	});
});
