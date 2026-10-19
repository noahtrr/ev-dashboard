// Provider-neutral contract for vehicle data sources. A provider module implements
// `VehicleProvider`; the rest of the app (connections, poller, UI) only uses this file.

/** OAuth client credentials of the user's own app at the provider. */
export type ClientCredentials = { clientId: string; clientSecret: string };

export type TokenSet = {
	accessToken: string;
	/** Absent when the provider did not issue (or rotate) one. */
	refreshToken?: string;
	expiresAt: Date;
};

export type VehicleInfo = {
	/** Provider's identifier for the vehicle (may be absent). */
	id?: string;
	/** Human-readable name, e.g. nickname or model and year. */
	name?: string;
};

/**
 * Normalized values. Every field is optional: models report different subsets and the
 * provider's response formats are not guaranteed. Metric units only.
 */
export type VehicleData = {
	latitude?: number;
	longitude?: number;
	/** When the position was determined (ISO 8601); often older than the other values. */
	positionAt?: string;
	/** High-voltage battery state of charge, 0–100 %. */
	stateOfChargePct?: number;
	rangeKm?: number;
	pluggedIn?: boolean;
	chargingState?: ChargingState;
	/** The provider's own charging status string, for display when unmapped. */
	chargingStatusRaw?: string;
	/** Minutes until the battery is full, as estimated by the vehicle. */
	timeToFullChargeMin?: number;
	odometerKm?: number;
	outsideTempC?: number;
	battery12vVoltage?: number;
	battery12vPct?: number;
	alertCount?: number;
	ignitionOn?: boolean;
	/** True when every reported door lock is locked, false when any is unlocked. */
	doorsLocked?: boolean;
	/** True when every reported door is closed, false when any is open. */
	doorsClosed?: boolean;
	/** True when every reported window is closed, false when any is open. */
	windowsClosed?: boolean;
	/** When the vehicle reported the values (ISO 8601), if the response says so. */
	reportedAt?: string;
};

export type ChargingState = 'charging' | 'notCharging' | 'complete' | 'fault';

/** Result of one request to one endpoint, stored verbatim for inspection. */
export type RawResponse = {
	status: number;
	/** Parsed JSON body; `null` when missing, too large or not JSON. */
	body: unknown;
	/** Why `body` is missing, e.g. `too_large`, `invalid_json`, `timeout`, `network`. */
	error?: string;
};

export type RawResponses = Record<string, RawResponse>;

export type ProviderSnapshot = {
	data: VehicleData;
	raw: RawResponses;
	vehicles: VehicleInfo[];
};

export type AuthorizeParams = {
	clientId: string;
	redirectUri: string;
	state: string;
};

export type ExchangeParams = {
	credentials: ClientCredentials;
	code: string;
	redirectUri: string;
};

export type RefreshParams = {
	credentials: ClientCredentials;
	refreshToken: string;
	redirectUri: string;
};

export type RequestOptions = { signal?: AbortSignal };

export interface VehicleProvider {
	/** Neutral identifier, part of the redirect URI. Never a manufacturer name. */
	readonly id: string;
	authorizeUrl(params: AuthorizeParams): string;
	exchangeCode(params: ExchangeParams, options?: RequestOptions): Promise<TokenSet>;
	refresh(params: RefreshParams, options?: RequestOptions): Promise<TokenSet>;
	listVehicles(accessToken: string, options?: RequestOptions): Promise<VehicleInfo[]>;
	fetchSnapshot(accessToken: string, options?: RequestOptions): Promise<ProviderSnapshot>;
}

/**
 * Error codes stored on a connection and shown (translated) in the UI. Codes only: provider
 * messages are never stored because they could echo request data.
 */
export type ProviderErrorCode =
	| 'auth'
	| 'rate_limited'
	| 'http'
	| 'timeout'
	| 'network'
	| 'invalid_response'
	| 'missing_credentials'
	| 'internal';

/**
 * `auth` means the token or grant was rejected: refreshing again will not help, the owner
 * has to authorize again (for a refresh) or the access token is invalid (for data calls).
 */
export class ProviderError extends Error {
	constructor(
		readonly code: ProviderErrorCode,
		readonly status?: number,
		/** Seconds the provider asked us to wait (Retry-After). */
		readonly retryAfter?: number
	) {
		super(status ? `${code} (HTTP ${status})` : code);
		this.name = 'ProviderError';
	}
}
