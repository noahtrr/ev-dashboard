// Drizzle schema. The first four tables plus `passkey` follow Better Auth's model
// (field names must match); `vehicle_api_credential` belongs to the app.
// After changing this file run `pnpm --filter @ev-dashboard/web db:generate`.
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	role: text('role').notNull().default('user'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(t) => [index('session_user_id_idx').on(t.userId)]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('account_user_id_idx').on(t.userId)]
);

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
	},
	(t) => [index('verification_identifier_idx').on(t.identifier)]
);

export const passkey = sqliteTable(
	'passkey',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		publicKey: text('public_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		credentialID: text('credential_id').notNull(),
		counter: integer('counter').notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
		transports: text('transports'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }),
		aaguid: text('aaguid')
	},
	(t) => [
		index('passkey_user_id_idx').on(t.userId),
		index('passkey_credential_id_idx').on(t.credentialID)
	]
);

/** Per-user credentials for the vehicle data API, encrypted at rest (see crypto.ts). */
export const vehicleApiCredential = sqliteTable('vehicle_api_credential', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	clientId: text('client_id').notNull(),
	clientSecret: text('client_secret').notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
});
