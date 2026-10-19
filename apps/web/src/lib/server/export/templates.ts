// Excel templates the owner uploads (for example an employer's annual mileage form) and
// fills from the trip log. Templates stay in the instance's database; the repository
// ships only the knowledge of where a supported layout expects its values.
import { randomUUID } from 'node:crypto';
import { and, asc, count, eq } from 'drizzle-orm';
import type { Database } from '../db/index.ts';
import { exportTemplate } from '../db/schema.ts';
import type { LogEntry } from '../vehicles/logbook.ts';
import { spreadsheetSerial, wallClock } from './time.ts';
import { readZip, writeZip, type ZipEntry } from './zip.ts';

export const TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;
export const TEMPLATES_PER_USER = 10;
export const TEMPLATE_NAME_MAX_LENGTH = 80;

/** Supported layouts. `annual-mileage`: one row per month with odometer, private km and business days. */
export const TEMPLATE_KINDS = ['annual-mileage'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export type TemplateErrorCode =
	'not_xlsx' | 'unknown_layout' | 'too_large' | 'too_many' | 'period_too_long';

export class TemplateError extends Error {
	constructor(readonly code: TemplateErrorCode) {
		super(code);
	}
}

export type Month = { year: number; month: number };

export type MonthValues = Month & {
	startKm?: number;
	endKm?: number;
	privateKm: number;
	businessDays: number;
};

const monthIndex = (m: Month) => m.year * 12 + m.month - 1;

/**
 * Per-month values from logged trips (oldest first; earlier trips may be included and
 * only provide the odometer at the start). A month without trips keeps the odometer.
 */
export function monthlyValues(
	entries: LogEntry[],
	first: Month,
	last: Month,
	timeZone: string
): MonthValues[] {
	const months: MonthValues[] = [];
	for (let i = monthIndex(first); i <= monthIndex(last); i++) {
		months.push({ year: Math.floor(i / 12), month: (i % 12) + 1, privateKm: 0, businessDays: 0 });
	}
	const days = months.map(() => new Set<number>());
	const firstIndex = monthIndex(first);
	let known: number | undefined;
	const privateKm = months.map(() => 0);
	for (const e of entries) {
		const local = wallClock(e.startAt, timeZone);
		const slot = monthIndex(local) - firstIndex;
		if (slot < 0) {
			known = e.endOdometerKm ?? known;
			continue;
		}
		if (slot >= months.length) break;
		const m = months[slot];
		m.startKm ??= e.startOdometerKm ?? undefined;
		if (e.endOdometerKm !== null) m.endKm = e.endOdometerKm;
		if (e.purpose === 'private') privateKm[slot] += e.distanceKm;
		if (e.purpose === 'business') days[slot].add(local.day);
	}
	months.forEach((m, i) => {
		m.startKm ??= known;
		m.endKm ??= m.startKm;
		known = m.endKm;
		m.privateKm = Math.round(privateKm[i]);
		m.businessDays = days[i].size;
	});
	// Months before the first reading: the vehicle stood still, so the next reading holds.
	let next: number | undefined;
	for (let i = months.length - 1; i >= 0; i--) {
		if (months[i].startKm === undefined) {
			months[i].startKm = next;
			months[i].endKm = next;
		} else {
			next = months[i].startKm;
		}
	}
	for (const m of months) {
		if (m.startKm !== undefined) m.startKm = Math.round(m.startKm);
		if (m.endKm !== undefined) m.endKm = Math.round(m.endKm);
	}
	return months;
}

// --- Workbook access --------------------------------------------------------------------

type Workbook = { entries: ZipEntry[]; sheetPath: string };

function textOf(entries: ZipEntry[], name: string) {
	return entries.find((e) => e.name === name)?.data.toString('utf8');
}

function openWorkbook(buffer: Buffer): Workbook {
	let entries: ZipEntry[];
	try {
		entries = readZip(buffer);
	} catch {
		// Broken archives, unsupported compression and buffer overruns alike.
		throw new TemplateError('not_xlsx');
	}
	const workbook = textOf(entries, 'xl/workbook.xml');
	const rels = textOf(entries, 'xl/_rels/workbook.xml.rels');
	if (!workbook || !rels) throw new TemplateError('not_xlsx');
	const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
	const target = rid
		? (new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`).exec(rels)?.[1] ??
			new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rid}"`).exec(rels)?.[1])
		: undefined;
	if (!target) throw new TemplateError('not_xlsx');
	const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
	if (!entries.some((e) => e.name === sheetPath)) throw new TemplateError('not_xlsx');
	return { entries, sheetPath };
}

const cellPattern = (ref: string) =>
	new RegExp(`<c r="${ref}"(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</c>)`);

function formulaOf(sheet: string, ref: string) {
	const inner = cellPattern(ref).exec(sheet)?.[2];
	return inner ? (/<f[^>]*>([\s\S]*?)<\/f>/.exec(inner)?.[1] ?? '') : '';
}

/** Writes a number into an existing value cell, keeping its style. */
function setNumber(sheet: string, ref: string, value: number) {
	const match = cellPattern(ref).exec(sheet);
	if (!match || match[2]?.includes('<f')) throw new TemplateError('unknown_layout');
	const style = /\ss="\d+"/.exec(match[1] ?? '')?.[0] ?? '';
	return sheet.replace(match[0], `<c r="${ref}"${style}><v>${value}</v></c>`);
}

// The annual mileage layout: period in D11/D12, months from row 17 (B = month end),
// E17 the odometer at the start, then per month F (odometer at the end), G (private km)
// and I (business days); the form computes business km and carries E forward itself.
const ANNUAL = { firstRow: 17, rows: 18 };

function detect(sheet: string): TemplateKind | null {
	// Later rows usually share the formula of row 19, so only its presence is checked there.
	const hasFormula = (ref: string) => cellPattern(ref).exec(sheet)?.[2]?.includes('<f') ?? false;
	return /EOMONTH\(D11,0\)/.test(formulaOf(sheet, 'F11')) &&
		/F17/.test(formulaOf(sheet, 'E18')) &&
		hasFormula('E34')
		? 'annual-mileage'
		: null;
}

/** Checks an upload and returns its layout; throws `TemplateError` otherwise. */
export function inspectTemplate(buffer: Buffer): TemplateKind {
	if (buffer.length > TEMPLATE_MAX_BYTES) throw new TemplateError('too_large');
	const { entries, sheetPath } = openWorkbook(buffer);
	const kind = detect(textOf(entries, sheetPath) ?? '');
	if (!kind) throw new TemplateError('unknown_layout');
	return kind;
}

export type FillInput = {
	/** Local first and last day of the period. */
	first: Month & { day: number };
	last: Month & { day: number };
	months: MonthValues[];
};

export function fillTemplate(buffer: Buffer, input: FillInput): Buffer {
	const { entries, sheetPath } = openWorkbook(buffer);
	let sheet = textOf(entries, sheetPath) ?? '';
	if (detect(sheet) !== 'annual-mileage') throw new TemplateError('unknown_layout');
	if (input.months.length > ANNUAL.rows) throw new TemplateError('period_too_long');

	const serial = (d: Month & { day: number }) =>
		spreadsheetSerial({ year: d.year, month: d.month, day: d.day, hour: 0, minute: 0 });
	sheet = setNumber(sheet, 'D11', serial(input.first));
	sheet = setNumber(sheet, 'D12', serial(input.last));
	input.months.forEach((m, i) => {
		const row = ANNUAL.firstRow + i;
		if (i === 0 && m.startKm !== undefined) sheet = setNumber(sheet, `E${row}`, m.startKm);
		if (m.endKm !== undefined) sheet = setNumber(sheet, `F${row}`, m.endKm);
		sheet = setNumber(sheet, `G${row}`, m.privateKm);
		sheet = setNumber(sheet, `I${row}`, m.businessDays);
	});
	// Cached results would show the template's old numbers until recalculated.
	sheet = sheet.replace(/(<f[^>]*(?:\/>|>[\s\S]*?<\/f>))<v>[\s\S]*?<\/v>/g, '$1');

	return writeZip(
		entries.map((entry) => {
			if (entry.name === sheetPath) return { name: entry.name, data: Buffer.from(sheet, 'utf8') };
			if (entry.name === 'xl/workbook.xml') {
				const xml = entry.data
					.toString('utf8')
					.replace(/<calcPr\b([^>]*?)\s*fullCalcOnLoad="[^"]*"/, '<calcPr$1')
					.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"');
				return { name: entry.name, data: Buffer.from(xml, 'utf8') };
			}
			return entry;
		})
	);
}

// --- Storage ----------------------------------------------------------------------------

export type TemplateSummary = { id: string; name: string; kind: string; createdAt: Date };

export function createTemplateStore(db: Database) {
	async function list(userId: string): Promise<TemplateSummary[]> {
		return db
			.select({
				id: exportTemplate.id,
				name: exportTemplate.name,
				kind: exportTemplate.kind,
				createdAt: exportTemplate.createdAt
			})
			.from(exportTemplate)
			.where(eq(exportTemplate.userId, userId))
			.orderBy(asc(exportTemplate.createdAt));
	}

	async function add(userId: string, name: string, data: Buffer) {
		const kind = inspectTemplate(data);
		const [{ n }] = await db
			.select({ n: count() })
			.from(exportTemplate)
			.where(eq(exportTemplate.userId, userId));
		if (n >= TEMPLATES_PER_USER) throw new TemplateError('too_many');
		const id = randomUUID();
		await db.insert(exportTemplate).values({ id, userId, name, kind, data });
		return { id, kind };
	}

	async function get(userId: string, id: string) {
		const row = await db.query.exportTemplate.findFirst({
			where: and(eq(exportTemplate.id, id), eq(exportTemplate.userId, userId))
		});
		return row ? { ...row, data: Buffer.from(row.data) } : undefined;
	}

	async function remove(userId: string, id: string) {
		const removed = await db
			.delete(exportTemplate)
			.where(and(eq(exportTemplate.id, id), eq(exportTemplate.userId, userId)))
			.returning({ id: exportTemplate.id });
		return removed.length > 0;
	}

	return { list, add, get, remove };
}

export type TemplateStore = ReturnType<typeof createTemplateStore>;
