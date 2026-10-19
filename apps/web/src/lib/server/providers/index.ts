// Registry of vehicle data providers. Adding a provider = adding a module and an entry here.
import { createConnectQueryProvider, CONNECT_QUERY_ID } from './connect-query/index.ts';
import type { VehicleProvider } from './types.ts';

export { CONNECT_QUERY_ID };

/** The provider offered on the account page. */
export const DEFAULT_PROVIDER_ID = CONNECT_QUERY_ID;

export function createProviders(): Map<string, VehicleProvider> {
	const providers = [createConnectQueryProvider()];
	return new Map(providers.map((p) => [p.id, p]));
}

/** Path of the OAuth redirect URI; each user registers `<APP_URL>` + this at the provider. */
export function callbackPath(providerId: string) {
	return `/api/providers/${providerId}/callback`;
}
