// Web Push without a third-party library: message encryption (RFC 8291, aes128gcm) and
// sender identification (VAPID, RFC 8292) with node:crypto, delivery with fetch.
import {
	createCipheriv,
	createECDH,
	createPrivateKey,
	hkdfSync,
	randomBytes,
	sign,
	type KeyObject
} from 'node:crypto';

/** What the browser hands out when a page subscribes (PushSubscription.toJSON()). */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type VapidKeys = {
	/** Uncompressed P-256 point, base64url; the `applicationServerKey` for browsers. */
	publicKey: string;
	privateKey: KeyObject;
};

const b64 = (data: Buffer) => data.toString('base64url');
const unb64 = (text: string) => Buffer.from(text, 'base64url');

/** VAPID keys from a 32-byte private scalar (base64url). */
export function vapidKeys(privateScalar: string): VapidKeys {
	const d = unb64(privateScalar);
	if (d.length !== 32) throw new Error('The push key must be 32 bytes');
	const ecdh = createECDH('prime256v1');
	ecdh.setPrivateKey(d);
	const pub = ecdh.getPublicKey();
	const privateKey = createPrivateKey({
		format: 'jwk',
		key: {
			kty: 'EC',
			crv: 'P-256',
			d: b64(d),
			x: b64(pub.subarray(1, 33)),
			y: b64(pub.subarray(33, 65))
		}
	});
	return { publicKey: b64(pub), privateKey };
}

/** A new random private scalar for `vapidKeys`. */
export function newVapidScalar(): string {
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	return b64(ecdh.getPrivateKey());
}

/** `Authorization` header value for one push service origin (RFC 8292). */
export function vapidAuthorization(
	keys: VapidKeys,
	endpoint: string,
	subject: string,
	now = Date.now()
): string {
	const header = b64(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = b64(
		Buffer.from(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				// At most 24 hours are allowed; 12 leaves room for clock drift.
				exp: Math.floor(now / 1000) + 12 * 3600,
				sub: subject
			})
		)
	);
	const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
		key: keys.privateKey,
		dsaEncoding: 'ieee-p1363'
	});
	return `vapid t=${header}.${claims}.${b64(signature)}, k=${keys.publicKey}`;
}

/** Record size announced in the header; the whole message fits into one record. */
const RECORD_SIZE = 4096;

/**
 * Encrypts `payload` for one subscription (RFC 8291). `salt` and `senderPrivate` are only
 * passed by tests; normally both are random per message.
 */
export function encryptPayload(
	target: Pick<PushTarget, 'p256dh' | 'auth'>,
	payload: Buffer,
	options: { salt?: Buffer; senderPrivate?: Buffer } = {}
): Buffer {
	const uaPublic = unb64(target.p256dh);
	const authSecret = unb64(target.auth);
	const ecdh = createECDH('prime256v1');
	if (options.senderPrivate) ecdh.setPrivateKey(options.senderPrivate);
	else ecdh.generateKeys();
	const asPublic = ecdh.getPublicKey();
	const shared = ecdh.computeSecret(uaPublic);
	const salt = options.salt ?? randomBytes(16);

	const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
	const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
	const cek = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: aes128gcm\0', 16));
	const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: nonce\0', 12));

	// 0x02 marks the last (and only) record; no padding.
	const plaintext = Buffer.concat([payload, Buffer.from([2])]);
	if (plaintext.length + 16 > RECORD_SIZE - 86) throw new Error('Push payload too large');
	const cipher = createCipheriv('aes-128-gcm', cek, nonce);
	const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

	const header = Buffer.alloc(21);
	salt.copy(header, 0);
	header.writeUInt32BE(RECORD_SIZE, 16);
	header.writeUInt8(asPublic.length, 20);
	return Buffer.concat([header, asPublic, body]);
}

export type SendResult = 'sent' | 'gone' | 'failed';

/** Posts one message; `gone` means the subscription no longer exists and can be deleted. */
export async function sendPush(
	target: PushTarget,
	payload: object,
	keys: VapidKeys,
	subject: string,
	options: { ttlSeconds?: number; fetch?: typeof fetch; timeoutMs?: number } = {}
): Promise<SendResult> {
	const body = encryptPayload(target, Buffer.from(JSON.stringify(payload)));
	try {
		const response = await (options.fetch ?? fetch)(target.endpoint, {
			method: 'POST',
			headers: {
				authorization: vapidAuthorization(keys, target.endpoint, subject),
				'content-encoding': 'aes128gcm',
				'content-type': 'application/octet-stream',
				ttl: String(options.ttlSeconds ?? 24 * 3600),
				urgency: 'normal'
			},
			body: new Uint8Array(body),
			redirect: 'error',
			signal: AbortSignal.timeout(options.timeoutMs ?? 10_000)
		});
		if (response.status === 404 || response.status === 410) return 'gone';
		return response.ok ? 'sent' : 'failed';
	} catch {
		return 'failed';
	}
}
