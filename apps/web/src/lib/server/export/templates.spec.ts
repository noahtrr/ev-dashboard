import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.ts';
import { user } from '../db/schema.ts';
import { entry } from './fixtures.ts';
import {
	createTemplateStore,
	fillTemplate,
	inspectTemplate,
	monthlyValues,
	TemplateError,
	type TemplateStore
} from './templates.ts';
import { readZip, writeZip } from './zip.ts';

const TZ = 'Europe/Berlin';

/** A workbook with the cells of the annual mileage layout (no form text). */
function annualTemplate(extra = '') {
	const rows: string[] = [
		'<row r="11"><c r="D11" s="5"/><c r="F11" s="6"><f>EOMONTH(D11,0)</f><v>46053</v></c></row>',
		'<row r="12"><c r="D12" s="5"/></row>'
	];
	for (let r = 17; r <= 34; r++) {
		const e =
			r === 17
				? '<c r="E17" s="9"/>'
				: r === 18
					? '<c r="E18" s="21" t="str"><f>IF(F17="","",F17)</f><v/></c>'
					: r === 19
						? '<c r="E19" s="21" t="str"><f t="shared" ref="E19:E34" si="5">IF(F18="","",F18)</f><v/></c>'
						: `<c r="E${r}" s="21" t="str"><f t="shared" si="5"/><v/></c>`;
		rows.push(
			`<row r="${r}">${e}<c r="F${r}" s="9"/><c r="G${r}" s="9"/><c r="H${r}"><f>F${r}-E${r}-G${r}</f><v>0</v></c><c r="I${r}" s="9"/></row>`
		);
	}
	const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}${extra}</sheetData></worksheet>`;
	return writeZip(
		[
			[
				'xl/workbook.xml',
				'<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>'
			],
			[
				'xl/_rels/workbook.xml.rels',
				'<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
			],
			['xl/worksheets/sheet1.xml', sheet],
			['xl/media/image1.png', 'png-bytes']
		].map(([name, text]) => ({ name, data: Buffer.from(text) }))
	);
}

const cell = (sheet: string, ref: string) =>
	new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sheet)?.[0];

describe('monthlyValues', () => {
	const trips = [
		entry('2025-12-20T10:00:00Z', 30, { startOdometerKm: 900, endOdometerKm: 950 }),
		entry('2026-01-05T07:00:00Z', 30, {
			startOdometerKm: 950,
			endOdometerKm: 980,
			distanceKm: 30,
			purpose: 'business'
		}),
		entry('2026-01-05T15:00:00Z', 30, {
			startOdometerKm: 980,
			endOdometerKm: 1010,
			distanceKm: 30,
			purpose: 'business'
		}),
		entry('2026-01-09T09:00:00Z', 30, {
			startOdometerKm: 1010,
			endOdometerKm: 1022.6,
			distanceKm: 12.6,
			purpose: 'private'
		}),
		// 31 January 23:30 in Berlin belongs to January.
		entry('2026-01-31T22:30:00Z', 20, {
			startOdometerKm: 1022.6,
			endOdometerKm: 1030,
			distanceKm: 7.4,
			purpose: 'business'
		}),
		entry('2026-03-02T08:00:00Z', 30, {
			startOdometerKm: 1030,
			endOdometerKm: 1100,
			distanceKm: 70
		})
	];

	it('sums each month and carries the odometer over months without trips', () => {
		expect(monthlyValues(trips, { year: 2026, month: 1 }, { year: 2026, month: 3 }, TZ)).toEqual([
			{ year: 2026, month: 1, startKm: 950, endKm: 1030, privateKm: 13, businessDays: 2 },
			{ year: 2026, month: 2, startKm: 1030, endKm: 1030, privateKm: 0, businessDays: 0 },
			{ year: 2026, month: 3, startKm: 1030, endKm: 1100, privateKm: 0, businessDays: 0 }
		]);
	});

	it('takes the next reading when the period starts before the first trip', () => {
		const [first] = monthlyValues(
			trips.slice(5),
			{ year: 2026, month: 2 },
			{ year: 2026, month: 3 },
			TZ
		);
		expect(first).toMatchObject({ startKm: 1030, endKm: 1030 });
	});
});

describe('fillTemplate', () => {
	it('recognizes the layout and rejects other files', () => {
		expect(inspectTemplate(annualTemplate())).toBe('annual-mileage');
		expect(() => inspectTemplate(Buffer.from('nope'))).toThrow(TemplateError);
		const other = writeZip([{ name: 'xl/workbook.xml', data: Buffer.from('<workbook/>') }]);
		expect(() => inspectTemplate(other)).toThrowError(
			expect.objectContaining({ code: 'not_xlsx' })
		);
	});

	it('writes period and monthly values, keeps styles and drops stale results', () => {
		const filled = fillTemplate(annualTemplate(), {
			first: { year: 2026, month: 1, day: 8 },
			last: { year: 2026, month: 2, day: 20 },
			months: [
				{ year: 2026, month: 1, startKm: 950, endKm: 1030, privateKm: 13, businessDays: 2 },
				{ year: 2026, month: 2, startKm: 1030, endKm: 1030, privateKm: 0, businessDays: 0 }
			]
		});
		const parts = new Map(readZip(filled).map((e) => [e.name, e.data.toString('utf8')]));
		const sheet = parts.get('xl/worksheets/sheet1.xml')!;
		expect(cell(sheet, 'D11')).toBe('<c r="D11" s="5"><v>46030</v></c>');
		expect(cell(sheet, 'D12')).toBe('<c r="D12" s="5"><v>46073</v></c>');
		expect(cell(sheet, 'E17')).toBe('<c r="E17" s="9"><v>950</v></c>');
		expect(cell(sheet, 'F17')).toBe('<c r="F17" s="9"><v>1030</v></c>');
		expect(cell(sheet, 'G17')).toBe('<c r="G17" s="9"><v>13</v></c>');
		expect(cell(sheet, 'I17')).toBe('<c r="I17" s="9"><v>2</v></c>');
		expect(cell(sheet, 'F18')).toBe('<c r="F18" s="9"><v>1030</v></c>');
		expect(cell(sheet, 'F19')).toBe('<c r="F19" s="9"/>');
		// E18 is the form's own formula and stays.
		expect(cell(sheet, 'E18')).toContain('<f>IF(F17="","",F17)</f>');
		expect(cell(sheet, 'F11')).toBe('<c r="F11" s="6"><f>EOMONTH(D11,0)</f></c>');
		expect(parts.get('xl/workbook.xml')).toContain('<calcPr fullCalcOnLoad="1" calcId="191029"/>');
		expect(parts.get('xl/media/image1.png')).toBe('png-bytes');
	});

	it('refuses periods longer than the form', () => {
		const months = Array.from({ length: 19 }, (_, i) => ({
			year: 2026,
			month: i + 1,
			privateKm: 0,
			businessDays: 0
		}));
		expect(() =>
			fillTemplate(annualTemplate(), {
				first: { year: 2026, month: 1, day: 1 },
				last: { year: 2027, month: 7, day: 31 },
				months
			})
		).toThrowError(expect.objectContaining({ code: 'period_too_long' }));
	});
});

describe('template store', () => {
	let store: TemplateStore;
	beforeEach(async () => {
		const { db } = openDatabase(':memory:');
		await db
			.insert(user)
			.values(['alice', 'bob'].map((id) => ({ id, name: id, email: `${id}@example.com` })));
		store = createTemplateStore(db);
	});

	it('keeps templates per user', async () => {
		const { id, kind } = await store.add('alice', 'Annual', annualTemplate());
		expect(kind).toBe('annual-mileage');
		expect(await store.list('alice')).toEqual([
			{ id, name: 'Annual', kind: 'annual-mileage', createdAt: expect.any(Date) }
		]);
		expect(await store.list('bob')).toEqual([]);
		expect(await store.get('bob', id)).toBeUndefined();
		expect((await store.get('alice', id))!.data.equals(annualTemplate())).toBe(true);
		expect(await store.remove('bob', id)).toBe(false);
		expect(await store.remove('alice', id)).toBe(true);
		expect(await store.list('alice')).toEqual([]);
	});

	it('rejects unknown layouts', async () => {
		await expect(store.add('alice', 'X', Buffer.from('x'))).rejects.toMatchObject({
			code: 'not_xlsx'
		});
	});
});
