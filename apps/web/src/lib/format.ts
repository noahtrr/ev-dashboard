// Small display helpers shared by pages.
import type { Locale } from './i18n.ts';

export const DASH = '–';

export const localeTag = (locale: Locale) => (locale === 'de' ? 'de-DE' : 'en-GB');

/** "45 min", "3 h 05 min". */
export function duration(minutes: number): string {
	const m = Math.max(0, Math.round(minutes));
	return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

export const minutesBetween = (start: Date | string, end: Date | string) =>
	(new Date(end).getTime() - new Date(start).getTime()) / 60_000;

export function wholeNumber(value: number, locale: Locale): string {
	return value.toLocaleString(localeTag(locale), { maximumFractionDigits: 0 });
}

/** Energy in kWh: one decimal for small amounts, whole numbers otherwise. */
export function energy(kwh: number, locale: Locale): string {
	return kwh.toLocaleString(localeTag(locale), { maximumFractionDigits: kwh < 10 ? 1 : 0 });
}

export function dateTime(value: Date | string, locale: Locale): string {
	return new Date(value).toLocaleString(localeTag(locale), {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
}

export function clockTime(value: Date | string, locale: Locale): string {
	return new Date(value).toLocaleTimeString(localeTag(locale), {
		hour: '2-digit',
		minute: '2-digit'
	});
}
