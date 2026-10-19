// Endpoints of the "Connect Query" vehicle data API, kept in one place.

export const API_ORIGIN = 'https://api.vehicle.ford.com';

/**
 * Authorization endpoint. Not in the provider's API collection (which only lists the token
 * endpoint), but confirmed by a real sign-in on 2026-10-19.
 */
export const AUTHORIZE_URL = `${API_ORIGIN}/fcon-public/v1/auth/init`;

/** Alternative derived from the token endpoint (standard Azure AD B2C layout). Unverified. */
export const AUTHORIZE_URL_B2C = `${API_ORIGIN}/dah2vb2cprod.onmicrosoft.com/oauth2/v2.0/authorize?p=B2C_1A_FCON_AUTHORIZE`;

/** Token endpoint for `authorization_code` and `refresh_token` grants (form-urlencoded). */
export const TOKEN_URL = `${API_ORIGIN}/dah2vb2cprod.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_FCON_AUTHORIZE`;

/** Data API base; endpoints below are relative to it. */
export const QUERY_BASE = `${API_ORIGIN}/fcon-query/v1`;

/**
 * Endpoints fetched on every poll. Key = name used in stored raw data.
 * TODO: `wallbox`, `electric/departure-times` and `electric/charge-schedules` also exist;
 * add them once the response formats of the core endpoints are known and polling them is
 * shown not to count against rate limits. `fccs` (charging history) needs a date range and
 * a `chargingStationId` header, so it does not fit a plain poll.
 */
export const DATA_ENDPOINTS = {
	garage: 'garage',
	telemetry: 'telemetry',
	alerts: 'vehicle-health/alerts'
} as const;

/** OAuth scope: the client ID itself plus offline access (refresh token) and OpenID. */
export const scopeFor = (clientId: string) => `${clientId} offline_access openid`;

export type Endpoints = {
	authorizeUrl: string;
	tokenUrl: string;
	queryBase: string;
};

export const DEFAULT_ENDPOINTS: Endpoints = {
	authorizeUrl: AUTHORIZE_URL,
	tokenUrl: TOKEN_URL,
	queryBase: QUERY_BASE
};
