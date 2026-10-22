import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { deriveTrips, withTripEnergy } from '#lib/server/vehicles/trips.ts';
import { isPurpose } from '#lib/server/vehicles/logbook.ts';
import type { PageServerLoad } from './$types';

const PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;
const DAY = 24 * 3600 * 1000;
const FILTERS = ['business', 'private', 'open'] as const;
type Filter = (typeof FILTERS)[number];

export const load = (async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, logbook, geocoder } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	const requested = Number(url.searchParams.get('days'));
	const days = (PERIODS as readonly number[]).includes(requested) ? requested : DEFAULT_PERIOD;
	const to = Date.now();
	const from = to - days * DAY;
	const points = await vehicles.history(locals.user.id, params.id, new Date(from));
	const derived = withTripEnergy(
		deriveTrips(points, vehicles.staleAfterMs, to),
		connection.batteryCapacityKwh
	);
	// Purpose and note come from the trip log; trips still under way are not logged yet.
	const entries = await logbook.list(locals.user.id, params.id, new Date(from), new Date(to));
	const logged = new Map(entries.map((e) => [e.startAt.getTime(), e]));
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
	const all = [...recorded, ...manual].sort((a, b) => b.start.getTime() - a.start.getTime());
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
		filter,
		filters: [...FILTERS],
		byPurpose,
		from,
		to,
		trips
	};
}) satisfies PageServerLoad;
