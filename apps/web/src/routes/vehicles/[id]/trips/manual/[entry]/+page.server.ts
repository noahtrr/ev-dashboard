import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getApp } from '#lib/server/app.ts';
import { isPurpose, NOTE_MAX_LENGTH } from '#lib/server/vehicles/logbook.ts';
import { ADDRESS_MAX_LENGTH } from '#lib/server/vehicles/manual-trip.ts';
import { ownedConnection, readManualTrip } from '../form.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals, params }) => {
	const { user, connection } = await ownedConnection(locals, params.id);
	const entry = await getApp().logbook.getManual(user.id, connection.id, params.entry);
	if (!entry) error(404, 'Not found');
	return {
		connection: { id: connection.id, label: connection.label },
		limits: { note: NOTE_MAX_LENGTH, address: ADDRESS_MAX_LENGTH },
		entry: {
			id: entry.id,
			startAt: entry.startAt.getTime(),
			endAt: entry.endAt.getTime(),
			distanceKm: entry.distanceKm,
			startOdometerKm: entry.startOdometerKm,
			endOdometerKm: entry.endOdometerKm,
			startAddress: entry.startAddress,
			endAddress: entry.endAddress,
			purpose: isPurpose(entry.purpose) ? entry.purpose : null,
			note: entry.note
		}
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const { user, connection } = await ownedConnection(locals, params.id);
		const read = await readManualTrip(request);
		if (read.failure) return read.failure;
		const saved = await getApp().logbook.updateManual(
			user.id,
			connection.id,
			params.entry,
			read.trip
		);
		if (saved === 'overlap') {
			return fail(409, { values: read.values, tripError: 'overlap' as const });
		}
		if (!saved) error(404, 'Not found');
		return { saved: true };
	},
	remove: async ({ locals, params }) => {
		const { user, connection } = await ownedConnection(locals, params.id);
		if (!(await getApp().logbook.removeManual(user.id, connection.id, params.entry))) {
			error(404, 'Not found');
		}
		redirect(303, resolve('/vehicles/[id]/trips/manual', { id: connection.id }));
	}
};
