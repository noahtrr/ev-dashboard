import { error, fail, redirect } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { and, asc, eq } from 'drizzle-orm';
import { getApp } from '#lib/server/app.ts';
import { account, passkey, user as userTable } from '#lib/server/db/schema.ts';
import { DEFAULT_PROVIDER_ID } from '#lib/server/providers/index.ts';
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
	const { backups, db, encryptionKey, methods, notifier, vehicles } = getApp();
	const passkeys = methods.passkey
		? await db
				.select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt })
				.from(passkey)
				.where(eq(passkey.userId, user.id))
				.orderBy(asc(passkey.createdAt))
		: [];
	const [profile] = await db
		.select({ email: userTable.email, emailVerified: userTable.emailVerified })
		.from(userTable)
		.where(eq(userTable.id, user.id));
	const [credential] = await db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, user.id), eq(account.providerId, 'credential')));
	return {
		signin: {
			email: profile?.email ?? user.email,
			emailVerified: profile?.emailVerified ?? false,
			hasPassword: credential !== undefined
		},
		mail: methods.mail,
		passkeysEnabled: methods.passkey,
		passkeys,
		// Only the client ID and the timestamp; the secret never reaches the browser.
		vehicleApi: await getVehicleApiStatus(db, encryptionKey, user.id),
		redirectUri: vehicles.redirectUri(DEFAULT_PROVIDER_ID),
		// Status fields only; tokens stay on the server.
		connections: await vehicles.listConnections(user.id),
		notifications: {
			publicKey: notifier.publicKey,
			prefs: await notifier.prefs(user.id),
			devices: await notifier.devices(user.id),
			pollMinutes: Math.round(env.POLL_INTERVAL_SECONDS / 60)
		},
		backup: {
			summary: await backups.summary(user.id),
			targets: await backups.targets(user.id)
		}
	};
}) satisfies PageServerLoad;

function connectionId(form: FormData) {
	const id = form.get('connectionId');
	return typeof id === 'string' && id.length <= 64 ? id : '';
}

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
	},
	connectVehicle: async ({ locals }) => {
		const user = requireUser(locals);
		const result = await getApp().vehicles.startAuthorization(user.id, DEFAULT_PROVIDER_ID);
		if (!result.ok) return fail(400, { connectError: result.error });
		// Built by the provider module from its own constants, never from user input.
		redirect(303, result.url, { external: true });
	},
	reconnectVehicle: async ({ locals, request }) => {
		const user = requireUser(locals);
		const id = connectionId(await request.formData());
		const result = await getApp().vehicles.startAuthorization(user.id, DEFAULT_PROVIDER_ID, id);
		if (!result.ok && result.error === 'not_found') error(404, 'Not found');
		if (!result.ok) return fail(400, { connectError: result.error });
		redirect(303, result.url, { external: true });
	},
	fetchNow: async ({ locals, request }) => {
		const user = requireUser(locals);
		const id = connectionId(await request.formData());
		const result = await getApp().vehicles.fetchNow(user.id, id);
		if (!result.ok && result.error === 'not_found') error(404, 'Not found');
		return { fetchResult: { id, ...result } };
	},
	disconnect: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		// The page asks for confirmation first; the flag guards against stray submits.
		if (form.get('confirm') !== 'yes') return fail(400, { disconnectError: 'confirm' });
		const removed = await getApp().vehicles.disconnect(user.id, connectionId(form));
		if (!removed) error(404, 'Not found');
		return { disconnected: true };
	}
};
