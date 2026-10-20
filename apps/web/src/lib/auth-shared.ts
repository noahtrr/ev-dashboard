// Auth helpers shared by server loads and the browser.
import type { Messages } from './i18n.ts';

/** Sign-in methods enabled by the configuration, as shown on the login page. */
export type LoginMethods = {
	emailPassword: boolean;
	passkey: boolean;
	social: { id: string; label: string }[];
	allowSignup: boolean;
	/** Mail is set up: password reset, email confirmation, invitations. */
	mail: boolean;
};

/** Shortest accepted password, enforced by the server and hinted in the form. */
export const MIN_PASSWORD_LENGTH = 8;

/** Only same-origin paths are accepted as post-login targets. */
export function safeRedirect(target: string | null | undefined, fallback = '/') {
	if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
		return fallback;
	}
	return target;
}

export function authErrorMessage(
	t: Messages,
	error: { code?: string; status?: number } | null | undefined,
	fallback = t.common.error
) {
	if (!error) return '';
	if (error.status === 429) return t.auth.errors.rateLimited;
	switch (error.code?.toUpperCase()) {
		case 'INVALID_EMAIL_OR_PASSWORD':
			return t.auth.errors.invalidCredentials;
		case 'USER_ALREADY_EXISTS':
		case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
			return t.auth.errors.userExists;
		case 'PASSWORD_TOO_SHORT':
			return t.auth.errors.passwordTooShort;
		case 'SIGNUP_DISABLED':
		case 'SIGNUP_DISABLED_ERROR':
			return t.auth.errors.signupDisabled;
		case 'EMAIL_NOT_VERIFIED':
			return t.auth.errors.emailNotVerified;
		case 'ACCOUNT_LOCKED':
		case 'ACCOUNT_LOCKED_ERROR':
			return t.auth.errors.accountLocked;
		case 'INVALID_TOKEN':
		case 'TOKEN_EXPIRED':
			return t.auth.errors.invalidLink;
		default:
			return fallback;
	}
}
