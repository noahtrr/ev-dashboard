import { describe, expect, it } from 'vitest';
import { format, messages, pickLocale } from './i18n.ts';
import { safeRedirect } from './auth-shared.ts';

describe('pickLocale', () => {
	it('follows Accept-Language with German as fallback', () => {
		expect(pickLocale('en-US,en;q=0.9')).toBe('en');
		expect(pickLocale('fr-FR,de;q=0.5,en;q=0.8')).toBe('en');
		expect(pickLocale('de-AT')).toBe('de');
		expect(pickLocale('fr')).toBe('de');
		expect(pickLocale(null)).toBe('de');
	});
});

describe('messages', () => {
	it('has the same keys in every language', () => {
		const keys = (o: object): string[] =>
			Object.entries(o).flatMap(([k, v]) =>
				typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k]
			);
		expect(keys(messages.en)).toEqual(keys(messages.de));
		expect(format(messages.en.auth.continueWith, { name: 'SSO' })).toBe('Continue with SSO');
	});
});

describe('safeRedirect', () => {
	it('accepts only same-origin paths', () => {
		expect(safeRedirect('/account')).toBe('/account');
		expect(safeRedirect('//evil.example')).toBe('/');
		expect(safeRedirect('/\\evil.example')).toBe('/');
		expect(safeRedirect('https://evil.example')).toBe('/');
		expect(safeRedirect(null)).toBe('/');
	});
});
