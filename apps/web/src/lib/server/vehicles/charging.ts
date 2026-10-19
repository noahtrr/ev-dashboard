// Charging sessions derived from the stored snapshot time series. The provider reports the
// current state only, so a session is a run of consecutive snapshots that show charging.
import type { VehicleData } from '../providers/types.ts';

export type HistoryPoint = { at: Date; data: VehicleData };

export type ChargeSession = {
	start: Date;
	/** Last snapshot that still showed charging. */
	end: Date;
	/** Still charging at the newest snapshot. */
	ongoing: boolean;
	startSocPct?: number;
	endSocPct?: number;
	/** Percentage points added. */
	addedPct?: number;
	/** Energy added, estimated from `addedPct` and the usable capacity the user entered. */
	addedKwh?: number;
	latitude?: number;
	longitude?: number;
	/** Latest estimate while charging. */
	timeToFullChargeMin?: number;
};

function isCharging(point: HistoryPoint, previous: HistoryPoint | undefined): boolean {
	const { chargingState, pluggedIn, stateOfChargePct } = point.data;
	if (chargingState) return chargingState === 'charging';
	// Without a charging status: plugged in and the state of charge went up.
	const before = previous?.data.stateOfChargePct;
	return (
		pluggedIn === true &&
		stateOfChargePct !== undefined &&
		before !== undefined &&
		stateOfChargePct > before
	);
}

/**
 * Groups charging snapshots into sessions. `points` must be sorted by time, oldest first.
 * Two charging snapshots further apart than `maxGapMs` (missed polls, vehicle offline)
 * belong to different sessions. A session at the end of the series counts as ongoing while its
 * last snapshot is no older than `maxGapMs`. Returns the newest session first.
 */
export function deriveSessions(
	points: HistoryPoint[],
	maxGapMs: number,
	now = Date.now()
): ChargeSession[] {
	const sessions: ChargeSession[] = [];
	let current: ChargeSession | undefined;
	let lastCharging: HistoryPoint | undefined;

	const close = () => {
		if (!current) return;
		if (current.startSocPct !== undefined && current.endSocPct !== undefined) {
			current.addedPct = Math.max(0, current.endSocPct - current.startSocPct);
		}
		sessions.push(current);
		current = undefined;
	};

	points.forEach((point, i) => {
		const previous = points[i - 1];
		if (!isCharging(point, previous)) {
			close();
			lastCharging = undefined;
			return;
		}
		if (current && lastCharging && point.at.getTime() - lastCharging.at.getTime() > maxGapMs) {
			close();
		}
		const soc = point.data.stateOfChargePct;
		if (!current) {
			// The snapshot just before the session (if recent) holds the starting level.
			const recentPrevious =
				previous && point.at.getTime() - previous.at.getTime() <= maxGapMs ? previous : undefined;
			const before = recentPrevious?.data.stateOfChargePct;
			const startSoc = before !== undefined && (soc === undefined || before <= soc) ? before : soc;
			current = {
				start: point.at,
				end: point.at,
				ongoing: false,
				...(startSoc !== undefined && { startSocPct: startSoc })
			};
		}
		current.end = point.at;
		if (soc !== undefined) {
			current.endSocPct = Math.max(current.endSocPct ?? soc, soc);
		}
		const { latitude, longitude, timeToFullChargeMin } = point.data;
		if (current.latitude === undefined && latitude !== undefined && longitude !== undefined) {
			current.latitude = latitude;
			current.longitude = longitude;
		}
		if (timeToFullChargeMin !== undefined) current.timeToFullChargeMin = timeToFullChargeMin;
		lastCharging = point;
	});

	// A run at the end is ongoing only while the data is recent.
	if (current && lastCharging && now - lastCharging.at.getTime() <= maxGapMs) {
		(current as ChargeSession).ongoing = true;
	}
	close();
	return sessions.reverse();
}

export const CAPACITY_MIN_KWH = 5;
export const CAPACITY_MAX_KWH = 250;

/** Parses the capacity form field: empty clears it, "77,4" and "77.4" are accepted. */
export function parseCapacity(
	value: FormDataEntryValue | null
): { ok: true; value: number | null } | { ok: false } {
	const text = typeof value === 'string' ? value.trim().replace(',', '.') : '';
	if (!text) return { ok: true, value: null };
	if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return { ok: false };
	const kwh = Number(text);
	if (kwh < CAPACITY_MIN_KWH || kwh > CAPACITY_MAX_KWH) return { ok: false };
	return { ok: true, value: kwh };
}

/** Energy for a number of percentage points, when the capacity is known. */
export const energyKwh = (pct: number | undefined, capacityKwh: number | null) =>
	pct === undefined || capacityKwh === null ? undefined : (pct / 100) * capacityKwh;

/** Adds the estimated energy to each session when the capacity is known. */
export const withEnergy = (sessions: ChargeSession[], capacityKwh: number | null) =>
	sessions.map((s) => ({ ...s, addedKwh: energyKwh(s.addedPct, capacityKwh) }));

/**
 * Thins a time series to about `max` points for a chart. Each bucket keeps its lowest and
 * highest value (in time order), so charging peaks and dips stay visible.
 */
export function thinSeries<T extends { t: number; soc: number }>(items: T[], max: number): T[] {
	const buckets = Math.floor(max / 2);
	if (items.length <= max || buckets < 1) return items;
	const size = items.length / buckets;
	const out: T[] = [];
	for (let b = 0; b < buckets; b++) {
		const slice = items.slice(Math.floor(b * size), Math.floor((b + 1) * size));
		if (slice.length === 0) continue;
		let lo = slice[0];
		let hi = slice[0];
		for (const item of slice) {
			if (item.soc < lo.soc) lo = item;
			if (item.soc > hi.soc) hi = item;
		}
		if (lo === hi) out.push(lo);
		else out.push(...(lo.t < hi.t ? [lo, hi] : [hi, lo]));
	}
	const last = items[items.length - 1];
	if (out[out.length - 1] !== last) out.push(last);
	return out;
}

export type SessionDetails = {
	startRangeKm?: number;
	endRangeKm?: number;
	odometerKm?: number;
	minOutsideTempC?: number;
	maxOutsideTempC?: number;
	/** Average charging speed in percentage points per hour. */
	pctPerHour?: number;
	/** Average power in kW, when the energy is known. */
	averageKw?: number;
	/** Provider's charging status text at the last snapshot. */
	statusRaw?: string;
	/** When the vehicle last reported its position during the session (ISO 8601). */
	positionAt?: string;
	/** Snapshots that make up the session. */
	samples: number;
};

/**
 * Collects everything the snapshots say about one session. `points` must contain the
 * session's snapshots; the one just before it supplies the starting range like
 * `deriveSessions` does for the state of charge.
 */
export function sessionDetails(
	points: HistoryPoint[],
	session: ChargeSession & { addedKwh?: number },
	maxGapMs: number
): SessionDetails {
	const start = session.start.getTime();
	const end = session.end.getTime();
	const inside = points.filter((p) => p.at.getTime() >= start && p.at.getTime() <= end);
	const before = points.filter((p) => p.at.getTime() < start).at(-1);
	const recentBefore = before && start - before.at.getTime() <= maxGapMs ? before : undefined;
	const first = <K extends keyof VehicleData>(key: K, list: HistoryPoint[]) =>
		list.find((p) => p.data[key] !== undefined)?.data[key];
	const last = <K extends keyof VehicleData>(key: K) =>
		inside.findLast((p) => p.data[key] !== undefined)?.data[key];
	const temps = inside.flatMap((p) =>
		p.data.outsideTempC === undefined ? [] : [p.data.outsideTempC]
	);
	const hours = (end - start) / 3_600_000;

	const details: SessionDetails = { samples: inside.length };
	const startRange = first('rangeKm', recentBefore ? [recentBefore, ...inside] : inside);
	const endRange = last('rangeKm');
	if (startRange !== undefined) details.startRangeKm = startRange;
	if (endRange !== undefined) details.endRangeKm = endRange;
	const odometer = first('odometerKm', inside);
	if (odometer !== undefined) details.odometerKm = odometer;
	if (temps.length) {
		details.minOutsideTempC = Math.min(...temps);
		details.maxOutsideTempC = Math.max(...temps);
	}
	// Under ten minutes the snapshot interval makes a rate meaningless.
	if (hours >= 1 / 6) {
		if (session.addedPct !== undefined) details.pctPerHour = session.addedPct / hours;
		if (session.addedKwh !== undefined) details.averageKw = session.addedKwh / hours;
	}
	const status = last('chargingStatusRaw');
	if (status !== undefined) details.statusRaw = status;
	const positionAt = last('positionAt');
	if (positionAt !== undefined) details.positionAt = positionAt;
	return details;
}
