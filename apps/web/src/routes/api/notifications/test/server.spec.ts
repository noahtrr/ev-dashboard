import { describe, expect, it, vi } from 'vitest';

const sendTest = vi.hoisted(() => vi.fn(async () => 'sent'));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => ({ notifier: { sendTest } }) }));

const { POST } = await import('./+server.ts');

type Event = Parameters<typeof POST>[0];
const post = (body: string, signedIn = true) =>
	POST({
		locals: { locale: 'de', user: signedIn ? { id: 'alice' } : undefined },
		request: new Request('http://localhost/api/notifications/test', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body
		})
	} as unknown as Event);

describe('POST /api/notifications/test', () => {
	it('sends to the given device of the signed-in user', async () => {
		const res = await post(JSON.stringify({ endpoint: 'https://fcm.googleapis.com/a' }));
		expect(await res.json()).toEqual({ result: 'sent' });
		expect(sendTest).toHaveBeenCalledWith('alice', 'https://fcm.googleapis.com/a');
	});

	it('needs an endpoint and a session', async () => {
		await expect(post('{}')).rejects.toMatchObject({ status: 400 });
		await expect(post('{"endpoint":"x"}', false)).rejects.toMatchObject({ status: 401 });
	});
});
