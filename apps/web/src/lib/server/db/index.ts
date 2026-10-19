// SQLite through Node's built-in `node:sqlite` (no native addon to rebuild per Node ABI
// or architecture), exposed to Drizzle via its sqlite-proxy driver.
import { createHash } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.ts';
import journal from './migrations/meta/_journal.json';

export type Database = SqliteRemoteDatabase<typeof schema>;

// Bundled into the build so the image needs no migration files on disk.
const migrationFiles = import.meta.glob<string>('./migrations/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
});

function toSqlite(value: unknown): SQLInputValue {
	if (value === undefined || value === null) return null;
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (value instanceof Date) return value.getTime();
	return value as SQLInputValue;
}

/**
 * Applies pending migrations in one transaction. Uses Drizzle's bookkeeping table
 * (`__drizzle_migrations`, keyed by the journal timestamp) so drizzle-kit stays compatible.
 */
export function migrate(sqlite: DatabaseSync) {
	sqlite.exec(
		'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)'
	);
	const last = sqlite
		.prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1')
		.get() as { created_at: number } | undefined;
	const pending = journal.entries.filter((e) => !last || Number(last.created_at) < e.when);
	if (pending.length === 0) return 0;

	sqlite.exec('BEGIN');
	try {
		for (const entry of pending) {
			const content = migrationFiles[`./migrations/${entry.tag}.sql`];
			if (content === undefined) throw new Error(`migration ${entry.tag} is missing`);
			for (const statement of content.split('--> statement-breakpoint')) {
				if (statement.trim()) sqlite.exec(statement);
			}
			sqlite
				.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
				.run(createHash('sha256').update(content).digest('hex'), entry.when);
		}
		sqlite.exec('COMMIT');
	} catch (error) {
		sqlite.exec('ROLLBACK');
		throw error;
	}
	return pending.length;
}

/** Opens (or creates) the database, migrates it and returns the Drizzle handle. */
export function openDatabase(filename: string) {
	const sqlite = new DatabaseSync(filename);
	// Holds password hashes and sessions: owner-only, like the secret files. SQLite gives
	// the -wal/-shm files the same mode.
	if (filename !== ':memory:') chmodSync(filename, 0o600);
	sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
	migrate(sqlite);

	const db: Database = drizzle(
		async (query, params, method) => {
			const statement = sqlite.prepare(query);
			const args = params.map(toSqlite);
			if (method === 'run') {
				statement.run(...args);
				return { rows: [] };
			}
			// Drizzle maps positional values, so ask for arrays instead of objects.
			statement.setReturnArrays(true);
			if (method === 'get') return { rows: statement.get(...args) as unknown as unknown[] };
			return { rows: statement.all(...args) };
		},
		{ schema }
	);
	return { sqlite, db };
}
