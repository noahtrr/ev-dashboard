import { error, fail } from '@sveltejs/kit';
import { getApp } from '#lib/server/app.ts';
import {
	TEMPLATE_MAX_BYTES,
	TEMPLATE_NAME_MAX_LENGTH,
	TemplateError
} from '#lib/server/export/templates.ts';
import type { Actions, PageServerLoad } from './$types';

async function owned(locals: App.Locals, id: string) {
	if (!locals.user) error(401, 'Unauthorized');
	// Only the owner's connections are found; anything else is a 404.
	const connection = await getApp().vehicles.getConnection(locals.user.id, id);
	if (!connection) error(404, 'Not found');
	return { user: locals.user, connection };
}

export const load = (async ({ locals, params }) => {
	const { user, connection } = await owned(locals, params.id);
	return {
		connection: { id: connection.id, label: connection.label },
		templates: await getApp().templates.list(user.id)
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	uploadTemplate: async ({ locals, params, request }) => {
		const { user } = await owned(locals, params.id);
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const file = form.get('file');
		if (!name || name.length > TEMPLATE_NAME_MAX_LENGTH) {
			return fail(400, { templateError: 'name' as const });
		}
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { templateError: 'not_xlsx' as const });
		}
		if (file.size > TEMPLATE_MAX_BYTES) return fail(400, { templateError: 'too_large' as const });
		try {
			await getApp().templates.add(user.id, name, Buffer.from(await file.arrayBuffer()));
		} catch (cause) {
			if (cause instanceof TemplateError) return fail(400, { templateError: cause.code });
			throw cause;
		}
		return { templateUploaded: true };
	},
	removeTemplate: async ({ locals, params, request }) => {
		const { user } = await owned(locals, params.id);
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string' || id.length > 64) error(400, 'Bad request');
		if (!(await getApp().templates.remove(user.id, id))) error(404, 'Not found');
		return { templateRemoved: true };
	}
};
