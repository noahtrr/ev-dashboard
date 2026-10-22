// Trip log rows and workbooks for export tests.
import type { LogEntry } from '../vehicles/logbook.ts';
import { writeZip } from './zip.ts';

let n = 0;
export function entry(start: string, minutes: number, values: Partial<LogEntry> = {}): LogEntry {
	const startAt = new Date(start);
	return {
		id: `t${++n}`,
		connectionId: 'c1',
		startAt,
		endAt: new Date(startAt.getTime() + minutes * 60_000),
		distanceKm: 10,
		startOdometerKm: null,
		endOdometerKm: null,
		startSocPct: null,
		endSocPct: null,
		startLatitude: 52.5,
		startLongitude: 13.4,
		endLatitude: 52.6,
		endLongitude: 13.5,
		outsideTempC: null,
		startAddress: null,
		endAddress: null,
		gap: false,
		purpose: null,
		note: null,
		manual: false,
		createdAt: startAt,
		updatedAt: startAt,
		...values
	};
}

/** A workbook with the cells of the annual mileage layout (no form text). */
export function annualTemplate(extra = '') {
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
