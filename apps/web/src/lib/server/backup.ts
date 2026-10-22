// Per-account backup: everything an owner entered or collected, as one JSON file, and the
// import of such a file into this or another installation. Raw snapshots, sign-in data and the
// vehicle API credentials are never part of it. The import runs in small steps (one vehicle,
// a batch of trips, ...) so no request grows beyond the body size limit, and every step skips
// what already exists, so an interrupted import can simply be run again.
import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { BACKUP_FORMAT, BACKUP_VERSION, IMPORT_BATCH } from '../backup.ts';
import { normalizeHomeLayout } from '../home-layout.ts';
import { normalizeNotificationPrefs } from '../notifications.ts';
import type { Database } from './db/index.ts';
import {
	chargeSession,
	electricityPrice,
	exportTemplate,
	trip,
	tripPeriod,
	user,
	vehicleConnection
} from './db/schema.ts';
import {
	inspectTemplate,
	TEMPLATE_MAX_BYTES,
	TEMPLATE_NAME_MAX_LENGTH,
	TEMPLATES_PER_USER
} from './export/templates.ts';
import { COST_MAX_EUR, LOSS_MAX_PCT, PRICE_MAX_CT } from './vehicles/costs.ts';
import { NOTE_MAX_LENGTH } from './vehicles/logbook.ts';

export { BACKUP_FORMAT, BACKUP_VERSION, IMPORT_BATCH };

export type BackupPrice = { kind: 'home' | 'away'; validFrom: string; ctPerKwh: number };

export type BackupPeriod = {
	fromDay: string;
	toDay: string;
	fromAt: string;
	toAt: string;
	purpose: 'private' | 'business';
};

export type BackupTrip = {
	startAt: string;
	endAt: string;
	distanceKm: number;
	startOdometerKm: number | null;
	endOdometerKm: number | null;
	startSocPct: number | null;
	endSocPct: number | null;
	startLatitude: number | null;
	startLongitude: number | null;
	endLatitude: number | null;
	endLongitude: number | null;
	outsideTempC: number | null;
	startAddress: string | null;
	endAddress: string | null;
	gap: boolean;
	purpose: 'private' | 'business' | null;
	note: string | null;
	/** Entered by hand; missing in backups of earlier versions. */
	manual: boolean;
};

export type BackupCharge = {
	startAt: string;
	endAt: string;
	startSocPct: number | null;
	endSocPct: number | null;
	latitude: number | null;
	longitude: number | null;
	priceCtPerKwh: number | null;
	costEur: number | null;
};

/** A vehicle without its trips and sessions: what the first import step needs. */
export type BackupVehicleInfo = {
	/** Its ID in the exporting installation; only used to tell vehicles apart in the file. */
	id: string;
	providerId: string;
	label: string | null;
	externalId: string | null;
	batteryCapacityKwh: number | null;
	homeLatitude: number | null;
	homeLongitude: number | null;
	chargingLossPct: number | null;
	prices: BackupPrice[];
	/** Private or business periods; missing in backups of earlier versions. */
	periods: BackupPeriod[];
};

export type BackupVehicle = BackupVehicleInfo & {
	trips: BackupTrip[];
	chargeSessions: BackupCharge[];
};

export type BackupSettings = { homeLayout: unknown; notificationPrefs: unknown };

export type BackupTemplate = { name: string; data: string; createdAt: string };

export type Backup = {
	format: typeof BACKUP_FORMAT;
	version: number;
	createdAt: string;
	appVersion: string;
	settings: BackupSettings;
	vehicles: BackupVehicle[];
	templates: BackupTemplate[];
};

export type BackupSummary = {
	vehicles: number;
	trips: number;
	chargeSessions: number;
	prices: boolean;
	templates: number;
	settings: boolean;
};

// --- Validation of imported values ---------------------------------------------------------

export class BackupError extends Error {
	constructor(public field: string) {
		super(`invalid backup field: ${field}`);
	}
}

type Obj = Record<string, unknown>;

function object(value: unknown, field: string): Obj {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new BackupError(field);
	}
	return value as Obj;
}

function list(value: unknown, field: string, max: number): unknown[] {
	if (!Array.isArray(value) || value.length > max) throw new BackupError(field);
	return value;
}

function num(value: unknown, field: string, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
		throw new BackupError(field);
	}
	return value;
}

function optNum(value: unknown, field: string, min: number, max: number): number | null {
	return value === null || value === undefined ? null : num(value, field, min, max);
}

function str(value: unknown, field: string, max: number): string {
	if (typeof value !== 'string' || value.length > max) throw new BackupError(field);
	return value;
}

function optStr(value: unknown, field: string, max: number): string | null {
	return value === null || value === undefined ? null : str(value, field, max);
}

/** An ISO timestamp between 2000 and 2100. */
function time(value: unknown, field: string): Date {
	const text = str(value, field, 40);
	const date = new Date(text);
	const t = date.getTime();
	if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(t)) throw new BackupError(field);
	if (t < Date.UTC(2000, 0, 1) || t > Date.UTC(2100, 0, 1)) throw new BackupError(field);
	return date;
}

const lat = (v: unknown, f: string) => optNum(v, f, -90, 90);
const lon = (v: unknown, f: string) => optNum(v, f, -180, 180);
const pct = (v: unknown, f: string) => optNum(v, f, 0, 100);

export function parseVehicleInfo(value: unknown): BackupVehicleInfo {
	const v = object(value, 'vehicle');
	const prices = list(v.prices ?? [], 'prices', 1000).map((p) => {
		const o = object(p, 'price');
		const kind = o.kind;
		if (kind !== 'home' && kind !== 'away') throw new BackupError('price.kind');
		const price: BackupPrice['kind'] = kind;
		const validFrom = str(o.validFrom, 'price.validFrom', 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) throw new BackupError('price.validFrom');
		return {
			kind: price,
			validFrom,
			ctPerKwh: num(o.ctPerKwh, 'price.ctPerKwh', 0, PRICE_MAX_CT)
		};
	});
	const periods = list(v.periods ?? [], 'periods', 1000).map((p) => {
		const o = object(p, 'period');
		const purpose = o.purpose;
		if (purpose !== 'private' && purpose !== 'business') throw new BackupError('period.purpose');
		const day = (value: unknown, field: string) => {
			const text = str(value, field, 10);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new BackupError(field);
			return text;
		};
		const fromAt = time(o.fromAt, 'period.fromAt');
		const toAt = time(o.toAt, 'period.toAt');
		if (toAt <= fromAt) throw new BackupError('period.toAt');
		const period: BackupPeriod = {
			fromDay: day(o.fromDay, 'period.fromDay'),
			toDay: day(o.toDay, 'period.toDay'),
			fromAt: fromAt.toISOString(),
			toAt: toAt.toISOString(),
			purpose
		};
		return period;
	});
	return {
		id: str(v.id, 'vehicle.id', 64),
		providerId: str(v.providerId, 'vehicle.providerId', 64),
		label: optStr(v.label, 'vehicle.label', 200),
		externalId: optStr(v.externalId, 'vehicle.externalId', 200),
		batteryCapacityKwh: optNum(v.batteryCapacityKwh, 'vehicle.batteryCapacityKwh', 1, 1000),
		homeLatitude: lat(v.homeLatitude, 'vehicle.homeLatitude'),
		homeLongitude: lon(v.homeLongitude, 'vehicle.homeLongitude'),
		chargingLossPct: optNum(v.chargingLossPct, 'vehicle.chargingLossPct', 0, LOSS_MAX_PCT),
		prices,
		periods
	};
}

export function parseTrip(value: unknown): BackupTrip {
	const o = object(value, 'trip');
	const purpose = o.purpose ?? null;
	if (purpose !== null && purpose !== 'private' && purpose !== 'business') {
		throw new BackupError('trip.purpose');
	}
	const startAt = time(o.startAt, 'trip.startAt');
	const endAt = time(o.endAt, 'trip.endAt');
	if (endAt < startAt) throw new BackupError('trip.endAt');
	const odo = (v: unknown, f: string) => optNum(v, f, 0, 10_000_000);
	return {
		startAt: startAt.toISOString(),
		endAt: endAt.toISOString(),
		distanceKm: num(o.distanceKm, 'trip.distanceKm', 0, 100_000),
		startOdometerKm: odo(o.startOdometerKm, 'trip.startOdometerKm'),
		endOdometerKm: odo(o.endOdometerKm, 'trip.endOdometerKm'),
		startSocPct: pct(o.startSocPct, 'trip.startSocPct'),
		endSocPct: pct(o.endSocPct, 'trip.endSocPct'),
		startLatitude: lat(o.startLatitude, 'trip.startLatitude'),
		startLongitude: lon(o.startLongitude, 'trip.startLongitude'),
		endLatitude: lat(o.endLatitude, 'trip.endLatitude'),
		endLongitude: lon(o.endLongitude, 'trip.endLongitude'),
		outsideTempC: optNum(o.outsideTempC, 'trip.outsideTempC', -100, 100),
		startAddress: optStr(o.startAddress, 'trip.startAddress', 500),
		endAddress: optStr(o.endAddress, 'trip.endAddress', 500),
		gap: o.gap === true,
		purpose,
		note: optStr(o.note, 'trip.note', NOTE_MAX_LENGTH),
		manual: o.manual === true
	};
}

export function parseCharge(value: unknown): BackupCharge {
	const o = object(value, 'chargeSession');
	const startAt = time(o.startAt, 'chargeSession.startAt');
	const endAt = time(o.endAt, 'chargeSession.endAt');
	if (endAt < startAt) throw new BackupError('chargeSession.endAt');
	return {
		startAt: startAt.toISOString(),
		endAt: endAt.toISOString(),
		startSocPct: pct(o.startSocPct, 'chargeSession.startSocPct'),
		endSocPct: pct(o.endSocPct, 'chargeSession.endSocPct'),
		latitude: lat(o.latitude, 'chargeSession.latitude'),
		longitude: lon(o.longitude, 'chargeSession.longitude'),
		priceCtPerKwh: optNum(o.priceCtPerKwh, 'chargeSession.priceCtPerKwh', 0, PRICE_MAX_CT),
		costEur: optNum(o.costEur, 'chargeSession.costEur', 0, COST_MAX_EUR)
	};
}

// --- Service ---------------------------------------------------------------------------------

export type ImportTarget = { connectionId: string } | { create: true };
export type ImportCount = { added: number; skipped: number };

export function createBackups(db: Database) {
	const iso = (d: Date | null) => (d ? d.toISOString() : null);

	async function summary(userId: string): Promise<BackupSummary> {
		const connections = await db
			.select({ id: vehicleConnection.id, home: vehicleConnection.homeLatitude })
			.from(vehicleConnection)
			.where(eq(vehicleConnection.userId, userId));
		const ids = connections.map((c) => c.id);
		const countIn = async (
			table: typeof trip | typeof chargeSession | typeof electricityPrice
		): Promise<number> =>
			ids.length === 0
				? 0
				: (await db.select({ n: count() }).from(table).where(inArray(table.connectionId, ids)))[0]
						.n;
		const [templates] = await db
			.select({ n: count() })
			.from(exportTemplate)
			.where(eq(exportTemplate.userId, userId));
		const [settings] = await db
			.select({ layout: user.homeLayout, prefs: user.notificationPrefs })
			.from(user)
			.where(eq(user.id, userId));
		return {
			vehicles: connections.length,
			trips: await countIn(trip),
			chargeSessions: await countIn(chargeSession),
			prices: (await countIn(electricityPrice)) > 0 || connections.some((c) => c.home !== null),
			templates: templates.n,
			settings: Boolean(settings?.layout || settings?.prefs)
		};
	}

	async function exportBackup(userId: string, appVersion: string, now = new Date()) {
		const [settings] = await db
			.select({ homeLayout: user.homeLayout, notificationPrefs: user.notificationPrefs })
			.from(user)
			.where(eq(user.id, userId));
		const parse = (text: string | null | undefined) => {
			try {
				return text ? JSON.parse(text) : null;
			} catch {
				return null;
			}
		};
		const connections = await db
			.select()
			.from(vehicleConnection)
			.where(eq(vehicleConnection.userId, userId))
			.orderBy(asc(vehicleConnection.createdAt));
		const vehicles: BackupVehicle[] = [];
		for (const c of connections) {
			const prices = await db
				.select()
				.from(electricityPrice)
				.where(eq(electricityPrice.connectionId, c.id))
				.orderBy(asc(electricityPrice.kind), asc(electricityPrice.validFrom));
			const trips = await db
				.select()
				.from(trip)
				.where(eq(trip.connectionId, c.id))
				.orderBy(asc(trip.startAt));
			const charges = await db
				.select()
				.from(chargeSession)
				.where(eq(chargeSession.connectionId, c.id))
				.orderBy(asc(chargeSession.startAt));
			const periods = await db
				.select()
				.from(tripPeriod)
				.where(eq(tripPeriod.connectionId, c.id))
				.orderBy(asc(tripPeriod.createdAt));
			// Tokens, poll state and errors stay behind: they only mean something here.
			vehicles.push({
				id: c.id,
				providerId: c.providerId,
				label: c.label,
				externalId: c.externalId,
				batteryCapacityKwh: c.batteryCapacityKwh,
				homeLatitude: c.homeLatitude,
				homeLongitude: c.homeLongitude,
				chargingLossPct: c.chargingLossPct,
				prices: prices.map((p) => ({
					kind: p.kind as BackupPrice['kind'],
					validFrom: p.validFrom,
					ctPerKwh: p.ctPerKwh
				})),
				// Oldest first, so the import keeps which period was added last.
				periods: periods.map((p) => ({
					fromDay: p.fromDay,
					toDay: p.toDay,
					fromAt: p.fromAt.toISOString(),
					toAt: p.toAt.toISOString(),
					purpose: p.purpose as BackupPeriod['purpose']
				})),
				trips: trips.map((t) => ({
					startAt: t.startAt.toISOString(),
					endAt: t.endAt.toISOString(),
					distanceKm: t.distanceKm,
					startOdometerKm: t.startOdometerKm,
					endOdometerKm: t.endOdometerKm,
					startSocPct: t.startSocPct,
					endSocPct: t.endSocPct,
					startLatitude: t.startLatitude,
					startLongitude: t.startLongitude,
					endLatitude: t.endLatitude,
					endLongitude: t.endLongitude,
					outsideTempC: t.outsideTempC,
					startAddress: t.startAddress,
					endAddress: t.endAddress,
					gap: t.gap,
					purpose: t.purpose as BackupTrip['purpose'],
					note: t.note,
					manual: t.manual
				})),
				chargeSessions: charges.map((s) => ({
					startAt: s.startAt.toISOString(),
					endAt: s.endAt.toISOString(),
					startSocPct: s.startSocPct,
					endSocPct: s.endSocPct,
					latitude: s.latitude,
					longitude: s.longitude,
					priceCtPerKwh: s.priceCtPerKwh,
					costEur: s.costEur
				}))
			});
		}
		const templates = await db
			.select()
			.from(exportTemplate)
			.where(eq(exportTemplate.userId, userId))
			.orderBy(asc(exportTemplate.createdAt));
		const backup: Backup = {
			format: BACKUP_FORMAT,
			version: BACKUP_VERSION,
			createdAt: now.toISOString(),
			appVersion,
			settings: {
				homeLayout: parse(settings?.homeLayout),
				notificationPrefs: parse(settings?.notificationPrefs)
			},
			vehicles,
			templates: templates.map((t) => ({
				name: t.name,
				data: t.data.toString('base64'),
				createdAt: iso(t.createdAt)!
			}))
		};
		return backup;
	}

	async function owned(userId: string, connectionId: string) {
		const [row] = await db
			.select()
			.from(vehicleConnection)
			.where(and(eq(vehicleConnection.id, connectionId), eq(vehicleConnection.userId, userId)));
		return row;
	}

	/**
	 * First step per vehicle: picks or creates the vehicle and adds its settings and prices.
	 * A created vehicle has no access to the provider yet; it waits to be connected again.
	 * Settings of an existing vehicle are only filled in where they are empty.
	 */
	async function importVehicle(
		userId: string,
		input: unknown,
		target: ImportTarget
	): Promise<{ connectionId: string; created: boolean; prices: number } | undefined> {
		const v = parseVehicleInfo(input);
		const settings = {
			batteryCapacityKwh: v.batteryCapacityKwh,
			homeLatitude: v.homeLatitude,
			homeLongitude: v.homeLongitude,
			chargingLossPct: v.chargingLossPct
		};
		let connectionId: string;
		let created = false;
		if ('connectionId' in target) {
			const row = await owned(userId, target.connectionId);
			if (!row) return undefined;
			connectionId = row.id;
			const fill = Object.fromEntries(
				Object.entries(settings).filter(
					([key, value]) => value !== null && row[key as keyof typeof settings] === null
				)
			);
			// Home is one place: both coordinates or none.
			if (row.homeLatitude !== null || row.homeLongitude !== null) {
				delete fill.homeLatitude;
				delete fill.homeLongitude;
			}
			if (Object.keys(fill).length > 0) {
				await db
					.update(vehicleConnection)
					.set({ ...fill, updatedAt: new Date() })
					.where(eq(vehicleConnection.id, connectionId));
			}
		} else {
			connectionId = randomUUID();
			created = true;
			await db.insert(vehicleConnection).values({
				id: connectionId,
				userId,
				providerId: v.providerId,
				label: v.label,
				externalId: v.externalId,
				accessToken: '',
				accessTokenExpiresAt: new Date(0),
				status: 'reauth',
				lastError: 'imported',
				lastErrorAt: new Date(),
				...settings
			});
		}
		let prices = 0;
		for (const p of v.prices) {
			const result = await db
				.insert(electricityPrice)
				.values({ id: randomUUID(), connectionId, ...p })
				.onConflictDoNothing()
				.returning({ id: electricityPrice.id });
			prices += result.length;
		}
		const existing = await db
			.select()
			.from(tripPeriod)
			.where(eq(tripPeriod.connectionId, connectionId));
		let periods = 0;
		for (const p of v.periods) {
			const fromAt = new Date(p.fromAt);
			const toAt = new Date(p.toAt);
			const same = existing.some(
				(e) =>
					e.fromAt.getTime() === fromAt.getTime() &&
					e.toAt.getTime() === toAt.getTime() &&
					e.purpose === p.purpose
			);
			if (same) continue;
			// Spaced by a millisecond, so the order (newest wins) survives the import.
			await db.insert(tripPeriod).values({
				id: randomUUID(),
				connectionId,
				...p,
				fromAt,
				toAt,
				createdAt: new Date(Date.now() + periods)
			});
			periods += 1;
		}
		return { connectionId, created, prices };
	}

	async function importTrips(
		userId: string,
		connectionId: string,
		input: unknown
	): Promise<ImportCount | undefined> {
		const trips = list(input, 'trips', IMPORT_BATCH).map(parseTrip);
		if (!(await owned(userId, connectionId))) return undefined;
		let added = 0;
		for (const t of trips) {
			const result = await db
				.insert(trip)
				.values({
					...t,
					id: randomUUID(),
					connectionId,
					startAt: new Date(t.startAt),
					endAt: new Date(t.endAt)
				})
				.onConflictDoNothing()
				.returning({ id: trip.id });
			added += result.length;
		}
		return { added, skipped: trips.length - added };
	}

	async function importCharges(
		userId: string,
		connectionId: string,
		input: unknown
	): Promise<ImportCount | undefined> {
		const charges = list(input, 'chargeSessions', IMPORT_BATCH).map(parseCharge);
		if (!(await owned(userId, connectionId))) return undefined;
		let added = 0;
		for (const s of charges) {
			const result = await db
				.insert(chargeSession)
				.values({
					...s,
					id: randomUUID(),
					connectionId,
					startAt: new Date(s.startAt),
					endAt: new Date(s.endAt)
				})
				.onConflictDoNothing()
				.returning({ id: chargeSession.id });
			added += result.length;
		}
		return { added, skipped: charges.length - added };
	}

	/** Home page and notification choice, only where this account has not chosen yet. */
	async function importSettings(userId: string, input: unknown): Promise<boolean> {
		const s = object(input, 'settings');
		const [row] = await db
			.select({ layout: user.homeLayout, prefs: user.notificationPrefs })
			.from(user)
			.where(eq(user.id, userId));
		if (!row) return false;
		const set: { homeLayout?: string; notificationPrefs?: string } = {};
		if (!row.layout && Array.isArray(s.homeLayout)) {
			set.homeLayout = JSON.stringify(normalizeHomeLayout(s.homeLayout));
		}
		if (!row.prefs && s.notificationPrefs && typeof s.notificationPrefs === 'object') {
			set.notificationPrefs = JSON.stringify(normalizeNotificationPrefs(s.notificationPrefs));
		}
		if (Object.keys(set).length === 0) return false;
		await db.update(user).set(set).where(eq(user.id, userId));
		return true;
	}

	/** Adds a template unless one with the same content exists; checked like an upload. */
	async function importTemplate(
		userId: string,
		input: unknown
	): Promise<'added' | 'skipped' | 'full'> {
		const o = object(input, 'template');
		const name = str(o.name, 'template.name', TEMPLATE_NAME_MAX_LENGTH).trim();
		const encoded = str(o.data, 'template.data', Math.ceil(TEMPLATE_MAX_BYTES / 3) * 4);
		if (!name || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new BackupError('template.data');
		const data = Buffer.from(encoded, 'base64');
		if (data.length > TEMPLATE_MAX_BYTES) throw new BackupError('template.data');
		let kind: string;
		try {
			kind = inspectTemplate(data);
		} catch {
			throw new BackupError('template.data');
		}
		const existing = await db
			.select({ data: exportTemplate.data })
			.from(exportTemplate)
			.where(eq(exportTemplate.userId, userId));
		if (existing.some((e) => e.data.equals(data))) return 'skipped';
		if (existing.length >= TEMPLATES_PER_USER) return 'full';
		await db.insert(exportTemplate).values({ id: randomUUID(), userId, name, kind, data });
		return 'added';
	}

	/** The vehicles an import can add to; the provider ID helps to match them. */
	async function targets(userId: string) {
		return db
			.select({
				id: vehicleConnection.id,
				label: vehicleConnection.label,
				externalId: vehicleConnection.externalId
			})
			.from(vehicleConnection)
			.where(eq(vehicleConnection.userId, userId))
			.orderBy(asc(vehicleConnection.createdAt));
	}

	return {
		summary,
		targets,
		exportBackup,
		importVehicle,
		importTrips,
		importCharges,
		importSettings,
		importTemplate
	};
}

export type Backups = ReturnType<typeof createBackups>;
