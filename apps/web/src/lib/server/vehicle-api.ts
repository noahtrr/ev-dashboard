// Per-user credentials for the vehicle data API. Both values are encrypted at rest;
// the secret never leaves the server once stored.
import { eq } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { vehicleApiCredential } from './db/schema.ts';
import { decrypt, encrypt } from './crypto.ts';

export const MAX_CLIENT_ID_LENGTH = 256;
export const MAX_CLIENT_SECRET_LENGTH = 1024;

export type VehicleApiStatus =
	{ configured: false } | { configured: true; clientId: string; updatedAt: Date };

export type CredentialInput = { clientId: string; clientSecret: string };
export type CredentialError = 'required' | 'tooLong' | 'invalid';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function validateCredentials(
	clientId: unknown,
	clientSecret: unknown
): { ok: true; value: CredentialInput } | { ok: false; error: CredentialError } {
	if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
		return { ok: false, error: 'required' };
	}
	const id = clientId.trim();
	const secret = clientSecret.trim();
	if (!id || !secret) return { ok: false, error: 'required' };
	if (id.length > MAX_CLIENT_ID_LENGTH || secret.length > MAX_CLIENT_SECRET_LENGTH) {
		return { ok: false, error: 'tooLong' };
	}
	if (CONTROL_CHARS.test(id) || CONTROL_CHARS.test(secret)) return { ok: false, error: 'invalid' };
	return { ok: true, value: { clientId: id, clientSecret: secret } };
}

/** What the account page may show: never the secret. */
export async function getVehicleApiStatus(
	db: Database,
	key: Buffer,
	userId: string
): Promise<VehicleApiStatus> {
	const row = await db.query.vehicleApiCredential.findFirst({
		where: eq(vehicleApiCredential.userId, userId),
		columns: { clientId: true, updatedAt: true }
	});
	if (!row) return { configured: false };
	return {
		configured: true,
		clientId: decrypt(row.clientId, key, `${userId}:client_id`),
		updatedAt: row.updatedAt
	};
}

/** Decrypted credentials for server-side use by the vehicle provider. */
export async function getVehicleApiCredentials(
	db: Database,
	key: Buffer,
	userId: string
): Promise<CredentialInput | undefined> {
	const row = await db.query.vehicleApiCredential.findFirst({
		where: eq(vehicleApiCredential.userId, userId)
	});
	if (!row) return undefined;
	return {
		clientId: decrypt(row.clientId, key, `${userId}:client_id`),
		clientSecret: decrypt(row.clientSecret, key, `${userId}:client_secret`)
	};
}

export async function saveVehicleApiCredentials(
	db: Database,
	key: Buffer,
	userId: string,
	input: CredentialInput
) {
	const values = {
		clientId: encrypt(input.clientId, key, `${userId}:client_id`),
		clientSecret: encrypt(input.clientSecret, key, `${userId}:client_secret`),
		updatedAt: new Date()
	};
	await db
		.insert(vehicleApiCredential)
		.values({ userId, ...values })
		.onConflictDoUpdate({ target: vehicleApiCredential.userId, set: values });
}

export async function deleteVehicleApiCredentials(db: Database, userId: string) {
	await db.delete(vehicleApiCredential).where(eq(vehicleApiCredential.userId, userId));
}
