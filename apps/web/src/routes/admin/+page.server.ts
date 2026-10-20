import { error, fail } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '#lib/server/admin/guard.ts';
import { getApp } from '#lib/server/app.ts';
import { normalizeEmail } from '#lib/server/auth/invitations.ts';
import { user as userTable } from '#lib/server/db/schema.ts';
import { renderMail } from '#lib/server/mail/templates.ts';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	requireAdmin(locals);
	const { users, methods, mailer, invitations } = getApp();
	return {
		allowSignup: methods.allowSignup,
		stats: await users.stats(),
		users: await users.list(),
		mail: methods.mail,
		// Never the credentials.
		mailInfo: mailer ? mailer.info : null,
		invitations: mailer ? await invitations.list() : null
	};
}) satisfies PageServerLoad;

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
	}
};
