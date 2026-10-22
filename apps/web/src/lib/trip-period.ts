// Rules of private/business periods, shared by the server and the period page's live preview.
// A trip belongs to a period when it starts inside it. `fromAt`/`toAt` bound every period;
// a daily window also needs the trip to start between its two times on the wall clock of the
// time zone it was entered in.

export const PERIOD_MODES = ['range', 'daily'] as const;
export type PeriodMode = (typeof PERIOD_MODES)[number];

/** Longest period one entry covers. */
export const PERIOD_MAX_DAYS = 3 * 366;
const DAY_MS = 86_400_000;
const DAY_MIN = 1440;

export type PeriodRule = {
	fromAt: Date | number;
	toAt: Date | number;
	mode: string;
	fromMinute: number | null;
	toMinute: number | null;
	timeZone: string | null;
};

/** What the owner enters: days as `YYYY-MM-DD`, times in minutes after midnight or null. */
export type PeriodInput = {
	mode: PeriodMode;
	fromDay: string;
	toDay: string;
	fromMinute: number | null;
	toMinute: number | null;
};

/** `HH:MM` (as sent by time inputs) in minutes after midnight; '' is null, anything else NaN. */
export function parseMinute(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const match = typeof value === 'string' ? /^(\d{2}):(\d{2})$/.exec(value) : null;
	if (!match) return NaN;
	const [hour, minute] = [Number(match[1]), Number(match[2])];
	return hour < 24 && minute < 60 ? hour * 60 + minute : NaN;
}

export const showMinute = (minute: number) =>
	`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const dayNumber = (day: string) => {
	const [y, m, d] = day.split('-').map(Number);
	return Date.UTC(y, m - 1, d) / DAY_MS;
};

const isDay = (day: string) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
	const [y, m, d] = day.split('-').map(Number);
	const check = new Date(Date.UTC(y, m - 1, d));
	return y >= 2000 && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
};

/** The day after `day`, `YYYY-MM-DD`. */
function nextDay(day: string) {
	const d = new Date((dayNumber(day) + 1) * DAY_MS);
	return d.toISOString().slice(0, 10);
}

/**
 * The instants that bound a period, from a function that turns a local day and minute into
 * an instant (the server knows the time zone, the browser uses its own). 'range' when the
 * days are invalid or too far apart, 'times' when the times do not fit.
 */
export function periodBounds(
	p: PeriodInput,
	at: (day: string, minute: number) => number
): { fromAt: number; toAt: number } | 'range' | 'times' {
	if (!isDay(p.fromDay) || !isDay(p.toDay) || p.toDay < p.fromDay) return 'range';
	if (Number.isNaN(p.fromMinute) || Number.isNaN(p.toMinute)) return 'times';
	let fromAt: number;
	let toAt: number;
	if (p.mode === 'daily' && (p.fromMinute !== null || p.toMinute !== null)) {
		// A window needs both ends; one that ends before it starts runs past midnight.
		if (p.fromMinute === null || p.toMinute === null || p.fromMinute === p.toMinute) {
			return 'times';
		}
		fromAt = at(p.fromDay, p.fromMinute);
		toAt = at(p.toMinute > p.fromMinute ? p.toDay : nextDay(p.toDay), p.toMinute);
	} else {
		fromAt = at(p.fromDay, p.fromMinute ?? 0);
		toAt = p.toMinute === null ? at(nextDay(p.toDay), 0) : at(p.toDay, p.toMinute);
		if (toAt <= fromAt) return 'times';
	}
	if (toAt - fromAt > PERIOD_MAX_DAYS * DAY_MS) return 'range';
	return { fromAt, toAt };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes after midnight of an instant on the wall clock of `timeZone`. */
function minuteOfDay(t: number, timeZone: string | null) {
	const key = timeZone ?? '';
	let formatter = formatters.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timeZone ?? undefined,
			hourCycle: 'h23',
			hour: 'numeric',
			minute: 'numeric'
		});
		formatters.set(key, formatter);
	}
	const parts = Object.fromEntries(formatter.formatToParts(t).map((x) => [x.type, x.value]));
	return Number(parts.hour) * 60 + Number(parts.minute);
}

/** Whether a trip starting at `t` belongs to the period. */
export function inPeriod(p: PeriodRule, t: number): boolean {
	if (t < +p.fromAt || t >= +p.toAt) return false;
	if (p.mode !== 'daily' || p.fromMinute === null || p.toMinute === null) return true;
	const minute = minuteOfDay(t, p.timeZone);
	return p.fromMinute < p.toMinute
		? minute >= p.fromMinute && minute < p.toMinute
		: minute >= p.fromMinute || minute < p.toMinute;
}

/** The wall-clock spans a period covers, in minutes since 1970-01-01, sorted. */
function spans(p: PeriodInput & { mode: string }): [number, number][] {
	const first = dayNumber(p.fromDay);
	const last = dayNumber(p.toDay);
	if (p.mode !== 'daily' || p.fromMinute === null || p.toMinute === null) {
		return [[first * DAY_MIN + (p.fromMinute ?? 0), last * DAY_MIN + (p.toMinute ?? DAY_MIN)]];
	}
	const length = (p.toMinute - p.fromMinute + DAY_MIN) % DAY_MIN;
	const list: [number, number][] = [];
	for (let day = first; day <= last; day++) {
		const start = day * DAY_MIN + p.fromMinute;
		list.push([start, start + length]);
	}
	return list;
}

/**
 * Whether two periods cover a common minute.
 * shortcut: compares wall clocks and ignores differing time zones, which only matters for
 * owners who save periods from browsers in several time zones.
 */
export function periodsOverlap(
	a: PeriodInput & { mode: string },
	b: PeriodInput & { mode: string }
): boolean {
	const x = spans(a);
	const y = spans(b);
	let i = 0;
	let j = 0;
	while (i < x.length && j < y.length) {
		if (x[i][0] < y[j][1] && y[j][0] < x[i][1]) return true;
		if (x[i][1] <= y[j][1]) i++;
		else j++;
	}
	return false;
}
