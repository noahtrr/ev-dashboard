import { describe, expect, it, vi } from 'vitest';

const setPrefs = vi.hoisted(() => vi.fn(async (_u: string, prefs: unknown) => prefs));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => ({ notifier: { setPrefs } }) }));

const { PUT } = await import('./+server.ts');

type Event = Parameters<typeof PUT>[0];
const put = (body: string, signedIn = true) =>
	PUT({
		locals: { locale: 'de', user: signedIn ? { id: 'alice' } : undefined },
		request: new Request('http://localhost/api/notifications/prefs', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body
		})
	} as unknown as Event);

describe('PUT /api/notifications/prefs', () => {
	it('saves the choice of the signed-in user', async () => {
		const prefs = { lowChargePct: 30 };
		const res = await put(JSON.stringify({ prefs }));
		expect(await res.json()).toEqual({ prefs });
		expect(setPrefs).toHaveBeenCalledWith('alice', prefs);
	});

	it('needs prefs and a session', async () => {
		setPrefs.mockClear();
		await expect(put('{"prefs":null}')).rejects.toMatchObject({ status: 400 });
		await expect(put('{"prefs":{}}', false)).rejects.toMatchObject({ status: 401 });
		expect(setPrefs).not.toHaveBeenCalled();
	});
});
