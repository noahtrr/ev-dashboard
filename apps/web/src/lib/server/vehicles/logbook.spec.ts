import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.ts';
import { snapshot, trip, user, vehicleConnection } from '../db/schema.ts';
import type { VehicleData } from '../providers/types.ts';
import { createLogbook, type Logbook } from './logbook.ts';

const MIN = 60_000;
const T0 = Date.parse('2026-10-18T07:00:00Z');
const clock = { t: T0 };
let db: ReturnType<typeof openDatabase>['db'];
let logbook: Logbook;

const parked = (odometerKm: number, latitude: number): VehicleData => ({
	odometerKm,
	latitude,
	longitude: 13.4,
	ignitionOn: false
});
const moving = (odometerKm: number, latitude: number): VehicleData => ({
	...parked(odometerKm, latitude),
	ignitionOn: true
});

async function fetched(min: number, data: VehicleData, connectionId = 'c1') {
	await db.insert(snapshot).values({
		connectionId,
		fetchedAt: new Date(T0 + min * MIN),
		data: JSON.stringify(data),
		raw: '{}'
	});
	clock.t = T0 + min * MIN;
}

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	await db
		.insert(user)
		.values(['alice', 'bob'].map((id) => ({ id, name: id, email: `${id}@example.com` })));
	await db.insert(vehicleConnection).values({
		id: 'c1',
		userId: 'alice',
		providerId: 'mock',
		accessToken: 'x',
		accessTokenExpiresAt: new Date(T0)
	});
	logbook = createLogbook({ db, maxGapMs: 30 * MIN, now: () => clock.t });
});

describe('logbook', () => {
	it('records a trip once the vehicle is parked again, and only once', async () => {
		await fetched(0, parked(100, 52.5));
		await fetched(5, moving(104, 52.53));
		await logbook.recordAll();
		expect(await db.select().from(trip)).toEqual([]);

		await fetched(10, parked(110, 52.56));
		await logbook.recordAll();
		// The arrival snapshot is the last one, so the trip may still go on.
		expect(await db.select().from(trip)).toEqual([]);

		await fetched(15, parked(110, 52.56));
		await logbook.recordAll();
		await fetched(20, parked(110, 52.56));
		await logbook.recordAll();
		const rows = await db.select().from(trip);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			connectionId: 'c1',
			startAt: new Date(T0),
			endAt: new Date(T0 + 10 * MIN),
			distanceKm: 10,
			startOdometerKm: 100,
			endOdometerKm: 110,
			purpose: null
		});
	});

	it('lets only the owner list, find and classify trips', async () => {
		await fetched(0, parked(100, 52.5));
		await fetched(5, moving(104, 52.53));
		await fetched(10, parked(110, 52.56));
		await fetched(15, parked(110, 52.56));
		await logbook.recordAll();
		const from = new Date(T0 - MIN);
		const to = new Date(T0 + 60 * MIN);

		const [logged] = await logbook.list('alice', 'c1', from, to);
		expect(await logbook.list('bob', 'c1', from, to)).toEqual([]);
		expect((await logbook.find('alice', 'c1', new Date(T0 + 7 * MIN)))?.id).toBe(logged.id);
		expect(await logbook.find('bob', 'c1', new Date(T0))).toBeUndefined();

		expect(await logbook.classify('bob', 'c1', logged.id, { purpose: 'private', note: null })).toBe(
			false
		);
		expect(
			await logbook.classify('alice', 'c1', logged.id, { purpose: 'business', note: 'Kunde' })
		).toBe(true);
		const [after] = await logbook.list('alice', 'c1', from, to);
		expect(after).toMatchObject({ purpose: 'business', note: 'Kunde' });

		// Recording again keeps what the owner entered.
		await logbook.record('c1', new Date(0));
		expect((await logbook.list('alice', 'c1', from, to))[0]).toMatchObject({ purpose: 'business' });
	});
});
