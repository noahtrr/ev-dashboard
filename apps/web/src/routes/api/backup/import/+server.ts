import { error, json } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import { BackupError } from '#lib/server/backup.ts';
import { jsonBody } from '#lib/server/json-body.ts';
import type { RequestHandler } from './$types';

// One step of an import, sent by the account page: a vehicle, a batch of its trips or charging
// sessions, the settings, or one template. Each step is checked on its own.
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const userId = locals.user.id;
	const body = await jsonBody(request);
	const { backups } = getApp();
	const connectionId = typeof body.connectionId === 'string' ? body.connectionId : '';
	try {
		switch (body.step) {
			case 'vehicle': {
				const target =
					body.target === 'new'
						? ({ create: true } as const)
						: { connectionId: typeof body.target === 'string' ? body.target : '' };
				const result = await backups.importVehicle(userId, body.vehicle, target);
				if (!result) error(404, 'Not found');
				return json(result);
			}
			case 'trips': {
				const result = await backups.importTrips(userId, connectionId, body.trips);
				if (!result) error(404, 'Not found');
				return json(result);
			}
			case 'charges': {
				const result = await backups.importCharges(userId, connectionId, body.chargeSessions);
				if (!result) error(404, 'Not found');
				return json(result);
			}
			case 'settings':
				return json({ changed: await backups.importSettings(userId, body.settings) });
			case 'template':
				return json({ result: await backups.importTemplate(userId, body.template) });
			default:
				error(400, 'Unknown step');
		}
	} catch (e) {
		if (e instanceof BackupError) error(400, `Invalid ${e.field}`);
		throw e;
	}
};
