import { describe, expect, it, vi } from 'vitest';

const notifier = vi.hoisted(() => ({
	subscribe: vi.fn(async (_u: string, input: { endpoint?: unknown }) => input.endpoint === 'ok'),
	unsubscribe: vi.fn(async () => {}),
	removeDevice: vi.fn(async () => {})
}));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => ({ notifier }) }));

const { POST, DELETE } = await import('./+server.ts');

type Event = Parameters<typeof POST>[0];
const call = (
	handler: typeof POST,
	body: string,
	{ contentType = 'application/json', signedIn = true } = {}
) =>
	handler({
		locals: {
			locale: 'en',
			user: signedIn ? { id: 'alice', name: '', email: '', role: 'user' } : undefined
		},
		request: new Request('http://localhost/api/notifications/subscription', {
			method: 'POST',
			headers: {
				'content-type': contentType,
				'user-agent': 'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36'
			},
			body
		})
	} as unknown as Event);

describe('/api/notifications/subscription', () => {
	it('stores the browser with its device name and language', async () => {
		const res = await call(POST, JSON.stringify({ subscription: { endpoint: 'ok' } }));
		expect(res.status).toBe(200);
		expect(notifier.subscribe).toHaveBeenCalledWith(
			'alice',
			{ endpoint: 'ok' },
			'Chrome · Android',
			'en'
		);
		await expect(
			call(POST, JSON.stringify({ subscription: { endpoint: 'bad' } }))
		).rejects.toMatchObject({ status: 400 });
	});

	it('removes this browser by endpoint or another device by id', async () => {
		await call(DELETE, JSON.stringify({ endpoint: 'https://fcm.googleapis.com/a' }));
		expect(notifier.unsubscribe).toHaveBeenCalledWith('alice', 'https://fcm.googleapis.com/a');
		await call(DELETE, JSON.stringify({ id: 'd1' }));
		expect(notifier.removeDevice).toHaveBeenCalledWith('alice', 'd1');
		await expect(call(DELETE, '{}')).rejects.toMatchObject({ status: 400 });
	});

	it('refuses other content types and anonymous calls', async () => {
		notifier.subscribe.mockClear();
		await expect(
			call(POST, '{"subscription":{}}', { contentType: 'text/plain' })
		).rejects.toMatchObject({
			status: 415
		});
		await expect(call(POST, '{"subscription":{}}', { signedIn: false })).rejects.toMatchObject({
			status: 401
		});
		await expect(call(DELETE, '{"id":"d1"}', { signedIn: false })).rejects.toMatchObject({
			status: 401
		});
		expect(notifier.subscribe).not.toHaveBeenCalled();
	});
});
