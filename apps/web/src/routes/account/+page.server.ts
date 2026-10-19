import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getApp } from '#lib/server/app.ts';
import { normalizeEmail } from '#lib/server/auth/invitations.ts';
import { account, passkey, user as userTable } from '#lib/server/db/schema.ts';
import { renderMail } from '#lib/server/mail/templates.ts';
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
	const { db, encryptionKey, methods, vehicles, mailer, invitations } = getApp();
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
	const admin = user.role === 'admin';
	return {
		signin: {
			email: profile?.email ?? user.email,
			emailVerified: profile?.emailVerified ?? false,
			hasPassword: credential !== undefined
		},
		mail: methods.mail,
		// Only for admins, and never the credentials.
		mailInfo: admin && mailer ? mailer.info : null,
		invitations: admin && mailer ? await invitations.list() : null,
		passkeysEnabled: methods.passkey,
		passkeys,
		// Only the client ID and the timestamp; the secret never reaches the browser.
		vehicleApi: await getVehicleApiStatus(db, encryptionKey, user.id),
		redirectUri: vehicles.redirectUri(DEFAULT_PROVIDER_ID),
		// Status fields only; tokens stay on the server.
		connections: await vehicles.listConnections(user.id)
	};
}) satisfies PageServerLoad;

function connectionId(form: FormData) {
	const id = form.get('connectionId');
	return typeof id === 'string' && id.length <= 64 ? id : '';
}

function requireAdmin(locals: App.Locals) {
	const user = requireUser(locals);
	if (user.role !== 'admin') error(403, 'Forbidden');
	return user;
}

/** Sends an invitation mail; false when the mail server refused it. */
async function sendInvite(
	locals: App.Locals,
	inviter: string,
	invite: { email: string; token: string }
) {
	const { mailer, appUrl } = getApp();
	if (!mailer) return false;
	const url = new URL('/signup', appUrl);
	url.searchParams.set('invite', invite.token);
	try {
		await mailer.send(
			renderMail({
				kind: 'invite',
				locale: locals.locale,
				to: invite.email,
				url: url.toString(),
				appUrl,
				inviter
			})
		);
		return true;
	} catch (e) {
		console.error('[mail] sending the invite mail failed:', (e as Error)?.message);
		return false;
	}
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const actions: Actions = {
	invite: async ({ locals, request }) => {
		const admin = requireAdmin(locals);
		const { db, invitations, mailer } = getApp();
		if (!mailer) return fail(400, { inviteError: 'failed' });
		const value = (await request.formData()).get('email');
		const email = typeof value === 'string' ? normalizeEmail(value) : '';
		if (!EMAIL.test(email) || email.length > 254) return fail(400, { inviteError: 'invalid' });
		const [existing] = await db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(sql`lower(${userTable.email})`, email));
		if (existing) return fail(400, { inviteError: 'exists', inviteEmail: email });
		const invite = await invitations.create(admin.id, email);
		if (!(await sendInvite(locals, admin.name, invite))) {
			await invitations.revoke(invite.id);
			return fail(502, { inviteError: 'failed', inviteEmail: email });
		}
		return { inviteSent: email };
	},
	resendInvite: async ({ locals, request }) => {
		const admin = requireAdmin(locals);
		const id = (await request.formData()).get('id');
		const invite = typeof id === 'string' ? await getApp().invitations.renew(id) : undefined;
		if (!invite) error(404, 'Not found');
		if (!(await sendInvite(locals, admin.name, invite))) {
			return fail(502, { inviteError: 'failed', inviteEmail: invite.email });
		}
		return { inviteSent: invite.email };
	},
	revokeInvite: async ({ locals, request }) => {
		requireAdmin(locals);
		const id = (await request.formData()).get('id');
		if (typeof id === 'string') await getApp().invitations.revoke(id);
		return {};
	},
	testMail: async ({ locals }) => {
		const admin = requireAdmin(locals);
		const { mailer, appUrl } = getApp();
		if (!mailer) return fail(400, { testError: 'SMTP_HOST is not set' });
		try {
			await mailer.send(
				renderMail({
					kind: 'test',
					locale: locals.locale,
					to: admin.email,
					name: admin.name,
					appUrl
				})
			);
		} catch (e) {
			// Admins see the server's answer to fix the settings; it holds no credentials.
			return fail(502, { testError: String((e as Error)?.message ?? e).slice(0, 300) });
		}
		return { testSent: admin.email };
	},
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
