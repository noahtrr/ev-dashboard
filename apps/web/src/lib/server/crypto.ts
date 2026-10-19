import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Derives the 256-bit AES key from ENCRYPTION_KEY (or the generated key file). */
export function deriveKey(secret: string): Buffer {
	return Buffer.from(hkdfSync('sha256', secret, '', 'ev-dashboard/vehicle-api-credential', 32));
}

/**
 * AES-256-GCM. `context` is bound as additional authenticated data (e.g. the user ID),
 * so a ciphertext copied to another row does not decrypt.
 * Output: `v1.<base64url(iv | tag | ciphertext)>`.
 */
export function encrypt(plaintext: string, key: Buffer, context: string): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(context));
	const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')}`;
}

export function decrypt(payload: string, key: Buffer, context: string): string {
	const [version, body] = payload.split('.');
	if (version !== VERSION || !body) throw new Error('unsupported ciphertext format');
	const raw = Buffer.from(body, 'base64url');
	const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
	decipher.setAAD(Buffer.from(context));
	decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
	return Buffer.concat([
		decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
		decipher.final()
	]).toString('utf8');
}
