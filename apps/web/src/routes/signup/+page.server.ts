import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { getApp } from '#lib/server/app.ts';
import { countUsers } from '#lib/server/auth/config.ts';
import { applyAuthCookies } from '#lib/server/auth/cookies.ts';
import { invitationContext } from '#lib/server/auth/invitations.ts';
import { MIN_PASSWORD_LENGTH } from '#lib/auth-shared.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { db, methods, invitations } = getApp();
	if (locals.user) redirect(303, '/');
	if ((await countUsers(db)) === 0) redirect(303, '/setup');
	const token = url.searchParams.get('invite');
	if (token !== null) {
		const invite = methods.emailPassword ? await invitations.find(token) : undefined;
		return {
			methods,
			errorCode: null,
			invite: invite
				? { token, email: invite.email, inviter: invite.inviter, expiresAt: invite.expiresAt }
				: null,
			inviteInvalid: !invite
		};
	}
	if (!methods.allowSignup) redirect(303, '/login');
	return { methods, errorCode: url.searchParams.get('error'), invite: null, inviteInvalid: false };
};

export const actions: Actions = {
	/** Sign-up from an invitation: the address comes from the invitation and counts as confirmed. */
	invite: async ({ request, cookies }) => {
		const { auth, invitations, methods } = getApp();
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const invite = methods.emailPassword ? await invitations.find(token) : undefined;
		if (!invite) return fail(400, { code: 'INVITE_INVALID', name });
		if (password.length < MIN_PASSWORD_LENGTH)
			return fail(400, { code: 'PASSWORD_TOO_SHORT', name });
		try {
			await invitationContext.run({ id: invite.id, email: invite.email }, () =>
				auth.api.signUpEmail({
					body: { name: name || invite.email, email: invite.email, password },
					headers: request.headers
				})
			);
			// With email confirmation on, sign-up opens no session; the invited address is confirmed.
			const { headers } = await auth.api.signInEmail({
				body: { email: invite.email, password },
				headers: request.headers,
				returnHeaders: true
			});
			await invitations.accept(invite.id);
			applyAuthCookies(headers, cookies);
		} catch (error) {
			if (error instanceof APIError) {
				return fail(error.statusCode === 429 ? 429 : 400, {
					code: String(error.body?.code ?? ''),
					name
				});
			}
			throw error;
		}
		redirect(303, '/');
	}
};
