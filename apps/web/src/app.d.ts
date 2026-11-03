// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { DesignStyle } from '#lib/design-style.ts';
import type { Locale } from '#lib/i18n.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			locale: Locale;
			designStyle: DesignStyle;
			user?: { id: string; name: string; email: string; role: string };
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
