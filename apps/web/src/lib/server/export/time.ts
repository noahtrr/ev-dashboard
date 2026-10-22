// Wall-clock helpers for exports: files show local dates and times of the person
// exporting, whose time zone the browser sends along.

export type WallClock = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
};

export function isTimeZone(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function wallClock(date: Date, timeZone: string): WallClock {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric'
		});
		formatters.set(timeZone, formatter);
	}
	const parts: Record<string, number> = {};
	for (const part of formatter.formatToParts(date)) {
		if (part.type !== 'literal') parts[part.type] = Number(part.value);
	}
	return {
		year: parts.year,
		month: parts.month,
		day: parts.day,
		hour: parts.hour,
		minute: parts.minute
	};
}

const asUtc = (c: WallClock) => Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);

/** The instant at which the given local date begins in `timeZone`. */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
	return zonedTime({ year, month, day, hour: 0, minute: 0 }, timeZone);
}

/** The instant a local wall clock in `timeZone` shows. */
export function zonedTime(c: WallClock, timeZone: string): Date {
	const target = asUtc(c);
	let guess = target;
	// Two rounds settle any offset, including days that begin inside a DST change.
	for (let i = 0; i < 2; i++) {
		guess += target - asUtc(wallClock(new Date(guess), timeZone));
	}
	return new Date(guess);
}

/** Parses `YYYY-MM-DD` (as sent by date inputs). */
export function parseDay(value: unknown): { year: number; month: number; day: number } | null {
	if (typeof value !== 'string') return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const [year, month, day] = match.slice(1).map(Number);
	const check = new Date(Date.UTC(year, month - 1, day));
	if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || year < 2000) {
		return null;
	}
	return { year, month, day };
}

/** Days since 1899-12-30 for spreadsheet date cells, from a local wall clock. */
export function spreadsheetSerial(c: WallClock): number {
	return asUtc(c) / 86_400_000 + 25_569;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
