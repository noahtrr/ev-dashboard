import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getApp } from '#lib/server/app.ts';
import { NOTE_MAX_LENGTH } from '#lib/server/vehicles/logbook.ts';
import { ADDRESS_MAX_LENGTH } from '#lib/server/vehicles/manual-trip.ts';
import { ownedConnection, readManualTrip } from '../form.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals, params }) => {
	const { connection } = await ownedConnection(locals, params.id);
	return {
		connection: { id: connection.id, label: connection.label },
		limits: { note: NOTE_MAX_LENGTH, address: ADDRESS_MAX_LENGTH }
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const { user, connection } = await ownedConnection(locals, params.id);
		const read = await readManualTrip(request);
		if (read.failure) return read.failure;
		const id = await getApp().logbook.addManual(user.id, connection.id, read.trip);
		if (id === 'overlap') return fail(409, { values: read.values, tripError: 'overlap' as const });
		redirect(303, resolve('/vehicles/[id]/trips/manual', { id: connection.id }));
	}
};
