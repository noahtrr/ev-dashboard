import { error, fail, redirect } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { getApp } from '#lib/server/app.ts';
import { entryTrip, isPurpose, NOTE_MAX_LENGTH } from '#lib/server/vehicles/logbook.ts';
import { deriveTrips, tripDetails, withTripEnergy } from '#lib/server/vehicles/trips.ts';
import type { Actions, PageServerLoad } from './$types';

/** Longest trip the page looks for; longer runs are cut here. */
const MAX_TRIP_MS = 2 * 24 * 3600 * 1000;

export const load = (async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, logbook, geocoder } = getApp();
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
	let trip = withTripEnergy(deriveTrips(points, gap), connection.batteryCapacityKwh).find(
		(t) => t.start.getTime() <= start && start <= t.end.getTime()
	);
	if (!trip) {
		// Trips entered by hand have their own page; logged ones whose snapshots are gone show the log.
		const logged = await logbook.find(locals.user.id, params.id, new Date(start));
		if (logged?.manual) redirect(303, `/vehicles/${params.id}/trips/manual/${logged.id}`);
		if (!logged) error(404, 'Not found');
		[trip] = withTripEnergy([entryTrip(logged)], connection.batteryCapacityKwh);
	}

	const entry = await logbook.find(locals.user.id, params.id, trip.start);
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
		// The logged trip carries purpose and note; absent while the trip is under way.
		entry:
			entry && entry.startAt.getTime() === trip.start.getTime()
				? {
						id: entry.id,
						purpose: isPurpose(entry.purpose) ? entry.purpose : null,
						note: entry.note
					}
				: null,
		noteMaxLength: NOTE_MAX_LENGTH,
		details: tripDetails(points, trip),
		map: { tilesUrl: env.MAP_TILES_URL, glyphsUrl: env.MAP_GLYPHS_URL },
		// Streamed, so a slow geocoding service never delays the page. The geocoder spaces
		// its requests, so the destination is looked up after the start.
		startAddress: lookup(trip.startLatitude, trip.startLongitude),
		endAddress: lookup(trip.endLatitude, trip.endLongitude)
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	classify: async ({ locals, params, request }) => {
		if (!locals.user) error(401, 'Unauthorized');
		const form = await request.formData();
		const id = form.get('id');
		const purpose = form.get('purpose');
		const note = String(form.get('note') ?? '').trim();
		if (typeof id !== 'string' || id.length > 64) error(400, 'Bad request');
		if (purpose !== null && purpose !== '' && !isPurpose(purpose)) error(400, 'Bad request');
		if (note.length > NOTE_MAX_LENGTH) return fail(400, { classifyError: 'note_too_long' });
		const saved = await getApp().logbook.classify(locals.user.id, params.id, id, {
			purpose: isPurpose(purpose) ? purpose : null,
			note: note || null
		});
		if (!saved) error(404, 'Not found');
		return { classified: true };
	}
};
