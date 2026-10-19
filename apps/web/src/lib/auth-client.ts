import { createAuthClient } from 'better-auth/svelte';
import { passkeyClient } from '@better-auth/passkey/client';

// Talks to /api/auth on the current origin.
export const authClient = createAuthClient({ plugins: [passkeyClient()] });
