import { defineEnvVars } from '@sveltejs/kit/env';

function flag(name: string, fallback: boolean) {
	return (value: string | undefined) => {
		const v = value?.trim().toLowerCase();
		if (!v) return fallback;
		if (['true', '1', 'yes', 'on'].includes(v)) return true;
		if (['false', '0', 'no', 'off'].includes(v)) return false;
		throw new Error(`${name} must be true or false (got '${value}')`);
	};
}

function optional(value: string | undefined) {
	return value?.trim() || undefined;
}

export const variables = defineEnvVars({
	APP_VERSION: {
		description: 'Version string reported by /api/health, set by the image build.',
		schema: (value) => value || 'dev'
	},
	APP_URL: {
		description:
			'Public URL of the instance. Base for auth callbacks and the passkey relying party.',
		schema: (value) => {
			const url = new URL(value?.trim() || 'http://localhost:5173');
			if (url.protocol !== 'http:' && url.protocol !== 'https:') {
				throw new Error('APP_URL must start with http:// or https://');
			}
			return url.origin;
		}
	},
	DATA_DIR: {
		description: 'Directory for the SQLite database and generated secrets. /data in the image.',
		schema: (value) => value?.trim() || './data'
	},
	AUTH_SECRET: {
		description: 'Signs sessions. Generated and stored under DATA_DIR when unset.',
		schema: (value) => {
			const v = optional(value);
			if (v && v.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
			return v;
		}
	},
	ENCRYPTION_KEY: {
		description:
			'Encrypts vehicle API credentials. Generated and stored under DATA_DIR when unset.',
		schema: (value) => {
			const v = optional(value);
			if (v && v.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters');
			return v;
		}
	},
	AUTH_EMAIL_PASSWORD: {
		description: 'Enable sign-in with email and password.',
		schema: flag('AUTH_EMAIL_PASSWORD', true)
	},
	AUTH_PASSKEY: {
		description: 'Enable sign-in with passkeys.',
		schema: flag('AUTH_PASSKEY', true)
	},
	AUTH_ALLOW_SIGNUP: {
		description: 'Allow new accounts after the first (admin) account exists.',
		schema: flag('AUTH_ALLOW_SIGNUP', false)
	},
	GITHUB_CLIENT_ID: { description: 'GitHub OAuth app client ID.', schema: optional },
	GITHUB_CLIENT_SECRET: { description: 'GitHub OAuth app client secret.', schema: optional },
	GOOGLE_CLIENT_ID: { description: 'Google OAuth client ID.', schema: optional },
	GOOGLE_CLIENT_SECRET: { description: 'Google OAuth client secret.', schema: optional },
	OIDC_ISSUER: {
		description:
			'OpenID Connect issuer URL (discovery document at /.well-known/openid-configuration).',
		schema: optional
	},
	OIDC_CLIENT_ID: { description: 'OpenID Connect client ID.', schema: optional },
	OIDC_CLIENT_SECRET: { description: 'OpenID Connect client secret.', schema: optional },
	OIDC_NAME: {
		description: 'Label of the SSO button.',
		schema: (value) => value?.trim() || 'SSO'
	}
});
