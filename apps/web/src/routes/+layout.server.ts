import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return { locale: locals.locale, designStyle: locals.designStyle, user: locals.user ?? null };
};
