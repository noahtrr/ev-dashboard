import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.ts';
import {
	chargeSession,
	snapshot,
	trip,
	tripPeriod,
	user,
	vehicleConnection
} from '../db/schema.ts';
import type { VehicleData } from '../providers/types.ts';
import { createLogbook, periodPurpose, type Logbook, type ManualTrip } from './logbook.ts';

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
	it('keeps finished charging sessions, so their costs outlive the snapshots', async () => {
		const charging = (soc: number): VehicleData => ({
			...parked(100, 52.5),
			stateOfChargePct: soc,
			chargingState: 'charging'
		});
		await fetched(0, { ...parked(100, 52.5), stateOfChargePct: 40 });
		await fetched(5, charging(45));
		await fetched(10, charging(52));
		await logbook.recordAll();
		expect(await db.select().from(chargeSession)).toEqual([]);

		await fetched(15, { ...parked(100, 52.5), stateOfChargePct: 52 });
		await fetched(20, { ...parked(100, 52.5), stateOfChargePct: 52 });
		await logbook.recordAll();
		await logbook.record('c1', new Date(0));
		const rows = await db.select().from(chargeSession);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			connectionId: 'c1',
			startAt: new Date(T0 + 5 * MIN),
			endAt: new Date(T0 + 10 * MIN),
			startSocPct: 40,
			endSocPct: 52,
			latitude: 52.5,
			priceCtPerKwh: null,
			costEur: null
		});
	});

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

	it('stores the mean outside temperature and fills it in for trips logged without it', async () => {
		await fetched(0, { ...parked(100, 52.5), outsideTempC: 8 });
		await fetched(5, { ...moving(104, 52.53), outsideTempC: 10 });
		await fetched(10, { ...parked(110, 52.56), outsideTempC: 12 });
		await fetched(15, parked(110, 52.56));
		await logbook.record('c1', new Date(0));
		expect((await db.select().from(trip))[0].outsideTempC).toBe(10);

		// A row from before the column existed is completed, an existing value is kept.
		await db.update(trip).set({ outsideTempC: null, purpose: 'private' });
		await logbook.record('c1', new Date(0));
		expect((await db.select().from(trip))[0]).toMatchObject({
			outsideTempC: 10,
			purpose: 'private'
		});
		await db.update(trip).set({ outsideTempC: 3 });
		await logbook.record('c1', new Date(0));
		expect((await db.select().from(trip))[0].outsideTempC).toBe(3);
	});

	it('marks the trips of a period and gives its purpose to trips recorded later', async () => {
		await fetched(0, parked(100, 52.5));
		await fetched(5, moving(104, 52.53));
		await fetched(10, parked(110, 52.56));
		await fetched(15, parked(110, 52.56));
		await logbook.recordAll();
		const [first] = await db.select().from(trip);
		await logbook.classify('alice', 'c1', first.id, { purpose: 'business', note: null });

		const period = {
			fromDay: '2026-10-18',
			toDay: '2026-10-19',
			fromAt: new Date(T0 - 60 * MIN),
			toAt: new Date(T0 + 48 * 60 * MIN),
			purpose: 'private' as const
		};
		expect(await logbook.addPeriod('bob', 'c1', period, true)).toBeUndefined();
		// Without overwriting, a trip that already has a purpose keeps it.
		expect(await logbook.addPeriod('alice', 'c1', period, false)).toBe(0);
		expect((await db.select().from(trip))[0].purpose).toBe('business');
		expect(await logbook.addPeriod('alice', 'c1', period, true)).toBe(1);
		expect((await db.select().from(trip))[0].purpose).toBe('private');

		// A later trip inside the period is recorded as private.
		await fetched(30, moving(115, 52.6));
		await fetched(35, parked(120, 52.62));
		await fetched(40, parked(120, 52.62));
		await logbook.recordAll();
		const rows = await db.select().from(trip).orderBy(trip.startAt);
		expect(rows.map((r) => r.purpose)).toEqual(['private', 'private']);

		const periods = await logbook.periods('alice', 'c1');
		expect(periods).toHaveLength(2);
		expect(await logbook.periods('bob', 'c1')).toEqual([]);
		expect(await logbook.removePeriod('bob', 'c1', periods[0].id)).toBe(false);
		expect(await logbook.removePeriod('alice', 'c1', periods[0].id)).toBe(true);
		expect(await db.select().from(tripPeriod)).toHaveLength(1);
	});

	it('lets the newest period win where periods overlap', () => {
		const row = (purpose: string, created: number) => ({
			id: purpose,
			connectionId: 'c1',
			fromDay: '',
			toDay: '',
			fromAt: new Date(0),
			toAt: new Date(100),
			purpose,
			createdAt: new Date(created)
		});
		expect(periodPurpose([row('business', 2), row('private', 1)], new Date(50))).toBe('business');
		expect(periodPurpose([row('business', 1), row('private', 2)], new Date(50))).toBe('private');
		expect(periodPurpose([row('business', 1)], new Date(100))).toBeNull();
	});

	it('adds, changes and removes trips entered by hand', async () => {
		const manual: ManualTrip = {
			startAt: new Date(T0 - 30 * 24 * 60 * MIN),
			endAt: new Date(T0 - 30 * 24 * 60 * MIN + 45 * MIN),
			distanceKm: 42,
			startOdometerKm: 1000,
			endOdometerKm: 1042,
			startAddress: 'Zuhause',
			endAddress: null,
			purpose: 'business',
			note: 'Kunde'
		};
		expect(await logbook.addManual('bob', 'c1', manual)).toBeUndefined();
		const id = await logbook.addManual('alice', 'c1', manual);
		expect(typeof id).toBe('string');
		// The same time cannot hold two trips.
		expect(await logbook.addManual('alice', 'c1', { ...manual, distanceKm: 1 })).toBe('overlap');

		const listed = await logbook.manualTrips('alice', 'c1');
		expect(listed).toEqual([expect.objectContaining({ id, manual: true, distanceKm: 42 })]);
		expect(await logbook.manualTrips('bob', 'c1')).toEqual([]);

		expect(await logbook.updateManual('bob', 'c1', id!, manual)).toBe(false);
		expect(await logbook.updateManual('alice', 'c1', id!, { ...manual, purpose: 'private' })).toBe(
			true
		);
		expect((await logbook.getManual('alice', 'c1', id!))?.purpose).toBe('private');

		// Recorded trips cannot be changed or removed as manual ones.
		await fetched(0, parked(100, 52.5));
		await fetched(5, moving(104, 52.53));
		await fetched(10, parked(110, 52.56));
		await fetched(15, parked(110, 52.56));
		await logbook.recordAll();
		const recorded = (await db.select().from(trip)).find((r) => !r.manual)!;
		expect(await logbook.getManual('alice', 'c1', recorded.id)).toBeUndefined();
		expect(await logbook.removeManual('alice', 'c1', recorded.id)).toBe(false);

		expect(await logbook.removeManual('bob', 'c1', id!)).toBe(false);
		expect(await logbook.removeManual('alice', 'c1', id!)).toBe(true);
		expect(await db.select().from(trip)).toHaveLength(1);
	});
});
