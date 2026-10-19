import { error } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { getApp } from '#lib/server/app.ts';
import { deriveTrips, tripDetails, withTripEnergy } from '#lib/server/vehicles/trips.ts';
import type { PageServerLoad } from './$types';

/** Longest trip the page looks for; longer runs are cut here. */
const MAX_TRIP_MS = 2 * 24 * 3600 * 1000;

export const load = (async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, geocoder } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	// The trip is addressed by its start time in milliseconds (any time inside it works).
	const start = /^\d{1,15}$/.test(params.start) ? Number(params.start) : NaN;
	if (!Number.isSafeInteger(start)) error(404, 'Not found');
	const gap = vehicles.staleAfterMs;
	const points = await vehicles.history(
		locals.user.id,
		params.id,
		new Date(start - gap),
		new Date(start + MAX_TRIP_MS)
	);
	const trip = withTripEnergy(deriveTrips(points, gap), connection.batteryCapacityKwh).find(
		(t) => t.start.getTime() <= start && start <= t.end.getTime()
	);
	if (!trip) error(404, 'Not found');

	const lookup = (lat: number | undefined, lon: number | undefined) =>
		geocoder && lat !== undefined && lon !== undefined
			? geocoder.lookup(lat, lon, locals.locale).catch(() => null)
			: null;
	return {
		connection: {
			id: connection.id,
			label: connection.label,
			batteryCapacityKwh: connection.batteryCapacityKwh
		},
		trip,
		details: tripDetails(points, trip),
		map: { tilesUrl: env.MAP_TILES_URL, glyphsUrl: env.MAP_GLYPHS_URL },
		// Streamed, so a slow geocoding service never delays the page. The geocoder spaces
		// its requests, so the destination is looked up after the start.
		startAddress: lookup(trip.startLatitude, trip.startLongitude),
		endAddress: lookup(trip.endLatitude, trip.endLongitude)
	};
}) satisfies PageServerLoad;
