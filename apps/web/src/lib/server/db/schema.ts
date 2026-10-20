// Drizzle schema. The first four tables plus `passkey` follow Better Auth's model
// (field names must match); the vehicle tables below belong to the app.
// After changing this file run `pnpm --filter @ev-dashboard/web db:generate`.
import { sql } from 'drizzle-orm';
import {
	blob,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	role: text('role').notNull().default('user'),
	/** Set by an admin: no sign-in and no polling while set; the data is kept. */
	lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
	/** Admin's note on why the account is locked; only admins see it. */
	lockReason: text('lock_reason'),
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

/**
 * Pending OAuth authorization of a vehicle provider. The `state` parameter is stored only
 * as a SHA-256 hash; a row is single-use (deleted when the callback consumes it).
 */
export const providerOAuthState = sqliteTable(
	'provider_oauth_state',
	{
		stateHash: text('state_hash').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		providerId: text('provider_id').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now)
	},
	(t) => [index('provider_oauth_state_user_id_idx').on(t.userId)]
);

/**
 * One consent at a vehicle provider (one token pair). Tokens are encrypted (see crypto.ts)
 * with the connection ID as context.
 */
export const vehicleConnection = sqliteTable(
	'vehicle_connection',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		providerId: text('provider_id').notNull(),
		/** Display name, taken from the provider's vehicle list when available. */
		label: text('label'),
		/** Provider's vehicle identifier, when the vehicle list reports one. */
		externalId: text('external_id'),
		accessToken: text('access_token').notNull(),
		refreshToken: text('refresh_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }).notNull(),
		/** `active` or `reauth` (refresh failed; the owner has to connect again). */
		status: text('status').notNull().default('active'),
		lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
		lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
		lastErrorAt: integer('last_error_at', { mode: 'timestamp_ms' }),
		/** Short error code, never a provider message (could echo tokens). */
		lastError: text('last_error'),
		failureCount: integer('failure_count').notNull().default(0),
		/** Usable battery capacity in kWh, entered by the owner; turns percentages into energy. */
		batteryCapacityKwh: real('battery_capacity_kwh'),
		/** Where the owner charges at home; sessions within `HOME_RADIUS_M` use the home price. */
		homeLatitude: real('home_latitude'),
		homeLongitude: real('home_longitude'),
		/** Share lost between grid and battery, in percent; null means the default. */
		chargingLossPct: real('charging_loss_pct'),
		nextPollAt: integer('next_poll_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
	},
	(t) => [index('vehicle_connection_user_id_idx').on(t.userId)]
);

/** Time series of fetched vehicle data: normalized values plus the raw responses. */
export const snapshot = sqliteTable(
	'snapshot',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		connectionId: text('connection_id')
			.notNull()
			.references(() => vehicleConnection.id, { onDelete: 'cascade' }),
		fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
		/** Normalized values as JSON (see providers/types.ts `VehicleData`). */
		data: text('data').notNull(),
		/** Raw responses as JSON (see providers/types.ts `RawResponses`), only the endpoints whose response changed since the previous stored one. */
		raw: text('raw').notNull()
	},
	(t) => [
		index('snapshot_connection_fetched_idx').on(t.connectionId, t.fetchedAt),
		index('snapshot_fetched_at_idx').on(t.fetchedAt)
	]
);

/**
 * Trip log: finished trips copied from the snapshot series, so they outlive the snapshot
 * retention, plus what the owner records about them (private or business, purpose).
 */
export const trip = sqliteTable(
	'trip',
	{
		id: text('id').primaryKey(),
		connectionId: text('connection_id')
			.notNull()
			.references(() => vehicleConnection.id, { onDelete: 'cascade' }),
		/** Last snapshot before departure; identifies the trip within its connection. */
		startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
		endAt: integer('end_at', { mode: 'timestamp_ms' }).notNull(),
		distanceKm: real('distance_km').notNull(),
		startOdometerKm: real('start_odometer_km'),
		endOdometerKm: real('end_odometer_km'),
		startSocPct: real('start_soc_pct'),
		endSocPct: real('end_soc_pct'),
		startLatitude: real('start_latitude'),
		startLongitude: real('start_longitude'),
		endLatitude: real('end_latitude'),
		endLongitude: real('end_longitude'),
		/** Mean outside temperature during the trip, for consumption by temperature. */
		outsideTempC: real('outside_temp_c'),
		startAddress: text('start_address'),
		endAddress: text('end_address'),
		/** Snapshots were missing during the trip, so its timing is uncertain. */
		gap: integer('gap', { mode: 'boolean' }).notNull().default(false),
		/** `private` or `business`; null until the owner classifies the trip. */
		purpose: text('purpose'),
		/** Free text, e.g. the customer or the reason for a business trip. */
		note: text('note'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
	},
	(t) => [uniqueIndex('trip_connection_start_idx').on(t.connectionId, t.startAt)]
);

/**
 * Finished charging sessions copied from the snapshot series (like `trip`), so their costs
 * outlive the snapshot retention, plus what the owner entered about them.
 */
export const chargeSession = sqliteTable(
	'charge_session',
	{
		id: text('id').primaryKey(),
		connectionId: text('connection_id')
			.notNull()
			.references(() => vehicleConnection.id, { onDelete: 'cascade' }),
		/** First snapshot that showed charging; identifies the session within its connection. */
		startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
		endAt: integer('end_at', { mode: 'timestamp_ms' }).notNull(),
		startSocPct: real('start_soc_pct'),
		endSocPct: real('end_soc_pct'),
		latitude: real('latitude'),
		longitude: real('longitude'),
		/** Price the owner entered for this session, cents per kWh from the grid. */
		priceCtPerKwh: real('price_ct_per_kwh'),
		/** Total the owner entered, e.g. from a receipt, in euros; wins over any price. */
		costEur: real('cost_eur'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
	},
	(t) => [uniqueIndex('charge_session_connection_start_idx').on(t.connectionId, t.startAt)]
);

/** Electricity prices per connection; each applies from `validFrom` until the next one. */
export const electricityPrice = sqliteTable(
	'electricity_price',
	{
		id: text('id').primaryKey(),
		connectionId: text('connection_id')
			.notNull()
			.references(() => vehicleConnection.id, { onDelete: 'cascade' }),
		/** `home` or `away`. */
		kind: text('kind').notNull(),
		/** First day the price applies, `YYYY-MM-DD` in the owner's calendar. */
		validFrom: text('valid_from').notNull(),
		ctPerKwh: real('ct_per_kwh').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now)
	},
	(t) => [
		uniqueIndex('electricity_price_connection_kind_from_idx').on(
			t.connectionId,
			t.kind,
			t.validFrom
		)
	]
);

/** Excel templates an owner uploaded to fill from the trip log (see export/templates.ts). */
export const exportTemplate = sqliteTable(
	'export_template',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** Detected layout, e.g. `annual-mileage`. */
		kind: text('kind').notNull(),
		data: blob('data', { mode: 'buffer' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now)
	},
	(t) => [index('export_template_user_idx').on(t.userId)]
);

/** Invitations an admin sent by mail (see auth/invitations.ts). Only a hash of the token is kept. */
export const invitation = sqliteTable(
	'invitation',
	{
		id: text('id').primaryKey(),
		/** Lower case. */
		email: text('email').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		invitedBy: text('invited_by')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' })
	},
	(t) => [index('invitation_email_idx').on(t.email)]
);
