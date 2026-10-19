import { error, fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { getApp } from '#lib/server/app.ts';
import { passkey } from '#lib/server/db/schema.ts';
import {
	deleteVehicleApiCredentials,
	getVehicleApiStatus,
	saveVehicleApiCredentials,
	validateCredentials
} from '#lib/server/vehicle-api.ts';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	// The handle hook already redirects anonymous visitors; this guards the actions too.
	if (!locals.user) error(401, 'Unauthorized');
	return locals.user;
}

export const load = (async ({ locals }) => {
	const user = requireUser(locals);
	const { db, encryptionKey, methods } = getApp();
	const passkeys = methods.passkey
		? await db
				.select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt })
				.from(passkey)
				.where(eq(passkey.userId, user.id))
				.orderBy(asc(passkey.createdAt))
		: [];
	return {
		passkeysEnabled: methods.passkey,
		passkeys,
		// Only the client ID and the timestamp; the secret never reaches the browser.
		vehicleApi: await getVehicleApiStatus(db, encryptionKey, user.id)
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	saveVehicleApi: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const result = validateCredentials(form.get('clientId'), form.get('clientSecret'));
		if (!result.ok) return fail(400, { vehicleError: result.error });
		const { db, encryptionKey } = getApp();
		await saveVehicleApiCredentials(db, encryptionKey, user.id, result.value);
		return { vehicleSaved: true };
	},
	deleteVehicleApi: async ({ locals }) => {
		const user = requireUser(locals);
		await deleteVehicleApiCredentials(getApp().db, user.id);
		return { vehicleDeleted: true };
	}
};
