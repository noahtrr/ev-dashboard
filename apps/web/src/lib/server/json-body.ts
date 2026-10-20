import { error } from '@sveltejs/kit';

/**
 * The JSON body of an API request. Only `application/json` is accepted: browsers do not send it
 * cross-site without asking first, which keeps these endpoints out of reach of other sites.
 */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Unsupported media type');
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body)) error(400, 'Invalid body');
	return body as Record<string, unknown>;
}
