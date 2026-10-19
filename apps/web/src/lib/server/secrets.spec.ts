import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadOrCreateSecret } from './secrets.ts';

const dirs: string[] = [];
const tempDir = () => {
	const dir = mkdtempSync(join(tmpdir(), 'ev-secrets-'));
	dirs.push(dir);
	return dir;
};

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('loadOrCreateSecret', () => {
	it('prefers the configured value and writes nothing', () => {
		const dir = tempDir();
		expect(loadOrCreateSecret(dir, 'auth-secret', 'from-env')).toBe('from-env');
		expect(() => statSync(join(dir, 'auth-secret'))).toThrow();
	});

	it('generates a secret once, with mode 0600, and reuses it', () => {
		const dir = join(tempDir(), 'nested');
		const first = loadOrCreateSecret(dir, 'auth-secret');
		expect(first.length).toBeGreaterThanOrEqual(43);
		expect(statSync(join(dir, 'auth-secret')).mode & 0o777).toBe(0o600);
		expect(readFileSync(join(dir, 'auth-secret'), 'utf8').trim()).toBe(first);
		expect(loadOrCreateSecret(dir, 'auth-secret')).toBe(first);
	});
});
