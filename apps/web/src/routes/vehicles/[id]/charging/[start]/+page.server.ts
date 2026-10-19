import { error } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { getApp } from '#lib/server/app.ts';
import { deriveSessions, sessionDetails, withEnergy } from '#lib/server/vehicles/charging.ts';
import type { PageServerLoad } from './$types';

/** Longest session the page looks for; longer runs are cut here. */
const MAX_SESSION_MS = 7 * 24 * 3600 * 1000;

export const load = (async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, geocoder } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');

	// The session is addressed by its start time in milliseconds (any time inside it works).
	const start = /^\d{1,15}$/.test(params.start) ? Number(params.start) : NaN;
	if (!Number.isSafeInteger(start)) error(404, 'Not found');
	const gap = vehicles.staleAfterMs;
	const points = await vehicles.history(
		locals.user.id,
		params.id,
		new Date(start - gap),
		new Date(start + MAX_SESSION_MS)
	);
	const session = withEnergy(deriveSessions(points, gap), connection.batteryCapacityKwh).find(
		(s) => s.start.getTime() <= start && start <= s.end.getTime()
	);
	if (!session) error(404, 'Not found');

	// The chart shows a little of the time before and after the session.
	const end = session.end.getTime();
	const begin = session.start.getTime();
	const pad = Math.max(gap, (end - begin) / 10);
	const from = begin - pad;
	const to = Math.min(end + pad, Date.now());
	const chart = points
		.filter((p) => p.data.stateOfChargePct !== undefined)
		.map((p) => ({ t: p.at.getTime(), soc: p.data.stateOfChargePct! }))
		.filter((p) => p.t >= from && p.t <= to);

	const { latitude, longitude } = session;
	return {
		connection: {
			id: connection.id,
			label: connection.label,
			batteryCapacityKwh: connection.batteryCapacityKwh
		},
		session,
		details: sessionDetails(points, session, gap),
		chart,
		from,
		to,
		maxGapMs: gap,
		map: { tilesUrl: env.MAP_TILES_URL, glyphsUrl: env.MAP_GLYPHS_URL },
		// Streamed, so a slow geocoding service never delays the page.
		address:
			geocoder && latitude !== undefined && longitude !== undefined
				? geocoder.lookup(latitude, longitude, locals.locale).catch(() => null)
				: null
	};
}) satisfies PageServerLoad;
