import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { BackupError, createBackups, type Backups } from './backup.ts';
import { openDatabase } from './db/index.ts';
import {
	chargeSession,
	electricityPrice,
	exportTemplate,
	trip,
	user,
	vehicleApiCredential,
	vehicleConnection
} from './db/schema.ts';
import { annualTemplate } from './export/fixtures.ts';
import { normalizeHomeLayout } from '../home-layout.ts';

const T0 = Date.UTC(2026, 8, 1, 7);
let db: ReturnType<typeof openDatabase>['db'];
let backups: Backups;

const tripRow = (connectionId: string, hour: number, extra: object = {}) => ({
	id: `${connectionId}-t${hour}`,
	connectionId,
	startAt: new Date(T0 + hour * 3600_000),
	endAt: new Date(T0 + hour * 3600_000 + 1800_000),
	distanceKm: 12.5,
	startLatitude: 50.1,
	startLongitude: 7.1,
	purpose: 'business',
	note: 'Kunde',
	...extra
});

beforeEach(async () => {
	db = openDatabase(':memory:').db;
	backups = createBackups(db);
	await db
		.insert(user)
		.values(['alice', 'bob'].map((id) => ({ id, name: id, email: `${id}@example.com` })));
	await db.insert(vehicleConnection).values([
		{
			id: 'c1',
			userId: 'alice',
			providerId: 'connect-query',
			label: 'Ferdinand',
			externalId: 'VIN-A',
			accessToken: 'ENCRYPTED-ACCESS',
			refreshToken: 'ENCRYPTED-REFRESH',
			accessTokenExpiresAt: new Date(T0),
			batteryCapacityKwh: 70,
			homeLatitude: 50.1,
			homeLongitude: 7.1,
			createdAt: new Date(T0)
		},
		{
			id: 'c2',
			userId: 'bob',
			providerId: 'connect-query',
			label: 'Bobs Auto',
			accessToken: 'x',
			accessTokenExpiresAt: new Date(T0)
		}
	]);
	await db.insert(vehicleApiCredential).values({
		userId: 'alice',
		clientId: 'CLIENT-ID',
		clientSecret: 'CLIENT-SECRET'
	});
	await db.insert(trip).values([tripRow('c1', 0), tripRow('c1', 5, { purpose: null, note: null })]);
	await db.insert(trip).values(tripRow('c2', 0));
	await db.insert(chargeSession).values({
		id: 's1',
		connectionId: 'c1',
		startAt: new Date(T0 + 10 * 3600_000),
		endAt: new Date(T0 + 14 * 3600_000),
		startSocPct: 20,
		endSocPct: 80,
		costEur: 12.4
	});
	await db.insert(electricityPrice).values({
		id: 'p1',
		connectionId: 'c1',
		kind: 'home',
		validFrom: '2026-01-01',
		ctPerKwh: 31
	});
	await db
		.update(user)
		.set({ homeLayout: JSON.stringify(normalizeHomeLayout([{ id: 'costs', on: true }])) })
		.where(eq(user.id, 'alice'));
	await db.insert(exportTemplate).values({
		id: 'x1',
		userId: 'alice',
		name: 'Jahr',
		kind: 'annual-mileage',
		data: annualTemplate()
	});
});

describe('backup export', () => {
	it('contains everything the owner entered and nothing secret', async () => {
		const backup = await backups.exportBackup('alice', '1.2.3', new Date(T0));
		expect(backup).toMatchObject({
			format: 'ev-dashboard-backup',
			version: 1,
			appVersion: '1.2.3',
			settings: { notificationPrefs: null }
		});
		expect(backup.vehicles).toHaveLength(1);
		const [v] = backup.vehicles;
		expect(v).toMatchObject({
			id: 'c1',
			label: 'Ferdinand',
			externalId: 'VIN-A',
			batteryCapacityKwh: 70
		});
		expect(v.trips.map((t) => t.purpose)).toEqual(['business', null]);
		expect(v.chargeSessions).toEqual([
			expect.objectContaining({ startSocPct: 20, endSocPct: 80, costEur: 12.4 })
		]);
		expect(v.prices).toEqual([{ kind: 'home', validFrom: '2026-01-01', ctPerKwh: 31 }]);
		expect(backup.templates).toHaveLength(1);

		const text = JSON.stringify(backup);
		for (const secret of ['ENCRYPTED', 'CLIENT-', 'Bobs', '"c2"'])
			expect(text).not.toContain(secret);
	});

	it('summarises what a backup would contain', async () => {
		expect(await backups.summary('alice')).toEqual({
			vehicles: 1,
			trips: 2,
			chargeSessions: 1,
			prices: true,
			templates: 1,
			settings: true
		});
		expect(await backups.summary('bob')).toMatchObject({ vehicles: 1, trips: 1, prices: false });
	});
});

describe('backup import', () => {
	async function exported() {
		return (await backups.exportBackup('alice', '1', new Date(T0))).vehicles[0];
	}

	it('adds to an existing vehicle, skips duplicates and keeps existing settings', async () => {
		const v = await exported();
		await db
			.update(vehicleConnection)
			.set({ batteryCapacityKwh: null, homeLatitude: 1, homeLongitude: 2 })
			.where(eq(vehicleConnection.id, 'c1'));
		const { trips, chargeSessions, ...info } = v;
		const result = await backups.importVehicle(
			'alice',
			{
				...info,
				prices: [...info.prices, { kind: 'away', validFrom: '2026-02-01', ctPerKwh: 59 }]
			},
			{ connectionId: 'c1' }
		);
		expect(result).toEqual({ connectionId: 'c1', created: false, prices: 1 });
		const row = await db.query.vehicleConnection.findFirst({
			where: eq(vehicleConnection.id, 'c1')
		});
		expect(row).toMatchObject({ batteryCapacityKwh: 70, homeLatitude: 1, homeLongitude: 2 });

		const extra = {
			...trips[0],
			startAt: new Date(T0 + 48 * 3600_000).toISOString(),
			endAt: new Date(T0 + 49 * 3600_000).toISOString()
		};
		expect(await backups.importTrips('alice', 'c1', [...trips, extra])).toEqual({
			added: 1,
			skipped: 2
		});
		expect(await backups.importCharges('alice', 'c1', chargeSessions)).toEqual({
			added: 0,
			skipped: 1
		});
	});

	it('creates a vehicle that waits to be connected again', async () => {
		const { trips, chargeSessions, ...info } = await exported();
		const result = await backups.importVehicle('bob', info, { create: true });
		expect(result).toMatchObject({ created: true, prices: 1 });
		const row = await db.query.vehicleConnection.findFirst({
			where: eq(vehicleConnection.id, result!.connectionId)
		});
		expect(row).toMatchObject({
			userId: 'bob',
			label: 'Ferdinand',
			externalId: 'VIN-A',
			status: 'reauth',
			lastError: 'imported',
			accessToken: '',
			batteryCapacityKwh: 70
		});
		expect(await backups.importTrips('bob', result!.connectionId, trips)).toEqual({
			added: 2,
			skipped: 0
		});
		expect(await backups.importCharges('bob', result!.connectionId, chargeSessions)).toEqual({
			added: 1,
			skipped: 0
		});
	});

	it('never writes into another account', async () => {
		const { trips, ...info } = await exported();
		expect(await backups.importVehicle('alice', info, { connectionId: 'c2' })).toBeUndefined();
		expect(await backups.importTrips('alice', 'c2', trips)).toBeUndefined();
		expect(await backups.importCharges('alice', 'c2', [])).toBeUndefined();
	});

	it('refuses values outside their range', async () => {
		const { trips, ...info } = await exported();
		const bad: [unknown, string][] = [
			[{ ...trips[0], distanceKm: -1 }, 'trip.distanceKm'],
			[{ ...trips[0], startAt: 'gestern' }, 'trip.startAt'],
			[{ ...trips[0], endAt: '2026-01-01T00:00:00Z' }, 'trip.endAt'],
			[{ ...trips[0], purpose: 'secret' }, 'trip.purpose'],
			[{ ...trips[0], note: 'x'.repeat(501) }, 'trip.note'],
			[{ ...trips[0], startLatitude: 91 }, 'trip.startLatitude'],
			['nope', 'trip']
		];
		for (const [value, field] of bad) {
			await expect(backups.importTrips('alice', 'c1', [value])).rejects.toMatchObject({ field });
		}
		await expect(
			backups.importTrips('alice', 'c1', new Array(501).fill(trips[0]))
		).rejects.toBeInstanceOf(BackupError);
		await expect(
			backups.importVehicle(
				'alice',
				{ ...info, prices: [{ kind: 'home', validFrom: '1.1.2026', ctPerKwh: 30 }] },
				{ create: true }
			)
		).rejects.toMatchObject({ field: 'price.validFrom' });
		expect(await db.select().from(trip)).toHaveLength(3);
	});

	it('fills in settings only where none were chosen', async () => {
		const settings = {
			homeLayout: [{ id: 'range', on: false }],
			notificationPrefs: { lowChargePct: 30 }
		};
		expect(await backups.importSettings('alice', settings)).toBe(true);
		const [row] = await db.select().from(user).where(eq(user.id, 'alice'));
		expect(JSON.parse(row.homeLayout!)[0]).toEqual({ id: 'costs', on: true });
		expect(JSON.parse(row.notificationPrefs!).lowChargePct).toBe(30);
		expect(await backups.importSettings('alice', settings)).toBe(false);
	});

	it('adds templates after checking them like an upload', async () => {
		const data = annualTemplate().toString('base64');
		expect(await backups.importTemplate('alice', { name: 'Jahr', data })).toBe('skipped');
		expect(await backups.importTemplate('bob', { name: 'Jahr', data })).toBe('added');
		await expect(
			backups.importTemplate('bob', {
				name: 'x',
				data: Buffer.from('not a workbook').toString('base64')
			})
		).rejects.toMatchObject({ field: 'template.data' });
		await expect(
			backups.importTemplate('bob', { name: 'x', data: '<script>' })
		).rejects.toBeInstanceOf(BackupError);
	});

	it('round-trips into an empty account', async () => {
		const backup = await backups.exportBackup('alice', '1', new Date(T0));
		await db.insert(user).values({ id: 'carol', name: 'carol', email: 'carol@example.com' });
		for (const v of backup.vehicles) {
			const { trips, chargeSessions, ...info } = v;
			const { connectionId } = (await backups.importVehicle('carol', info, { create: true }))!;
			await backups.importTrips('carol', connectionId, trips);
			await backups.importCharges('carol', connectionId, chargeSessions);
		}
		await backups.importSettings('carol', backup.settings);
		for (const t of backup.templates) await backups.importTemplate('carol', t);
		const again = await backups.exportBackup('carol', '1', new Date(T0));
		const strip = (b: typeof backup) => ({
			...b,
			vehicles: b.vehicles.map((v) => ({ ...v, id: '' })),
			templates: b.templates.map((t) => ({ ...t, createdAt: '' }))
		});
		expect(strip(again)).toEqual(strip(backup));
	});
});
