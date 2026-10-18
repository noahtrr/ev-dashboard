import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	APP_VERSION: {
		description: 'Version string reported by /api/health, set by the image build.',
		schema: (value) => value || 'dev'
	}
});
