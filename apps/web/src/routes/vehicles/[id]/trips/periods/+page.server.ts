import { error, fail } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { isTimeZone, parseDay, zonedMidnight } from '#lib/server/export/time.ts';
import { isPurpose } from '#lib/server/vehicles/logbook.ts';
import type { Actions, PageServerLoad } from './$types';

/** Longest period one entry covers. */
const MAX_DAYS = 3 * 366;

async function owned(locals: App.Locals, id: string) {
	if (!locals.user) error(401, 'Unauthorized');
	// Only the owner's connections are found; anything else is a 404.
	const connection = await getApp().vehicles.getConnection(locals.user.id, id);
	if (!connection) error(404, 'Not found');
	return { user: locals.user, connection };
}

export const load = (async ({ locals, params }) => {
	const { user, connection } = await owned(locals, params.id);
	const { logbook } = getApp();
	const entries = await logbook.list(user.id, connection.id, new Date(0), new Date(), 'asc');
	return {
		connection: { id: connection.id, label: connection.label },
		// Start and purpose of every logged trip, so the page can count them as dates change.
		trips: entries.map((e) => ({ t: e.startAt.getTime(), purpose: e.purpose })),
		periods: (await logbook.periods(user.id, connection.id)).map((p) => ({
			id: p.id,
			fromDay: p.fromDay,
			toDay: p.toDay,
			purpose: p.purpose
		}))
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	add: async ({ locals, params, request }) => {
		const { user, connection } = await owned(locals, params.id);
		const form = await request.formData();
		const purpose = form.get('purpose');
		if (!isPurpose(purpose)) return fail(400, { periodError: 'purpose' as const });
		const tz = form.get('tz');
		const timeZone = isTimeZone(tz) ? tz : 'UTC';
		const fromDay = String(form.get('from') ?? '');
		const toDay = String(form.get('to') ?? '');
		const first = parseDay(fromDay);
		const last = parseDay(toDay);
		if (!first || !last) return fail(400, { periodError: 'range' as const });
		const fromAt = zonedMidnight(first.year, first.month, first.day, timeZone);
		// The end is the start of the day after the last day.
		const next = new Date(Date.UTC(last.year, last.month - 1, last.day + 1));
		const toAt = zonedMidnight(
			next.getUTCFullYear(),
			next.getUTCMonth() + 1,
			next.getUTCDate(),
			timeZone
		);
		if (toAt <= fromAt || toAt.getTime() - fromAt.getTime() > MAX_DAYS * 86_400_000) {
			return fail(400, { periodError: 'range' as const });
		}
		const changed = await getApp().logbook.addPeriod(
			user.id,
			connection.id,
			{ fromDay, toDay, fromAt, toAt, purpose },
			form.get('overwrite') === 'on'
		);
		if (changed === undefined) error(404, 'Not found');
		return { added: true, changed };
	},
	remove: async ({ locals, params, request }) => {
		const { user, connection } = await owned(locals, params.id);
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string' || id.length > 64) error(400, 'Bad request');
		if (!(await getApp().logbook.removePeriod(user.id, connection.id, id))) {
			error(404, 'Not found');
		}
		return { removed: true };
	}
};
