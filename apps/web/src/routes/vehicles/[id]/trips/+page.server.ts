import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { isTimeZone, wallClock, zonedMidnight } from '#lib/server/export/time.ts';
import { deriveTrips, withTripEnergy } from '#lib/server/vehicles/trips.ts';
import { entryTrip, isPurpose } from '#lib/server/vehicles/logbook.ts';
import type { PageServerLoad } from './$types';

const PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;
const DAY = 24 * 3600 * 1000;
/** In the year view, trips older than this come from the trip log only. */
const YEAR_DERIVED_DAYS = 7;
const FILTERS = ['business', 'private', 'open'] as const;
type Filter = (typeof FILTERS)[number];

export const load = (async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, logbook, geocoder } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	const now = Date.now();
	// A year runs from 1 January in the browser's time zone, which the year buttons send along.
	const timeZone = isTimeZone(url.searchParams.get('tz')) ? url.searchParams.get('tz')! : 'UTC';
	const currentYear = wallClock(new Date(now), timeZone).year;
	const first = await logbook.firstStart(locals.user.id, params.id);
	const firstYear = Math.min(first ? wallClock(first, timeZone).year : currentYear, currentYear);
	const requestedYear = Number(url.searchParams.get('year'));
	const year =
		Number.isInteger(requestedYear) && requestedYear >= firstYear && requestedYear <= currentYear
			? requestedYear
			: null;
	const requested = Number(url.searchParams.get('days'));
	const days =
		year !== null
			? null
			: (PERIODS as readonly number[]).includes(requested)
				? requested
				: DEFAULT_PERIOD;
	const from =
		year === null
			? now - (days ?? DEFAULT_PERIOD) * DAY
			: zonedMidnight(year, 1, 1, timeZone).getTime();
	const to =
		year === null ? now : Math.min(now, zonedMidnight(year + 1, 1, 1, timeZone).getTime() - 1);
	// A whole year is too long to derive from snapshots: it reads the trip log and derives
	// only the last days, whose trips may not be logged yet.
	const derivedFrom = year === null ? from : Math.max(from, to - YEAR_DERIVED_DAYS * DAY);
	const points = await vehicles.history(
		locals.user.id,
		params.id,
		new Date(derivedFrom),
		new Date(to)
	);
	const derived = withTripEnergy(
		deriveTrips(points, vehicles.staleAfterMs, now),
		connection.batteryCapacityKwh
	);
	// Purpose and note come from the trip log; trips still under way are not logged yet.
	const entries = await logbook.list(locals.user.id, params.id, new Date(from), new Date(to));
	const logged = new Map(entries.map((e) => [e.startAt.getTime(), e]));
	const seen = new Set(derived.map((t) => t.start.getTime()));
	const recorded = derived.map((trip) => {
		const entry = logged.get(trip.start.getTime());
		return {
			...trip,
			logged: entry !== undefined,
			purpose: (entry && isPurpose(entry.purpose) ? entry.purpose : 'open') as Filter,
			note: entry?.note ?? null,
			manualId: null as string | null
		};
	});
	// Trips entered by hand have no snapshots; they come from the log alone.
	const manual = entries
		.filter((e) => e.manual)
		.map((e) => ({
			start: e.startAt,
			end: e.endAt,
			distanceKm: e.distanceKm,
			ongoing: false,
			gap: false,
			usedPct: undefined,
			usedKwh: undefined,
			logged: true,
			purpose: (isPurpose(e.purpose) ? e.purpose : 'open') as Filter,
			note: e.note,
			manualId: e.id as string | null
		}));
	// Logged trips whose snapshots are gone (or lie outside the derived days) show the log.
	const older = withTripEnergy(
		entries.filter((e) => !e.manual && !seen.has(e.startAt.getTime())).map(entryTrip),
		connection.batteryCapacityKwh
	).map((trip) => {
		const entry = logged.get(trip.start.getTime())!;
		return {
			...trip,
			logged: true,
			purpose: (isPurpose(entry.purpose) ? entry.purpose : 'open') as Filter,
			note: entry.note,
			manualId: null as string | null
		};
	});
	const all = [...recorded, ...older, ...manual].sort(
		(a, b) => b.start.getTime() - a.start.getTime()
	);
	const byPurpose = FILTERS.map((purpose) => ({
		purpose,
		distanceKm: all
			.filter((trip) => trip.logged && trip.purpose === purpose)
			.reduce((sum, trip) => sum + trip.distanceKm, 0)
	}));
	const requestedFilter = url.searchParams.get('purpose');
	const filter = (FILTERS as readonly string[]).includes(requestedFilter ?? '')
		? (requestedFilter as Filter)
		: null;
	const trips = filter ? all.filter((trip) => trip.logged && trip.purpose === filter) : all;
	// Private kilometres of the shown year for the allowance bar; the browser cuts the year
	// in its time zone, so a day more on each side is read.
	const quotaYear = year ?? currentYear;
	const privateTrips = !connection.privateQuotaKm
		? []
		: (
				await logbook.list(
					locals.user.id,
					params.id,
					new Date(Date.UTC(quotaYear - 1, 11, 31)),
					new Date(Date.UTC(quotaYear + 1, 0, 2))
				)
			)
				.filter((e) => e.purpose === 'private')
				.map((e) => ({ t: e.startAt.getTime(), km: e.distanceKm }));
	// Addresses for the export are looked up in the background, in the viewer's language.
	if (geocoder) logbook.fillAddresses(params.id, geocoder, locals.locale);

	return {
		connection: {
			id: connection.id,
			label: connection.label,
			batteryCapacityKwh: connection.batteryCapacityKwh
		},
		days,
		periods: [...PERIODS],
		year,
		years: { first: firstYear, current: currentYear },
		quota: !connection.privateQuotaKm
			? null
			: {
					km: connection.privateQuotaKm,
					warnPct: connection.privateQuotaWarnPct,
					year: quotaYear,
					trips: privateTrips
				},
		filter,
		filters: [...FILTERS],
		byPurpose,
		from,
		to,
		trips
	};
}) satisfies PageServerLoad;
