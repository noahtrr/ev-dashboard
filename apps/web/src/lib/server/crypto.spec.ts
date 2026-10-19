import { describe, expect, it } from 'vitest';
import { decrypt, deriveKey, encrypt } from './crypto.ts';

const key = deriveKey('a'.repeat(43));

describe('vehicle credential encryption', () => {
	it('round-trips a value', () => {
		const payload = encrypt('s3cr3t-välue', key, 'user-1');
		expect(payload).toMatch(/^v1\./);
		expect(payload).not.toContain('s3cr3t');
		expect(decrypt(payload, key, 'user-1')).toBe('s3cr3t-välue');
	});

	it('uses a fresh IV for every encryption', () => {
		expect(encrypt('same', key, 'u')).not.toBe(encrypt('same', key, 'u'));
	});

	it('rejects another context, another key and tampered data', () => {
		const payload = encrypt('secret', key, 'user-1');
		expect(() => decrypt(payload, key, 'user-2')).toThrow();
		expect(() => decrypt(payload, deriveKey('b'.repeat(43)), 'user-1')).toThrow();
		const tampered = payload.slice(0, -2) + (payload.endsWith('A') ? 'BB' : 'AA');
		expect(() => decrypt(tampered, key, 'user-1')).toThrow();
	});
});
