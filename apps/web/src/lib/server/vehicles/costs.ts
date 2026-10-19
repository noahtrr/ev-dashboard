// Charging cost settings and the logged sessions they apply to. Amounts are computed in the
// browser (see lib/costs.ts), where the owner's calendar days are known.
import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
	distanceM,
	HOME_RADIUS_M,
	PRICE_KINDS,
	type CostSession,
	type Price,
	type PriceKind
} from '../../costs.ts';
import type { Database } from '../db/index.ts';
import { chargeSession, electricityPrice, vehicleConnection } from '../db/schema.ts';
import type { ChargeSession } from './charging.ts';

export const PRICE_MIN_CT = 0;
export const PRICE_MAX_CT = 500;
export const COST_MAX_EUR = 1000;
export const LOSS_MAX_PCT = 50;

export const isPriceKind = (value: unknown): value is PriceKind =>
	typeof value === 'string' && (PRICE_KINDS as readonly string[]).includes(value);

/** `YYYY-MM-DD` of a real calendar day. */
export function isDay(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export type CostSettings = {
	home: { latitude: number; longitude: number } | null;
	/** Null means the default. */
	lossPct: number | null;
	prices: Price[];
};

export type SessionEntry = { priceCt: number | null; costEur: number | null };

export function createCosts(db: Database) {
	async function owned(userId: string, connectionId: string) {
		return db.query.vehicleConnection.findFirst({
			columns: { id: true, homeLatitude: true, homeLongitude: true, chargingLossPct: true },
			where: and(eq(vehicleConnection.id, connectionId), eq(vehicleConnection.userId, userId))
		});
	}

	async function settings(userId: string, connectionId: string): Promise<CostSettings | undefined> {
		const row = await owned(userId, connectionId);
		if (!row) return undefined;
		const prices = await db
			.select()
			.from(electricityPrice)
			.where(eq(electricityPrice.connectionId, connectionId))
			.orderBy(asc(electricityPrice.kind), asc(electricityPrice.validFrom));
		return {
			home:
				row.homeLatitude !== null && row.homeLongitude !== null
					? { latitude: row.homeLatitude, longitude: row.homeLongitude }
					: null,
			lossPct: row.chargingLossPct,
			prices: prices.flatMap((p) =>
				isPriceKind(p.kind) ? [{ id: p.id, kind: p.kind, from: p.validFrom, ct: p.ctPerKwh }] : []
			)
		};
	}

	/** Sets the price of `kind` from `from` on; replaces one with the same start day. */
	async function setPrice(
		userId: string,
		connectionId: string,
		kind: PriceKind,
		from: string,
		ct: number
	): Promise<boolean> {
		if (!(await owned(userId, connectionId))) return false;
		await db
			.insert(electricityPrice)
			.values({ id: randomUUID(), connectionId, kind, validFrom: from, ctPerKwh: ct })
			.onConflictDoUpdate({
				target: [electricityPrice.connectionId, electricityPrice.kind, electricityPrice.validFrom],
				set: { ctPerKwh: ct }
			});
		return true;
	}

	async function deletePrice(userId: string, connectionId: string, id: string): Promise<boolean> {
		if (!(await owned(userId, connectionId))) return false;
		await db
			.delete(electricityPrice)
			.where(and(eq(electricityPrice.id, id), eq(electricityPrice.connectionId, connectionId)));
		return true;
	}

	async function update(
		userId: string,
		connectionId: string,
		values: Partial<typeof vehicleConnection.$inferInsert>
	): Promise<boolean> {
		if (!(await owned(userId, connectionId))) return false;
		await db
			.update(vehicleConnection)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(vehicleConnection.id, connectionId));
		return true;
	}

	const setLoss = (userId: string, connectionId: string, pct: number | null) =>
		update(userId, connectionId, { chargingLossPct: pct });

	const setHome = (
		userId: string,
		connectionId: string,
		home: { latitude: number; longitude: number } | null
	) =>
		update(userId, connectionId, {
			homeLatitude: home?.latitude ?? null,
			homeLongitude: home?.longitude ?? null
		});

	/** Logged sessions, oldest first, with whether each was charged at home. */
	async function sessions(userId: string, connectionId: string): Promise<CostSession[]> {
		const row = await owned(userId, connectionId);
		if (!row) return [];
		const rows = await db
			.select()
			.from(chargeSession)
			.where(eq(chargeSession.connectionId, connectionId))
			.orderBy(asc(chargeSession.startAt));
		return rows.map((s) => ({
			t: s.startAt.getTime(),
			end: s.endAt.getTime(),
			addedPct:
				s.startSocPct !== null && s.endSocPct !== null
					? Math.max(0, s.endSocPct - s.startSocPct)
					: null,
			home: isHome(row, s.latitude, s.longitude),
			priceCt: s.priceCtPerKwh,
			costEur: s.costEur
		}));
	}

	/** What the owner entered for the session starting at `start`, if it is logged. */
	async function entry(
		userId: string,
		connectionId: string,
		start: Date
	): Promise<SessionEntry | undefined> {
		if (!(await owned(userId, connectionId))) return undefined;
		const row = await db.query.chargeSession.findFirst({
			columns: { priceCtPerKwh: true, costEur: true },
			where: and(eq(chargeSession.connectionId, connectionId), eq(chargeSession.startAt, start))
		});
		return row ? { priceCt: row.priceCtPerKwh, costEur: row.costEur } : undefined;
	}

	/** Stores the owner's price or total for a session; logs the session if it is not yet. */
	async function setEntry(
		userId: string,
		connectionId: string,
		session: ChargeSession,
		value: SessionEntry
	): Promise<boolean> {
		if (!(await owned(userId, connectionId))) return false;
		await db
			.insert(chargeSession)
			.values({
				id: randomUUID(),
				connectionId,
				startAt: session.start,
				endAt: session.end,
				startSocPct: session.startSocPct ?? null,
				endSocPct: session.endSocPct ?? null,
				latitude: session.latitude ?? null,
				longitude: session.longitude ?? null,
				priceCtPerKwh: value.priceCt,
				costEur: value.costEur
			})
			.onConflictDoUpdate({
				target: [chargeSession.connectionId, chargeSession.startAt],
				set: {
					priceCtPerKwh: value.priceCt,
					costEur: value.costEur,
					updatedAt: sql`(cast(unixepoch('subsecond') * 1000 as integer))`
				}
			});
		return true;
	}

	return { settings, setPrice, deletePrice, setLoss, setHome, sessions, entry, setEntry };
}

/** Within the home radius of the connection's home location. */
export function isHome(
	home: { homeLatitude: number | null; homeLongitude: number | null },
	latitude: number | null | undefined,
	longitude: number | null | undefined
): boolean {
	if (home.homeLatitude === null || home.homeLongitude === null) return false;
	if (latitude === null || latitude === undefined || longitude === null || longitude === undefined)
		return false;
	return distanceM(home.homeLatitude, home.homeLongitude, latitude, longitude) <= HOME_RADIUS_M;
}

export type Costs = ReturnType<typeof createCosts>;
