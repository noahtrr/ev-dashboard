import { json } from '@sveltejs/kit';
import { APP_VERSION } from '$app/env/private';
import { getHealth } from '#lib/server/health.ts';

export function GET() {
	return json(getHealth(APP_VERSION, process.uptime()), {
		headers: { 'cache-control': 'no-store' }
	});
}
