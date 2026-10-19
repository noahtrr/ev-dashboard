# Vehicle data

The dashboard reads vehicle data through the manufacturer's official, read-only API. Each operator registers **their own app** in the provider's developer portal and enters its credentials on the account page in the dashboard. No credentials are shared with the project.

## Flow

1. Create an app in the provider's developer portal (personal use) and register this redirect URI:
   `https://<your-domain>/api/providers/<provider>/callback`
2. Enter client ID and client secret in the dashboard under **Account → Vehicle API**. Every user stores their own credentials; they are encrypted with `ENCRYPTION_KEY` (AES-256-GCM), and the secret is never shown again after saving.
3. Choose "Connect vehicle" in the dashboard. You are sent to the provider's sign-in page and pick the vehicle to share.
4. The dashboard receives an access token and a refresh token (OAuth 2.0 authorization code flow). Both are stored encrypted in the database.
5. A background job fetches the data at a fixed interval.

## API characteristics

- **Read-only:** starting a charge, locking and similar commands are not possible.
- **One token per vehicle:** consent covers the vehicle picked during sign-in. Several vehicles mean several connections.
- **Polling, not push:** data is requested, not sent by the vehicle.
- **Available areas:** telemetry (location, state of charge, range, odometer, tyre pressure, doors, temperatures …), garage (vehicle details), alerts, wallbox, departure times, charge schedules and charging history.
- Not every model reports every value. The dashboard shows missing values as "not available".

Endpoint and response details follow with the provider module.
