import { error } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { getApp } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, url }) => {
	// The handle hook already sends anonymous visitors to the login page.
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles, geocoder } = getApp();
	const connections = await vehicles.listConnections(locals.user.id);
	const current = connections.find((c) => c.id === url.searchParams.get('v')) ?? connections[0];
	const latest = current ? await vehicles.latestValues(locals.user.id, current.id) : undefined;
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
		// Values older than this are marked as stale.
		staleAfterMs: Math.max(3 * env.POLL_INTERVAL_SECONDS * 1000, 30 * 60 * 1000),
		geocoding: geocoder !== undefined,
		map: { tilesUrl: env.MAP_TILES_URL, glyphsUrl: env.MAP_GLYPHS_URL }
	};
}) satisfies PageServerLoad;
