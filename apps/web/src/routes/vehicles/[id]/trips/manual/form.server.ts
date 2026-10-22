// Shared by the pages that add and change a trip entered by hand.
import { error, fail } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { manualTripForm, parseManualTrip } from '#lib/server/vehicles/manual-trip.ts';

export async function ownedConnection(locals: App.Locals, id: string) {
	if (!locals.user) error(401, 'Unauthorized');
	// Only the owner's connections are found; anything else is a 404.
	const connection = await getApp().vehicles.getConnection(locals.user.id, id);
	if (!connection) error(404, 'Not found');
	return { user: locals.user, connection };
}

/** Reads the form; on a mistake the failure carries the values back to the page. */
export async function readManualTrip(request: Request) {
	const form = await request.formData();
	const values = manualTripForm(form);
	const parsed = parseManualTrip(values, String(form.get('tz') ?? ''), Date.now());
	if ('error' in parsed) return { failure: fail(400, { values, tripError: parsed.error }) };
	return { trip: parsed.trip, values };
}
