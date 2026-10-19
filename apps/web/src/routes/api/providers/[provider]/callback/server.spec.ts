import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ app: undefined as unknown }));
vi.mock('#lib/server/app.ts', () => ({ getApp: () => state.app }));

const { GET } = await import('./+server.ts');

type Event = Parameters<typeof GET>[0];
const call = (user: App.Locals['user'], query: string) =>
	GET({
		locals: { locale: 'en', user },
		params: { provider: 'connect-query' },
		url: new URL(`https://ev.example.com/api/providers/connect-query/callback${query}`)
	} as unknown as Event);

const alice = { id: 'u-alice', name: 'Alice', email: 'a@example.com', role: 'user' };
const vehicles = {
	completeAuthorization: vi.fn(),
	pollConnection: vi.fn(async () => ({ ok: true }))
};

beforeEach(() => {
	vi.clearAllMocks();
	state.app = { vehicles };
});

describe('provider callback', () => {
	it('passes state, code and error for the signed-in user and redirects', async () => {
		vehicles.completeAuthorization.mockResolvedValueOnce({ ok: true, connectionId: 'c1' });
		await expect(call(alice, '?state=s&code=k')).rejects.toMatchObject({
			status: 303,
			location: '/account?vehicle=connected#vehicles'
		});
		expect(vehicles.completeAuthorization).toHaveBeenCalledWith('u-alice', 'connect-query', {
			state: 's',
			code: 'k',
			error: null
		});
		expect(vehicles.pollConnection).toHaveBeenCalledWith('c1');
	});

	it('reports failures on the account page', async () => {
		vehicles.completeAuthorization.mockResolvedValueOnce({ ok: false, error: 'state' });
		await expect(call(alice, '?state=bad&code=k')).rejects.toMatchObject({
			status: 303,
			location: '/account?vehicle=state#vehicles'
		});
		expect(vehicles.pollConnection).not.toHaveBeenCalled();
	});

	it('requires a session', async () => {
		await expect(call(undefined, '?state=s&code=k')).rejects.toMatchObject({ status: 401 });
		expect(vehicles.completeAuthorization).not.toHaveBeenCalled();
	});
});
