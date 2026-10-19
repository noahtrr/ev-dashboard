import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Returns `value` when the operator configured it, otherwise a random secret that is
 * generated on first start and kept in `<dataDir>/<name>` (mode 0600) across restarts.
 */
export function loadOrCreateSecret(dataDir: string, name: string, value?: string): string {
	if (value) return value;
	const file = join(dataDir, name);
	try {
		const stored = readFileSync(file, 'utf8').trim();
		if (stored) return stored;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	mkdirSync(dataDir, { recursive: true });
	const secret = randomBytes(32).toString('base64url');
	// `wx` fails if another process created the file meanwhile; then use theirs.
	try {
		writeFileSync(file, `${secret}\n`, { mode: 0o600, flag: 'wx' });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST')
			return readFileSync(file, 'utf8').trim();
		throw error;
	}
	chmodSync(file, 0o600);
	return secret;
}
