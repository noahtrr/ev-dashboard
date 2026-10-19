import { error } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { getApp } from '#lib/server/app.ts';
import { deriveSessions, withEnergy } from '#lib/server/vehicles/charging.ts';
import type { PageServerLoad } from './$types';

/** How far back the home page looks for the last charging session. */
const CHARGING_LOOKBACK_DAYS = 30;

export const load = (async ({ locals, url }) => {
	// The handle hook already sends anonymous visitors to the login page.
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, geocoder } = getApp();
	const connections = await vehicles.listConnections(locals.user.id);
	const current = connections.find((c) => c.id === url.searchParams.get('v')) ?? connections[0];
	const latest = current ? await vehicles.latestValues(locals.user.id, current.id) : undefined;
	// The newest session (running or finished) for the charging module.
	const since = new Date(Date.now() - CHARGING_LOOKBACK_DAYS * 24 * 3600 * 1000);
	const [lastSession] = current
		? withEnergy(
				deriveSessions(
					await vehicles.history(locals.user.id, current.id, since),
					vehicles.staleAfterMs
				),
				current.batteryCapacityKwh
			)
		: [];
	return {
		vehicles: connections.map((c) => ({ id: c.id, label: c.label })),
		selected: current
			? {
					id: current.id,
					label: current.label,
					status: current.status,
					fetchedAt: latest?.fetchedAt ?? null,
					data: latest?.data ?? null
				}
			: null,
		lastSession: lastSession ?? null,
		// Values older than this are marked as stale.
		staleAfterMs: vehicles.staleAfterMs,
		geocoding: geocoder !== undefined,
		map: { tilesUrl: env.MAP_TILES_URL, glyphsUrl: env.MAP_GLYPHS_URL }
	};
}) satisfies PageServerLoad;
