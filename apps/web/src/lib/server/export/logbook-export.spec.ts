import { describe, expect, it } from 'vitest';
import { entry } from './fixtures.ts';
import { exportLogbook, totals, type ExportInput } from './logbook-export.ts';
import { readZip } from './zip.ts';

const entries = [
	entry('2026-10-01T05:20:00Z', 35, {
		distanceKm: 16.14,
		startOdometerKm: 23408.2,
		endOdometerKm: 23424.4,
		startAddress: 'Musterstraße 12, Berlin',
		endAddress: 'Friedrichstraße 100; Berlin',
		purpose: 'business',
		note: 'Meeting "Q4"'
	}),
	entry('2026-10-02T16:05:00Z', 20, {
		distanceKm: 7.3,
		purpose: 'private',
		note: '=HYPERLINK("x")'
	}),
	entry('2026-10-03T10:00:00Z', 15, { distanceKm: 4 })
];
const input = (locale: 'de' | 'en'): ExportInput => ({
	entries,
	locale,
	timeZone: 'Europe/Berlin',
	firstDay: { year: 2026, month: 10, day: 1, hour: 0, minute: 0 },
	lastDay: { year: 2026, month: 10, day: 31, hour: 0, minute: 0 },
	vehicle: 'Mein Auto'
});

describe('totals', () => {
	it('sums distance and count per purpose', () => {
		expect(totals(entries)).toEqual([
			{ purpose: 'business', count: 1, distanceKm: 16.1 },
			{ purpose: 'private', count: 1, distanceKm: 7.3 },
			{ purpose: 'open', count: 1, distanceKm: 4 }
		]);
	});
});

describe('CSV', () => {
	it('uses semicolons and decimal commas in German, with local times', () => {
		const file = exportLogbook('csv', input('de'));
		expect(file.extension).toBe('csv');
		const text = file.body.toString('utf8');
		expect(text.startsWith('﻿Datum;Abfahrt;Ankunft;')).toBe(true);
		const lines = text.slice(1).trimEnd().split('\r\n');
		expect(lines).toHaveLength(4);
		expect(lines[1]).toBe(
			'01.10.2026;07:20;07:55;Musterstraße 12, Berlin;"Friedrichstraße 100; Berlin";23408;23424;16,1;Geschäftlich;"Meeting ""Q4"""'
		);
		// Spreadsheet programs must not run a note as a formula.
		expect(lines[2]).toContain(`;Privat;"'=HYPERLINK(""x"")"`);
		// Without an address the coordinates stand in.
		expect(lines[3]).toContain('52.50000, 13.40000');
		expect(lines[3]).toContain(';Offen;');
	});

	it('uses commas, ISO dates and decimal points in English', () => {
		const lines = exportLogbook('csv', input('en')).body.toString('utf8').split('\r\n');
		expect(lines[1]).toMatch(/^2026-10-01,07:20,07:55,"Musterstraße 12, Berlin",/);
		expect(lines[1]).toContain(',16.1,Business,');
	});
});

describe('text', () => {
	it('lists each trip and the totals', () => {
		const text = exportLogbook('txt', input('de')).body.toString('utf8');
		expect(text).toContain('Fahrtenbuch · Mein Auto');
		expect(text).toContain('Zeitraum 01.10.2026 bis 31.10.2026');
		expect(text).toContain('01.10.2026  07:20 – 07:55  Geschäftlich');
		expect(text).toContain('Km-Stand 23.408 → 23.424 · 16,1 km');
		expect(text).toMatch(/Gesamt\s+3 Fahrten\s+27,4 km/);
		expect(text).toContain('Kein Fahrtenbuch im steuerlichen Sinn');
	});
});

describe('Excel', () => {
	it('writes a workbook with the trips and formula totals', () => {
		const file = exportLogbook('xlsx', input('de'));
		const parts = new Map(readZip(file.body).map((e) => [e.name, e.data.toString('utf8')]));
		expect([...parts.keys()]).toContain('xl/worksheets/sheet2.xml');
		expect(parts.get('xl/workbook.xml')).toContain('<sheet name="Fahrten"');
		const trips = parts.get('xl/worksheets/sheet1.xml')!;
		// Date serial, times as day fractions, text escaped.
		expect(trips).toContain('<c r="A2" s="2"><v>46296</v></c>');
		expect(trips).toContain('Meeting &quot;Q4&quot;');
		expect(trips).toContain('=HYPERLINK(&quot;x&quot;)');
		const sums = parts.get('xl/worksheets/sheet2.xml')!;
		expect(sums).toContain(
			"<f>SUMIF('Fahrten'!$I$2:$I$4,&quot;Geschäftlich&quot;,'Fahrten'!$H$2:$H$4)</f><v>16.1</v>"
		);
	});
});
