// OAuth redirect target of a vehicle provider. The handle hook already requires a session;
// the state check binds the response to the user who started the authorization.
import { error, redirect } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

/** Wait this long for the first fetch so the account page can show the vehicle name. */
const FIRST_POLL_WAIT_MS = 10_000;

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { vehicles } = getApp();
	const result = await vehicles.completeAuthorization(locals.user.id, params.provider, {
		state: url.searchParams.get('state'),
		code: url.searchParams.get('code'),
		error: url.searchParams.get('error'),
		errorDescription: url.searchParams.get('error_description'),
		paramNames: [...new Set(url.searchParams.keys())]
	});
	if (!result.ok) redirect(303, `/account?vehicle=${result.error}#vehicles`);

	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		vehicles.pollConnection(result.connectionId),
		new Promise((resolve) => (timer = setTimeout(resolve, FIRST_POLL_WAIT_MS)))
	]);
	clearTimeout(timer);
	redirect(303, '/account?vehicle=connected#vehicles');
};
