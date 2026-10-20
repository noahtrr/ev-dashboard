import { error } from '@sveltejs/kit';

/** The signed-in admin; 401 without a session, 403 for everyone else. */
export function requireAdmin(locals: App.Locals) {
	// The handle hook already redirects anonymous visitors; this guards the actions too.
	if (!locals.user) error(401, 'Unauthorized');
	if (locals.user.role !== 'admin') error(403, 'Forbidden');
	return locals.user;
}
