import { describe, expect, it, vi } from 'vitest';

const setHomeLayout = vi.hoisted(() =>
	vi.fn(async (_userId: string, layout: unknown) => layout as { id: string; on: boolean }[])
);
vi.mock('#lib/server/app.ts', () => ({ getApp: () => ({ preferences: { setHomeLayout } }) }));

const { PUT } = await import('./+server.ts');

type Event = Parameters<typeof PUT>[0];
const put = (body: string, contentType = 'application/json', signedIn = true) =>
	PUT({
		locals: {
			locale: 'de',
			user: signedIn ? { id: 'alice', name: '', email: '', role: 'user' } : undefined
		},
		request: new Request('http://localhost/api/preferences/home-layout', {
			method: 'PUT',
			headers: { 'content-type': contentType },
			body
		})
	} as unknown as Event);

describe('PUT /api/preferences/home-layout', () => {
	it('saves the layout for the signed-in user', async () => {
		const layout = [{ id: 'range', on: true }];
		const res = await put(JSON.stringify({ layout }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ layout });
		expect(setHomeLayout).toHaveBeenCalledWith('alice', layout);
	});

	it('refuses other content types, broken bodies and anonymous calls', async () => {
		setHomeLayout.mockClear();
		await expect(put('{"layout":[]}', 'text/plain')).rejects.toMatchObject({ status: 415 });
		await expect(put('{nope')).rejects.toMatchObject({ status: 400 });
		await expect(put('{"layout":{}}')).rejects.toMatchObject({ status: 400 });
		await expect(put('{"layout":[]}', 'application/json', false)).rejects.toMatchObject({
			status: 401
		});
		expect(setHomeLayout).not.toHaveBeenCalled();
	});
});
