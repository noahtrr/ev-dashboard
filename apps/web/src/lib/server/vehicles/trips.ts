// Trips derived from the stored snapshot time series. The provider reports the current
// state only, so a trip is a run of polling intervals in which the vehicle moved.
import { energyKwh, type HistoryPoint } from './charging.ts';

export type Trip = {
	/** Last snapshot before the vehicle moved. */
	start: Date;
	/** First snapshot that shows the vehicle at its destination (or the newest while driving). */
	end: Date;
	/** Still driving at the newest snapshot. */
	ongoing: boolean;
	/** Snapshots were missing during the trip, so its timing is uncertain. */
	gap: boolean;
	distanceKm: number;
	startSocPct?: number;
	endSocPct?: number;
	/** Percentage points used. */
	usedPct?: number;
	/** Energy used, estimated from `usedPct` and the usable capacity the user entered. */
	usedKwh?: number;
	startLatitude?: number;
	startLongitude?: number;
	endLatitude?: number;
	endLongitude?: number;
	startOdometerKm?: number;
	endOdometerKm?: number;
	/** Mean outside temperature the vehicle reported during the trip. */
	outsideTempC?: number;
};

/** Shorter movements are GPS noise or manoeuvring, not trips. */
export const MIN_TRIP_KM = 0.2;
/** Two positions further apart than this count as movement even without other signs. */
const MOVED_KM = 0.3;
/** Odometer steps below this are rounding. */
const ODOMETER_STEP_KM = 0.1;

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const rad = Math.PI / 180;
	const dLat = (lat2 - lat1) * rad;
	const dLon = (lon2 - lon1) * rad;
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const position = (p: HistoryPoint) =>
	p.data.latitude !== undefined && p.data.longitude !== undefined
		? { lat: p.data.latitude, lon: p.data.longitude }
		: undefined;

/** Whether the vehicle moved between two consecutive snapshots. */
function moved(previous: HistoryPoint, current: HistoryPoint): boolean {
	if (current.data.ignitionOn === true) return true;
	const before = previous.data.odometerKm;
	const after = current.data.odometerKm;
	if (before !== undefined && after !== undefined) return after - before >= ODOMETER_STEP_KM;
	const a = position(previous);
	const b = position(current);
	return a !== undefined && b !== undefined && haversineKm(a.lat, a.lon, b.lat, b.lon) > MOVED_KM;
}

/** Distance along the reported positions, for vehicles without an odometer value. */
function pathKm(points: HistoryPoint[]): number {
	let km = 0;
	let last: { lat: number; lon: number } | undefined;
	for (const p of points) {
		const here = position(p);
		if (!here) continue;
		if (last) km += haversineKm(last.lat, last.lon, here.lat, here.lon);
		last = here;
	}
	return km;
}

const firstValue = <K extends keyof HistoryPoint['data']>(points: HistoryPoint[], key: K) =>
	points.find((p) => p.data[key] !== undefined)?.data[key];
const lastValue = <K extends keyof HistoryPoint['data']>(points: HistoryPoint[], key: K) =>
	points.findLast((p) => p.data[key] !== undefined)?.data[key];

function toTrip(points: HistoryPoint[], ongoing: boolean, maxGapMs: number): Trip | undefined {
	const first = points[0];
	const last = points.at(-1)!;
	const startOdometer = firstValue(points, 'odometerKm');
	const endOdometer = lastValue(points, 'odometerKm');
	const distanceKm =
		startOdometer !== undefined && endOdometer !== undefined && endOdometer > startOdometer
			? endOdometer - startOdometer
			: pathKm(points);
	if (distanceKm < MIN_TRIP_KM && !ongoing) return undefined;

	const gap = points.some(
		(p, i) => i > 0 && p.at.getTime() - points[i - 1].at.getTime() > maxGapMs
	);
	const trip: Trip = { start: first.at, end: last.at, ongoing, gap, distanceKm };
	const startSoc = firstValue(points, 'stateOfChargePct');
	const endSoc = lastValue(points, 'stateOfChargePct');
	if (startSoc !== undefined) trip.startSocPct = startSoc;
	if (endSoc !== undefined) trip.endSocPct = endSoc;
	if (startSoc !== undefined && endSoc !== undefined) {
		trip.usedPct = Math.max(0, startSoc - endSoc);
	}
	const from = points.map(position).find(Boolean);
	const to = points.map(position).findLast(Boolean);
	if (from) {
		trip.startLatitude = from.lat;
		trip.startLongitude = from.lon;
	}
	if (to) {
		trip.endLatitude = to.lat;
		trip.endLongitude = to.lon;
	}
	if (startOdometer !== undefined) trip.startOdometerKm = startOdometer;
	if (endOdometer !== undefined) trip.endOdometerKm = endOdometer;
	const temps = points.flatMap((p) =>
		p.data.outsideTempC === undefined ? [] : [p.data.outsideTempC]
	);
	if (temps.length) trip.outsideTempC = temps.reduce((sum, t) => sum + t, 0) / temps.length;
	return trip;
}

/**
 * Groups snapshots into trips. `points` must be sorted by time, oldest first. A trip runs
 * from the last snapshot before the vehicle moved to the first one at its destination, so
 * start and end are accurate to one polling interval. A run at the end of the series is
 * ongoing while the ignition is on and the data is no older than `maxGapMs`.
 * Returns the newest trip first.
 */
export function deriveTrips(points: HistoryPoint[], maxGapMs: number, now = Date.now()): Trip[] {
	const trips: Trip[] = [];
	let run: HistoryPoint[] | undefined;
	points.forEach((point, i) => {
		const previous = points[i - 1];
		if (previous && moved(previous, point)) {
			if (run) run.push(point);
			else run = [previous, point];
			return;
		}
		if (run) {
			const trip = toTrip(run, false, maxGapMs);
			if (trip) trips.push(trip);
			run = undefined;
		}
	});
	if (run) {
		const last = run.at(-1)!;
		const ongoing = last.data.ignitionOn === true && now - last.at.getTime() <= maxGapMs;
		const trip = toTrip(run, ongoing, maxGapMs);
		if (trip) trips.push(trip);
	}
	return trips.reverse();
}

/** Adds the estimated energy to each trip when the capacity is known. */
export const withTripEnergy = (trips: Trip[], capacityKwh: number | null) =>
	trips.map((t) => ({ ...t, usedKwh: energyKwh(t.usedPct, capacityKwh) }));

/** Consumption in kWh per 100 km; left out for short trips where rounding dominates. */
export const consumption = (trip: { usedKwh?: number; distanceKm: number }) =>
	trip.usedKwh === undefined || trip.distanceKm < 1
		? undefined
		: (trip.usedKwh / trip.distanceKm) * 100;

export type TripDetails = {
	startRangeKm?: number;
	endRangeKm?: number;
	minOutsideTempC?: number;
	maxOutsideTempC?: number;
	/** Average speed in km/h, including stops shorter than one polling interval. */
	averageKmh?: number;
	/** kWh per 100 km, when the energy is known. */
	consumptionKwh100?: number;
	/** Reported positions along the way as [longitude, latitude]. */
	path: [number, number][];
	/** Snapshots that make up the trip. */
	samples: number;
};

/** Collects everything the snapshots say about one trip. */
export function tripDetails(
	points: HistoryPoint[],
	trip: Trip & { usedKwh?: number }
): TripDetails {
	const start = trip.start.getTime();
	const end = trip.end.getTime();
	const inside = points.filter((p) => p.at.getTime() >= start && p.at.getTime() <= end);
	const temps = inside.flatMap((p) =>
		p.data.outsideTempC === undefined ? [] : [p.data.outsideTempC]
	);
	const path: [number, number][] = [];
	for (const p of inside) {
		const here = position(p);
		const previous = path.at(-1);
		if (here && (!previous || previous[0] !== here.lon || previous[1] !== here.lat)) {
			path.push([here.lon, here.lat]);
		}
	}
	const hours = (end - start) / 3_600_000;

	const details: TripDetails = { path, samples: inside.length };
	const startRange = firstValue(inside, 'rangeKm');
	const endRange = lastValue(inside, 'rangeKm');
	if (startRange !== undefined) details.startRangeKm = startRange;
	if (endRange !== undefined) details.endRangeKm = endRange;
	if (temps.length) {
		details.minOutsideTempC = Math.min(...temps);
		details.maxOutsideTempC = Math.max(...temps);
	}
	if (!trip.gap && hours >= 1 / 60 && trip.distanceKm > 0)
		details.averageKmh = trip.distanceKm / hours;
	const perHundred = consumption(trip);
	if (perHundred !== undefined) details.consumptionKwh100 = perHundred;
	return details;
}
