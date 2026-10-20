import { error, fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/admin/guard.ts';
import type { AdminResult } from '#lib/server/admin/users.ts';
import { getApp } from '#lib/server/app.ts';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals, params }) => {
	const admin = requireAdmin(locals);
	const detail = await getApp().users.get(params.id);
	if (!detail) error(404, 'Not found');
	return { account: detail, self: detail.id === admin.id, mail: getApp().methods.mail };
}) satisfies PageServerLoad;

function answer(result: AdminResult, success: Record<string, true>) {
	if (result.ok) return success;
	if (result.error === 'not_found') error(404, 'Not found');
	return fail(400, { error: result.error });
}

const field = async (request: Request, name: string) => {
	const value = (await request.formData()).get(name);
	return typeof value === 'string' ? value : '';
};

export const actions: Actions = {
	role: async ({ locals, params, request }) => {
		const admin = requireAdmin(locals);
		const role = await field(request, 'role');
		if (role !== 'admin' && role !== 'user') return fail(400, { error: 'invalid' });
		return answer(await getApp().users.setRole(admin.id, params.id, role), { roleSaved: true });
	},
	signOut: async ({ locals, params }) => {
		requireAdmin(locals);
		return answer(await getApp().users.signOut(params.id), { signedOut: true });
	},
	lock: async ({ locals, params, request }) => {
		const admin = requireAdmin(locals);
		const reason = await field(request, 'reason');
		return answer(await getApp().users.lock(admin.id, params.id, reason), { locked: true });
	},
	unlock: async ({ locals, params }) => {
		requireAdmin(locals);
		return answer(await getApp().users.unlock(params.id), { unlocked: true });
	},
	delete: async ({ locals, params, request }) => {
		const admin = requireAdmin(locals);
		const email = await field(request, 'email');
		const result = await getApp().users.remove(admin.id, params.id, email);
		if (!result.ok) return answer(result, {});
		redirect(303, '/admin?deleted=1');
	}
};
