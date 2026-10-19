// Turns logged trips into the downloadable files: an Excel workbook, CSV and plain text.
import { messages, type Locale } from '../../i18n.ts';
import type { LogEntry } from '../vehicles/logbook.ts';
import { pad2, spreadsheetSerial, wallClock, type WallClock } from './time.ts';
import { writeZip } from './zip.ts';

export const EXPORT_FORMATS = ['xlsx', 'csv', 'txt'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ExportInput = {
	entries: LogEntry[];
	locale: Locale;
	timeZone: string;
	/** Local first and last day of the period, as shown in the file. */
	firstDay: WallClock;
	lastDay: WallClock;
	vehicle: string;
};

export type ExportFile = { body: Buffer; type: string; extension: string };

type Row = {
	start: WallClock;
	end: WallClock;
	startAddress: string;
	endAddress: string;
	startKm?: number;
	endKm?: number;
	distanceKm: number;
	purpose: 'private' | 'business' | 'open';
	note: string;
};

const place = (address: string | null, lat: number | null, lon: number | null) =>
	address ?? (lat !== null && lon !== null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : '');

function rows(input: ExportInput): Row[] {
	return input.entries.map((e) => ({
		start: wallClock(e.startAt, input.timeZone),
		end: wallClock(e.endAt, input.timeZone),
		startAddress: place(e.startAddress, e.startLatitude, e.startLongitude),
		endAddress: place(e.endAddress, e.endLatitude, e.endLongitude),
		startKm: e.startOdometerKm === null ? undefined : Math.round(e.startOdometerKm),
		endKm: e.endOdometerKm === null ? undefined : Math.round(e.endOdometerKm),
		distanceKm: Math.round(e.distanceKm * 10) / 10,
		purpose: e.purpose === 'private' || e.purpose === 'business' ? e.purpose : 'open',
		note: e.note ?? ''
	}));
}

export type PurposeTotal = { purpose: Row['purpose']; count: number; distanceKm: number };

export function totals(entries: LogEntry[]): PurposeTotal[] {
	const result = (['business', 'private', 'open'] as const).map((purpose) => ({
		purpose,
		count: 0,
		distanceKm: 0
	}));
	for (const e of entries) {
		const slot = result.find((r) => r.purpose === (e.purpose ?? 'open')) ?? result[2];
		slot.count += 1;
		slot.distanceKm += e.distanceKm;
	}
	for (const r of result) r.distanceKm = Math.round(r.distanceKm * 10) / 10;
	return result;
}

const day = (c: WallClock, locale: Locale) =>
	locale === 'de'
		? `${pad2(c.day)}.${pad2(c.month)}.${c.year}`
		: `${c.year}-${pad2(c.month)}-${pad2(c.day)}`;
const time = (c: WallClock) => `${pad2(c.hour)}:${pad2(c.minute)}`;

function decimal(value: number, locale: Locale, digits: number) {
	const text = value.toFixed(digits);
	return locale === 'de' ? text.replace('.', ',') : text;
}

function grouped(value: number, locale: Locale) {
	return value.toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 0 });
}

// --- CSV --------------------------------------------------------------------------------

/** Quotes a field and defuses values a spreadsheet would run as a formula. */
function csvField(value: string, separator: string) {
	let text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	if (text.includes('"') || text.includes(separator) || /[\r\n]/.test(text)) {
		text = `"${text.replaceAll('"', '""')}"`;
	}
	return text;
}

export function toCsv(input: ExportInput): ExportFile {
	const m = messages[input.locale].logbook;
	const separator = input.locale === 'de' ? ';' : ',';
	const header = [
		m.columns.date,
		m.columns.departure,
		m.columns.arrival,
		m.columns.startAddress,
		m.columns.endAddress,
		m.columns.startKm,
		m.columns.endKm,
		m.columns.distance,
		m.columns.purpose,
		m.columns.note
	];
	const lines = [
		header,
		...rows(input).map((r) => [
			day(r.start, input.locale),
			time(r.start),
			time(r.end),
			r.startAddress,
			r.endAddress,
			r.startKm === undefined ? '' : String(r.startKm),
			r.endKm === undefined ? '' : String(r.endKm),
			decimal(r.distanceKm, input.locale, 1),
			m.purposes[r.purpose],
			r.note
		])
	].map((fields) => fields.map((f) => csvField(f, separator)).join(separator));
	// The byte order mark makes spreadsheet programs read the file as UTF-8.
	return {
		body: Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'),
		type: 'text/csv; charset=utf-8',
		extension: 'csv'
	};
}

// --- Text -------------------------------------------------------------------------------

export function toText(input: ExportInput): ExportFile {
	const m = messages[input.locale].logbook;
	const out: string[] = [];
	const title = `${m.fileTitle} · ${input.vehicle}`;
	out.push(title, '='.repeat(title.length));
	out.push(
		m.period
			.replace('{from}', day(input.firstDay, input.locale))
			.replace('{to}', day(input.lastDay, input.locale)),
		''
	);
	const list = rows(input);
	if (list.length === 0) out.push(m.empty, '');
	for (const r of list) {
		out.push(
			`${day(r.start, input.locale)}  ${time(r.start)} – ${time(r.end)}  ${m.purposes[r.purpose]}`
		);
		out.push(`  ${m.text.from}: ${r.startAddress || '–'}`);
		out.push(`  ${m.text.to}: ${r.endAddress || '–'}`);
		const odometer =
			r.startKm !== undefined && r.endKm !== undefined
				? `${m.text.odometer} ${grouped(r.startKm, input.locale)} → ${grouped(r.endKm, input.locale)} · `
				: '';
		out.push(`  ${odometer}${decimal(r.distanceKm, input.locale, 1)} km`);
		if (r.note) out.push(`  ${m.text.note}: ${r.note.replace(/\s+/g, ' ')}`);
		out.push('');
	}
	out.push(m.sheetTotals, '-'.repeat(m.sheetTotals.length));
	const sums = totals(input.entries);
	const all = sums.reduce((s, r) => s + r.distanceKm, 0);
	for (const r of sums) {
		out.push(
			`${m.purposes[r.purpose].padEnd(14)}${String(r.count).padStart(5)} ${m.count}  ${decimal(r.distanceKm, input.locale, 1).padStart(10)} km`
		);
	}
	out.push(
		`${m.total.padEnd(14)}${String(input.entries.length).padStart(5)} ${m.count}  ${decimal(all, input.locale, 1).padStart(10)} km`,
		'',
		m.disclaimer,
		''
	);
	return {
		body: Buffer.from(out.join('\r\n'), 'utf8'),
		type: 'text/plain; charset=utf-8',
		extension: 'txt'
	};
}

// --- Excel ------------------------------------------------------------------------------

/** Escapes text for XML and drops characters XML 1.0 cannot carry. */
export function xmlText(value: string) {
	return value
		.replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

const column = (index: number) => String.fromCharCode(65 + index);

type Cell =
	| { kind: 'text'; value: string; style?: number }
	| { kind: 'number'; value: number; style?: number }
	| { kind: 'formula'; formula: string; value: number; style?: number }
	| { kind: 'empty'; style?: number };

function cellXml(ref: string, cell: Cell) {
	const s = cell.style ? ` s="${cell.style}"` : '';
	switch (cell.kind) {
		case 'text':
			return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(cell.value)}</t></is></c>`;
		case 'number':
			return `<c r="${ref}"${s}><v>${cell.value}</v></c>`;
		case 'formula':
			return `<c r="${ref}"${s}><f>${xmlText(cell.formula)}</f><v>${cell.value}</v></c>`;
		default:
			return `<c r="${ref}"${s}/>`;
	}
}

function sheetXml(grid: Cell[][], widths: number[], frozenHeader: boolean) {
	const cols = widths
		.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
		.join('');
	const view = frozenHeader
		? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
		: '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
	const body = grid
		.map(
			(row, r) =>
				`<row r="${r + 1}">${row.map((cell, c) => cellXml(`${column(c)}${r + 1}`, cell)).join('')}</row>`
		)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}<cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

// Style ids, see `stylesXml`.
const HEADER = 1;
const DATE = 2;
const TIME = 3;
const INTEGER = 4;
const DECIMAL = 5;
const PERCENT = 6;
const BOLD = 7;
const BOLD_DECIMAL = 8;

function stylesXml(locale: Locale) {
	const dateFormat = locale === 'de' ? 'dd.mm.yyyy' : 'yyyy-mm-dd';
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="${dateFormat}"/><numFmt numFmtId="165" formatCode="hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F0E9"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="medium"><color rgb="FF15803D"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

const timeOfDay = (c: WallClock) => (c.hour * 60 + c.minute) / 1440;
const text = (value: string, style?: number): Cell => ({ kind: 'text', value, style });
const num = (value: number | undefined, style?: number): Cell =>
	value === undefined ? { kind: 'empty' } : { kind: 'number', value, style };

export function toXlsx(input: ExportInput): ExportFile {
	const m = messages[input.locale].logbook;
	const c = m.columns;
	const list = rows(input);
	const trips: Cell[][] = [
		[
			c.date,
			c.departure,
			c.arrival,
			c.startAddress,
			c.endAddress,
			c.startKm,
			c.endKm,
			c.distance,
			c.purpose,
			c.note
		].map((label) => text(label, HEADER)),
		...list.map((r) => [
			num(spreadsheetSerial({ ...r.start, hour: 0, minute: 0 }), DATE),
			num(timeOfDay(r.start), TIME),
			num(timeOfDay(r.end), TIME),
			text(r.startAddress),
			text(r.endAddress),
			num(r.startKm, INTEGER),
			num(r.endKm, INTEGER),
			num(r.distanceKm, DECIMAL),
			text(m.purposes[r.purpose]),
			text(r.note)
		])
	];

	// The totals are formulas over the trips sheet, so edits there carry over.
	const last = Math.max(2, list.length + 1);
	const sheetRef = `'${m.sheetTrips.replaceAll("'", "''")}'`;
	const sums = totals(input.entries);
	const all = sums.reduce((s, r) => s + r.distanceKm, 0);
	const totalRow = sums.length + 2;
	const summary: Cell[][] = [
		[m.columns.purpose, m.count, m.columns.distance, m.share].map((label) => text(label, HEADER)),
		...sums.map((r, i) => {
			const row = i + 2;
			const label = m.purposes[r.purpose].replaceAll('"', '""');
			return [
				text(m.purposes[r.purpose]),
				{
					kind: 'formula',
					formula: `COUNTIF(${sheetRef}!$I$2:$I$${last},"${label}")`,
					value: r.count,
					style: INTEGER
				},
				{
					kind: 'formula',
					formula: `SUMIF(${sheetRef}!$I$2:$I$${last},"${label}",${sheetRef}!$H$2:$H$${last})`,
					value: r.distanceKm,
					style: DECIMAL
				},
				{
					kind: 'formula',
					formula: `IF($C$${totalRow}=0,0,C${row}/$C$${totalRow})`,
					value: all === 0 ? 0 : r.distanceKm / all,
					style: PERCENT
				}
			] satisfies Cell[];
		}),
		[
			text(m.total, BOLD),
			{
				kind: 'formula',
				formula: `SUM(B2:B${totalRow - 1})`,
				value: input.entries.length,
				style: INTEGER
			},
			{
				kind: 'formula',
				formula: `SUM(C2:C${totalRow - 1})`,
				value: Math.round(all * 10) / 10,
				style: BOLD_DECIMAL
			},
			{
				kind: 'formula',
				formula: `IF(C${totalRow}=0,0,1)`,
				value: all === 0 ? 0 : 1,
				style: PERCENT
			}
		],
		[],
		[
			text(
				m.period
					.replace('{from}', day(input.firstDay, input.locale))
					.replace('{to}', day(input.lastDay, input.locale))
			)
		],
		[text(m.vehicle.replace('{name}', input.vehicle))],
		[text(m.disclaimer)]
	];

	const names = [m.sheetTrips, m.sheetTotals].map((n) => xmlText(n.slice(0, 31)));
	const files = [
		{
			name: '[Content_Types].xml',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
		},
		{
			name: '_rels/.rels',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
		},
		{
			name: 'xl/workbook.xml',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${names[0]}" sheetId="1" r:id="rId1"/><sheet name="${names[1]}" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`
		},
		{
			name: 'xl/_rels/workbook.xml.rels',
			text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
		},
		{ name: 'xl/styles.xml', text: stylesXml(input.locale) },
		{
			name: 'xl/worksheets/sheet1.xml',
			text: sheetXml(trips, [12, 9, 9, 36, 36, 16, 16, 12, 14, 40], true)
		},
		{ name: 'xl/worksheets/sheet2.xml', text: sheetXml(summary, [18, 10, 14, 10], false) }
	];
	return {
		body: writeZip(files.map((f) => ({ name: f.name, data: Buffer.from(f.text, 'utf8') }))),
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		extension: 'xlsx'
	};
}

export function exportLogbook(format: ExportFormat, input: ExportInput): ExportFile {
	if (format === 'csv') return toCsv(input);
	if (format === 'txt') return toText(input);
	return toXlsx(input);
}
