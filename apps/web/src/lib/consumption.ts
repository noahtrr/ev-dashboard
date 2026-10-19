// Consumption statistics from logged trips. Runs in the browser, so weeks and months follow
// the viewer's time zone. Each trip's energy is estimated from the state of charge it used.

/** A logged trip that counts for consumption (see the loader of the consumption page). */
export type ConsumptionTrip = {
	/** Start, epoch ms. */
	t: number;
	km: number;
	/** Percentage points of the battery used. */
	usedPct: number;
	/** Mean outside temperature, when reported. */
	tempC: number | null;
};

export const RANGES = ['month', 'year', 'all'] as const;
export type Range = (typeof RANGES)[number];

/** Groups with less distance than this are left out; a few short trips say little. */
export const MIN_GROUP_KM = 20;

export type Totals = {
	km: number;
	/** kWh with a known capacity, percentage points otherwise. */
	used: number;
	/** `used` per 100 km. */
	per100: number;
};

export type Bucket = { start: number; end: number; per100: number | null };
export type Band = { key: string; per100: number };

export type Stats = {
	from: number;
	to: number;
	totals: Totals | null;
	/** The same span directly before, for comparison; absent for `all`. */
	previous: Totals | null;
	/** `week` for 30 days, `month` otherwise. */
	unit: 'week' | 'month';
	buckets: Bucket[];
	byTemperature: Band[];
	byLength: Band[];
};

const DAY = 24 * 3600 * 1000;
/** Most months the chart shows for `all`. */
const MAX_MONTHS = 36;

export const TEMPERATURE_BANDS = [
	{ key: 'below0', max: 0 },
	{ key: '0to10', max: 10 },
	{ key: '10to20', max: 20 },
	{ key: 'above20', max: Infinity }
] as const;

export const LENGTH_BANDS = [
	{ key: 'short', max: 10 },
	{ key: 'medium', max: 50 },
	{ key: 'long', max: Infinity }
] as const;

/** Sum over trips; `scale` turns percentage points into kWh (capacity / 100) or keeps them (1). */
export function totals(trips: ConsumptionTrip[], scale: number): Totals | null {
	let km = 0;
	let used = 0;
	for (const trip of trips) {
		km += trip.km;
		used += trip.usedPct * scale;
	}
	return km >= MIN_GROUP_KM ? { km, used, per100: (used / km) * 100 } : null;
}

const within = (trips: ConsumptionTrip[], from: number, to: number) =>
	trips.filter((trip) => trip.t >= from && trip.t < to);

/** Monday 00:00 local time of the week containing `t`. */
function weekStart(t: number) {
	const d = new Date(t);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}

function monthStart(t: number, offset = 0) {
	const d = new Date(t);
	return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
}

function bands<B extends readonly { key: string; max: number }[]>(
	trips: ConsumptionTrip[],
	list: B,
	value: (trip: ConsumptionTrip) => number | null,
	scale: number
): Band[] {
	return list.flatMap((band, i) => {
		const min = i === 0 ? -Infinity : list[i - 1].max;
		const sum = totals(
			trips.filter((trip) => {
				const v = value(trip);
				return v !== null && v >= min && v < band.max;
			}),
			scale
		);
		return sum ? [{ key: band.key, per100: sum.per100 }] : [];
	});
}

/** Statistics for one range ending at `now`; `trips` sorted by start, oldest first. */
export function consumptionStats(
	trips: ConsumptionTrip[],
	range: Range,
	scale: number,
	now = Date.now()
): Stats {
	let from: number;
	let previousFrom: number | null = null;
	const to = now;
	const unit = range === 'month' ? 'week' : 'month';
	if (range === 'month') {
		from = now - 30 * DAY;
		previousFrom = now - 60 * DAY;
	} else if (range === 'year') {
		from = monthStart(now, -11);
		previousFrom = monthStart(now, -23);
	} else {
		from = trips[0]?.t ?? now;
	}
	const current = within(trips, from, to);

	const buckets: Bucket[] = [];
	const first =
		unit === 'week' ? weekStart(from) : monthStart(Math.max(from, monthStart(now, 1 - MAX_MONTHS)));
	for (let start = first; start < to;) {
		const end = unit === 'week' ? weekStart(start + 8 * DAY) : monthStart(start, 1);
		buckets.push({
			start,
			end,
			per100: totals(within(current, start, end), scale)?.per100 ?? null
		});
		start = end;
	}

	return {
		from,
		to,
		totals: totals(current, scale),
		previous: previousFrom === null ? null : totals(within(trips, previousFrom, from), scale),
		unit,
		buckets,
		byTemperature: bands(current, TEMPERATURE_BANDS, (trip) => trip.tempC, scale),
		byLength: bands(current, LENGTH_BANDS, (trip) => trip.km, scale)
	};
}
