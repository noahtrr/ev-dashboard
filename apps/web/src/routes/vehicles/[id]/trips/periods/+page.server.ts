import { error, fail } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { isTimeZone, parseDay, zonedTime } from '#lib/server/export/time.ts';
import { isPurpose } from '#lib/server/vehicles/logbook.ts';
import { parseMinute, periodBounds } from '#lib/trip-period.ts';
import type { Actions, PageServerLoad } from './$types';

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
			purpose: p.purpose,
			mode: p.mode === 'daily' ? ('daily' as const) : ('range' as const),
			fromMinute: p.fromMinute,
			toMinute: p.toMinute
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
		const mode = form.get('mode') === 'daily' ? 'daily' : 'range';
		const input = {
			mode,
			fromDay: String(form.get('from') ?? ''),
			toDay: String(form.get('to') ?? ''),
			fromMinute: parseMinute(form.get('fromTime')),
			toMinute: parseMinute(form.get('toTime'))
		} as const;
		const bounds = periodBounds(input, (day, minute) => {
			const d = parseDay(day)!;
			return zonedTime({ ...d, hour: 0, minute }, timeZone).getTime();
		});
		if (typeof bounds === 'string') return fail(400, { periodError: bounds });
		const changed = await getApp().logbook.addPeriod(
			user.id,
			connection.id,
			{
				...input,
				fromAt: new Date(bounds.fromAt),
				toAt: new Date(bounds.toAt),
				purpose,
				timeZone: input.fromMinute === null && input.toMinute === null ? null : timeZone
			},
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
