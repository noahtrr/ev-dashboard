import { describe, expect, it, vi } from 'vitest';

const exportBackup = vi.hoisted(() => vi.fn(async () => ({ format: 'ev-dashboard-backup' })));
vi.mock('$app/env/private', () => ({ APP_VERSION: '9.9.9' }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => ({ backups: { exportBackup } }) }));

const { GET } = await import('./+server.ts');

type Event = Parameters<typeof GET>[0];
const get = (locale: string, signedIn = true) =>
	GET({ locals: { locale, user: signedIn ? { id: 'alice' } : undefined } } as unknown as Event);

describe('GET /api/backup', () => {
	it('downloads the backup of the signed-in user', async () => {
		const res = await get('de');
		expect(exportBackup).toHaveBeenCalledWith('alice', '9.9.9', expect.any(Date));
		expect(await res.json()).toEqual({ format: 'ev-dashboard-backup' });
		expect(res.headers.get('content-disposition')).toMatch(
			/^attachment; filename="ev-dashboard-sicherung-\d{4}-\d{2}-\d{2}\.json"$/
		);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect((await get('en')).headers.get('content-disposition')).toContain('ev-dashboard-backup-');
	});

	it('needs a session', async () => {
		await expect(get('de', false)).rejects.toMatchObject({ status: 401 });
	});
});
