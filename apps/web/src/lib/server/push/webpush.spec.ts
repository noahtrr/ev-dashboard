import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
	encryptPayload,
	newVapidScalar,
	sendPush,
	vapidAuthorization,
	vapidKeys
} from './webpush.ts';

// Fixed keys and salt; EXPECTED was produced by the reference implementation (web-push 3.6).
const ua = createECDH('prime256v1');
ua.setPrivateKey(Buffer.alloc(32, 7));
const UA_PUBLIC =
	'BB4YUy_UdUwC8wQdnHXOszuD_9gax85P6ILMscmLxYlupGwxHE4v9A3ZajZT5uRURdMt_khuztdcepDGoYiBwKM';
const AUTH = Buffer.alloc(16, 3).toString('base64url');
const EXPECTED =
	'BQUFBQUFBQUFBQUFBQUFBQAAEABBBHE1-k_ZOgnc6Yu_aBtL_PUOfA1jVOYq-wv_KjQpYXhl7UwfAt25Aj7lalV-UV1qncZsEfIglg3llDNN9Yh3ZyQ90jNoSEkYrtQ3No9sfMpK920VkuThTnS6jaa92ECb_o4';

const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, length: number) => {
	const prk = createHmac('sha256', salt).update(ikm).digest();
	return createHmac('sha256', prk)
		.update(Buffer.concat([info, Buffer.from([1])]))
		.digest()
		.subarray(0, length);
};

/** What a browser does with a message (RFC 8291), to check the round trip. */
function decrypt(body: Buffer): string {
	const salt = body.subarray(0, 16);
	const idLength = body[20];
	const senderPublic = body.subarray(21, 21 + idLength);
	const shared = ua.computeSecret(senderPublic);
	const ikm = hkdf(
		Buffer.alloc(16, 3),
		shared,
		Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), senderPublic]),
		32
	);
	const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
	const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
	const record = body.subarray(21 + idLength);
	const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
	decipher.setAuthTag(record.subarray(record.length - 16));
	const plain = Buffer.concat([decipher.update(record.subarray(0, -16)), decipher.final()]);
	return plain.subarray(0, plain.lastIndexOf(2)).toString();
}

describe('web push', () => {
	it('encrypts exactly like the reference implementation', () => {
		expect(ua.getPublicKey().toString('base64url')).toBe(UA_PUBLIC);
		const body = encryptPayload(
			{ p256dh: UA_PUBLIC, auth: AUTH },
			Buffer.from('{"title":"Test"}'),
			{
				salt: Buffer.alloc(16, 5),
				senderPrivate: Buffer.alloc(32, 9)
			}
		);
		expect(body.toString('base64url')).toBe(EXPECTED);
	});

	it('uses a fresh key and salt for every message that the browser can decrypt', () => {
		const target = { p256dh: UA_PUBLIC, auth: AUTH };
		const a = encryptPayload(target, Buffer.from('hallo'));
		const b = encryptPayload(target, Buffer.from('hallo'));
		expect(a.equals(b)).toBe(false);
		expect(decrypt(a)).toBe('hallo');
	});

	it('signs a VAPID token for the push service origin', () => {
		const keys = vapidKeys(newVapidScalar());
		const now = Date.UTC(2026, 9, 20);
		const header = vapidAuthorization(
			keys,
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://ev.example.org',
			now
		);
		const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
		expect(k).toBe(keys.publicKey);
		const [h, c, s] = token.split('.');
		const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
		expect(claims).toEqual({
			aud: 'https://fcm.googleapis.com',
			exp: now / 1000 + 12 * 3600,
			sub: 'https://ev.example.org'
		});
		const publicKey = createPublicKey({
			format: 'jwk',
			key: {
				kty: 'EC',
				crv: 'P-256',
				x: Buffer.from(keys.publicKey, 'base64url').subarray(1, 33).toString('base64url'),
				y: Buffer.from(keys.publicKey, 'base64url').subarray(33).toString('base64url')
			}
		});
		const ok = verify(
			'sha256',
			Buffer.from(`${h}.${c}`),
			{ key: publicKey, dsaEncoding: 'ieee-p1363' },
			Buffer.from(s, 'base64url')
		);
		expect(ok).toBe(true);
	});

	it('rejects a push key of the wrong size', () => {
		expect(() => vapidKeys(Buffer.alloc(16).toString('base64url'))).toThrow();
	});

	it('reports delivered, gone and failed messages', async () => {
		const keys = vapidKeys(newVapidScalar());
		const target = {
			endpoint: 'https://fcm.googleapis.com/fcm/send/x',
			p256dh: UA_PUBLIC,
			auth: AUTH
		};
		const answer = (status: number) => vi.fn(async () => new Response(null, { status }));

		const ok = answer(201);
		expect(
			await sendPush(target, { title: 'x' }, keys, 'https://ev.example.org', { fetch: ok })
		).toBe('sent');
		const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(target.endpoint);
		expect(init.redirect).toBe('error');
		expect(init.headers).toMatchObject({ 'content-encoding': 'aes128gcm', ttl: '86400' });

		for (const status of [404, 410]) {
			expect(await sendPush(target, {}, keys, 'x', { fetch: answer(status) })).toBe('gone');
		}
		expect(await sendPush(target, {}, keys, 'x', { fetch: answer(500) })).toBe('failed');
		const broken = vi.fn(async () => {
			throw new TypeError('network');
		});
		expect(await sendPush(target, {}, keys, 'x', { fetch: broken })).toBe('failed');
	});
});
