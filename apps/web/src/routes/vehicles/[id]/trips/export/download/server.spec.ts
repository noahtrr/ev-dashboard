import { describe, expect, it, vi } from 'vitest';
import { entry } from '#lib/server/export/fixtures.ts';
import { readZip } from '#lib/server/export/zip.ts';

const list = vi.fn(async (userId: string) =>
	userId === 'alice'
		? [
				entry('2026-10-01T05:20:00Z', 30, { purpose: 'business', distanceKm: 12 }),
				entry('2026-10-02T05:20:00Z', 30, { purpose: 'private', distanceKm: 3 })
			]
		: []
);
const app = {
	vehicles: {
		getConnection: vi.fn(async (userId: string, id: string) =>
			userId === 'alice' && id === 'c1' ? { id: 'c1', label: 'Car' } : undefined
		)
	},
	logbook: { list },
	templates: { get: vi.fn(async () => undefined) }
};
vi.mock('#lib/server/app.ts', () => ({ getApp: () => app }));

const { GET } = await import('./+server.ts');
type Event = Parameters<typeof GET>[0];
const download = (userId: string, query: string) =>
	GET({
		locals: { locale: 'de', user: { id: userId, name: '', email: '', role: 'user' } },
		params: { id: 'c1' },
		url: new URL(`http://x/vehicles/c1/trips/export/download?${query}`)
	} as unknown as Event);

describe('export download', () => {
	it('returns the chosen format for the local period', async () => {
		const response = await download(
			'alice',
			'format=csv&from=2026-10-01&to=2026-10-31&purpose=business&tz=Europe%2FBerlin'
		);
		expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
		expect(response.headers.get('content-disposition')).toContain(
			'filename="Fahrtenbuch-2026-10-01_2026-10-31.csv"'
		);
		const lines = (await response.text()).trim().split('\r\n');
		expect(lines).toHaveLength(2);
		expect(lines[1]).toContain(';Geschäftlich;');
		// From local midnight to the end of the last local day.
		expect(list).toHaveBeenCalledWith(
			'alice',
			'c1',
			new Date('2026-09-30T22:00:00Z'),
			new Date('2026-10-31T22:59:59.999Z'),
			'asc'
		);

		const xlsx = await download('alice', 'format=xlsx&from=2026-10-01&to=2026-10-31&tz=UTC');
		const parts = readZip(Buffer.from(await xlsx.arrayBuffer()));
		expect(parts.map((p) => p.name)).toContain('xl/worksheets/sheet1.xml');
	});

	it('rejects bad periods, formats, templates and other users', async () => {
		await expect(
			download('alice', 'format=csv&from=2026-10-31&to=2026-10-01')
		).rejects.toMatchObject({ status: 400 });
		await expect(
			download('alice', 'format=pdf&from=2026-10-01&to=2026-10-31')
		).rejects.toMatchObject({ status: 400 });
		await expect(
			download('alice', 'format=template:x&from=2026-10-01&to=2026-10-31')
		).rejects.toMatchObject({ status: 404 });
		await expect(download('bob', 'format=csv&from=2026-10-01&to=2026-10-31')).rejects.toMatchObject(
			{
				status: 404
			}
		);
	});
});
