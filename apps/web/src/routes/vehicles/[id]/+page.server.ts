import { error } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

/** Longest raw JSON text sent to the page per endpoint. */
const MAX_RAW_CHARS = 200_000;

export const load = (async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles } = getApp();
	// Only the owner's connections are found; anything else is a 404.
	const connection = await vehicles.getConnection(locals.user.id, params.id);
	if (!connection) error(404, 'Not found');
	const latest = await vehicles.latestSnapshot(locals.user.id, params.id);
	const raw = Object.entries(latest?.raw ?? {}).map(([endpoint, response]) => {
		const text = JSON.stringify(response?.body ?? null, null, 2) ?? 'null';
		return {
			endpoint,
			status: typeof response?.status === 'number' ? response.status : 0,
			error: typeof response?.error === 'string' ? response.error : undefined,
			text: text.length > MAX_RAW_CHARS ? text.slice(0, MAX_RAW_CHARS) : text,
			truncated: text.length > MAX_RAW_CHARS
		};
	});
	return {
		connection,
		snapshot: latest ? { fetchedAt: latest.fetchedAt, data: latest.data } : null,
		raw
	};
}) satisfies PageServerLoad;
