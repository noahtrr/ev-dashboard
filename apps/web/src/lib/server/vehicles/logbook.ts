// Trip log: finished trips are copied from the snapshot series into the `trip` table, so
// they survive the snapshot retention and can carry what the owner records about them
// (private or business, purpose). Pages and exports read the table. Finished charging
// sessions are copied into `charge_session` the same way, for their costs.
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, isNull, lte, max, min, or, sql } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { chargeSession, snapshot, trip, vehicleConnection } from '../db/schema.ts';
import type { Geocoder } from '../geocode.ts';
import type { VehicleData } from '../providers/types.ts';
import { deriveSessions, type HistoryPoint } from './charging.ts';
import { deriveTrips, type Trip } from './trips.ts';

export const TRIP_PURPOSES = ['private', 'business'] as const;
export type TripPurpose = (typeof TRIP_PURPOSES)[number];
export const NOTE_MAX_LENGTH = 500;

export type LogEntry = typeof trip.$inferSelect;

/** How far back each update looks; trips are short compared with this. */
const RECORD_WINDOW_MS = 2 * 24 * 3600 * 1000;
/** Upper bound of addresses looked up in one run (the geocoder allows one per second). */
const ADDRESS_BATCH = 30;

export type LogbookOptions = {
	db: Database;
	/** Same value as the vehicle service, see `deriveTrips`. */
	maxGapMs: number;
	now?: () => number;
};

const parse = (text: string): VehicleData => {
	try {
		return JSON.parse(text) as VehicleData;
	} catch {
		return {};
	}
};

export const isPurpose = (value: unknown): value is TripPurpose =>
	typeof value === 'string' && (TRIP_PURPOSES as readonly string[]).includes(value);

export function createLogbook(options: LogbookOptions) {
	const { db, maxGapMs } = options;
	const now = options.now ?? Date.now;
	/** Newest snapshot already looked at, per connection. */
	const seen = new Map<string, number>();
	const filling = new Set<string>();

	async function points(connectionId: string, since: Date): Promise<HistoryPoint[]> {
		const rows = await db
			.select({ fetchedAt: snapshot.fetchedAt, data: snapshot.data })
			.from(snapshot)
			.where(and(eq(snapshot.connectionId, connectionId), gte(snapshot.fetchedAt, since)))
			.orderBy(asc(snapshot.fetchedAt));
		return rows.map((row) => ({ at: row.fetchedAt, data: parse(row.data) }));
	}

	function toRow(connectionId: string, t: Trip) {
		return {
			id: randomUUID(),
			connectionId,
			startAt: t.start,
			endAt: t.end,
			distanceKm: t.distanceKm,
			startOdometerKm: t.startOdometerKm ?? null,
			endOdometerKm: t.endOdometerKm ?? null,
			startSocPct: t.startSocPct ?? null,
			endSocPct: t.endSocPct ?? null,
			startLatitude: t.startLatitude ?? null,
			startLongitude: t.startLongitude ?? null,
			endLatitude: t.endLatitude ?? null,
			endLongitude: t.endLongitude ?? null,
			outsideTempC: t.outsideTempC ?? null,
			gap: t.gap
		};
	}

	/**
	 * Copies finished trips of one connection into the log. Without `since` it looks at the
	 * last two days, and only when a new snapshot arrived since the previous call. A trip
	 * is finished once a later snapshot shows the vehicle parked; trips that may have begun
	 * before the window are skipped, they were recorded by an earlier call. Charging sessions
	 * are copied by the same rules. Returns the number of rows written (new trips and
	 * sessions, back-filled temperatures).
	 */
	async function record(connectionId: string, since?: Date): Promise<number> {
		const [{ newest, oldest }] = await db
			.select({ newest: max(snapshot.fetchedAt), oldest: min(snapshot.fetchedAt) })
			.from(snapshot)
			.where(eq(snapshot.connectionId, connectionId));
		const newestMs = newest ? new Date(newest).getTime() : 0;
		if (!since && seen.get(connectionId) === newestMs) return 0;
		const from = since ?? new Date(now() - RECORD_WINDOW_MS);
		const series = await points(connectionId, from);
		seen.set(connectionId, newestMs);
		if (series.length < 2) return 0;
		const first = series[0].at.getTime();
		const last = series.at(-1)!.at.getTime();
		// With the whole history in view, a trip at the very beginning is complete too.
		const complete = since !== undefined || first <= new Date(oldest!).getTime();
		const isFinished = (t: { ongoing: boolean; start: Date; end: Date }) =>
			!t.ongoing && t.end.getTime() < last && (complete || t.start.getTime() > first);
		const finished = deriveTrips(series, maxGapMs, now()).filter(isFinished);
		const sessions = deriveSessions(series, maxGapMs, now()).filter(isFinished);
		let written = 0;
		if (finished.length > 0) {
			// Trips logged before the temperature was stored get it once the history is read again.
			const rows = await db
				.insert(trip)
				.values(finished.map((t) => toRow(connectionId, t)))
				.onConflictDoUpdate({
					target: [trip.connectionId, trip.startAt],
					set: { outsideTempC: sql`excluded.outside_temp_c` },
					setWhere: sql`${trip.outsideTempC} IS NULL AND excluded.outside_temp_c IS NOT NULL`
				})
				.returning({ id: trip.id });
			written += rows.length;
		}
		if (sessions.length > 0) {
			const rows = await db
				.insert(chargeSession)
				.values(
					sessions.map((s) => ({
						id: randomUUID(),
						connectionId,
						startAt: s.start,
						endAt: s.end,
						startSocPct: s.startSocPct ?? null,
						endSocPct: s.endSocPct ?? null,
						latitude: s.latitude ?? null,
						longitude: s.longitude ?? null
					}))
				)
				.onConflictDoNothing()
				.returning({ id: chargeSession.id });
			written += rows.length;
		}
		return written;
	}

	/** Records new trips of every connection; the first call reads the whole history. */
	async function recordAll(): Promise<void> {
		const connections = await db.select({ id: vehicleConnection.id }).from(vehicleConnection);
		for (const { id } of connections) {
			await record(id, seen.has(id) ? undefined : new Date(0));
		}
	}

	async function owned(userId: string, connectionId: string) {
		const row = await db.query.vehicleConnection.findFirst({
			columns: { id: true },
			where: and(eq(vehicleConnection.id, connectionId), eq(vehicleConnection.userId, userId))
		});
		return row !== undefined;
	}

	/** The owner's logged trips that started within [from, to], newest first. */
	async function list(
		userId: string,
		connectionId: string,
		from: Date,
		to: Date,
		order: 'asc' | 'desc' = 'desc'
	): Promise<LogEntry[]> {
		if (!(await owned(userId, connectionId))) return [];
		return db
			.select()
			.from(trip)
			.where(
				and(eq(trip.connectionId, connectionId), gte(trip.startAt, from), lte(trip.startAt, to))
			)
			.orderBy(order === 'asc' ? asc(trip.startAt) : desc(trip.startAt));
	}

	/** The owner's logged trip that was under way at `at` (its start counts). */
	async function find(userId: string, connectionId: string, at: Date) {
		if (!(await owned(userId, connectionId))) return undefined;
		return db.query.trip.findFirst({
			where: and(eq(trip.connectionId, connectionId), lte(trip.startAt, at), gte(trip.endAt, at)),
			orderBy: desc(trip.startAt)
		});
	}

	/** Sets purpose and note of a logged trip; false when it is not the owner's. */
	async function classify(
		userId: string,
		connectionId: string,
		id: string,
		values: { purpose: TripPurpose | null; note: string | null }
	): Promise<boolean> {
		if (!(await owned(userId, connectionId))) return false;
		const updated = await db
			.update(trip)
			.set({ ...values, updatedAt: new Date(now()) })
			.where(and(eq(trip.id, id), eq(trip.connectionId, connectionId)))
			.returning({ id: trip.id });
		return updated.length > 0;
	}

	/**
	 * Looks up missing start and destination addresses in the background, one connection
	 * at a time. Runs are not awaited by pages; a later run picks up what is left.
	 */
	function fillAddresses(connectionId: string, geocoder: Geocoder, language: string) {
		if (filling.has(connectionId)) return;
		filling.add(connectionId);
		void (async () => {
			try {
				const rows = await db
					.select()
					.from(trip)
					.where(
						and(
							eq(trip.connectionId, connectionId),
							or(isNull(trip.startAddress), isNull(trip.endAddress))
						)
					)
					.orderBy(desc(trip.startAt))
					.limit(ADDRESS_BATCH);
				for (const row of rows) {
					const set: { startAddress?: string; endAddress?: string } = {};
					if (
						row.startAddress === null &&
						row.startLatitude !== null &&
						row.startLongitude !== null
					) {
						const address = await geocoder.lookup(row.startLatitude, row.startLongitude, language);
						if (address) set.startAddress = address;
					}
					if (row.endAddress === null && row.endLatitude !== null && row.endLongitude !== null) {
						const address = await geocoder.lookup(row.endLatitude, row.endLongitude, language);
						if (address) set.endAddress = address;
					}
					if (set.startAddress || set.endAddress) {
						await db.update(trip).set(set).where(eq(trip.id, row.id));
					}
				}
			} catch (error) {
				console.warn('[logbook] address lookup failed:', (error as Error)?.name);
			} finally {
				filling.delete(connectionId);
			}
		})();
	}

	return { record, recordAll, list, find, classify, fillAddresses };
}

export type Logbook = ReturnType<typeof createLogbook>;
