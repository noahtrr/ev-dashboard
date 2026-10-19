# Vehicle data

The dashboard reads vehicle data through the manufacturer's official, read-only API. Each user registers **their own app** in the provider's developer portal and enters its credentials on the account page in the dashboard. No credentials are shared with the project.

In the code, the provider module has the neutral name `connect-query`.

## Connecting a vehicle

1. **Register an app:** create an app for personal use in the provider's developer portal (enable all data categories). Approval can take a few hours.
2. **Register the redirect URI:** the account page shows your instance's redirect URI under **Vehicles**, with a copy button. It is
   `<APP_URL>/api/providers/connect-query/callback`
   and must be entered exactly like this in the app at the provider. The instance must be reachable from the browser at `APP_URL`.
3. **Enter the credentials:** save client ID and client secret under **Account → Vehicle API**. They are encrypted with `ENCRYPTION_KEY` (AES-256-GCM); the secret is never shown again.
4. **Connect:** click **Connect vehicle** under **Account → Vehicles**. You are sent to the provider's sign-in page, sign in and pick the vehicle to share. You then return to the account page, and the first fetch runs right away.

For several vehicles, connect several times: each consent is its own connection with its own token.

### Managing connections

- **Status:** "Connected" or "Needs re-authorization", plus the time of the last successful fetch and the last error.
- **Fetch now:** fetches new data immediately (at most once per minute).
- **Details:** shows the latest values and the raw data of the latest fetch per endpoint.
- **Disconnect:** after a confirmation, deletes the tokens and all stored data of this vehicle. Revoke the consent at the provider itself there.
- **Needs re-authorization:** when the token can no longer be refreshed (expired, revoked, credentials changed or deleted), the connection is no longer polled. Disconnect it and connect the vehicle again.

Every user only sees their own vehicles.

## Fetched data

Each fetch requests three endpoints: garage (vehicle details), telemetry and alerts. The responses are stored **unmodified** and, as far as recognizable, translated into uniform values (metric units):

| Value | Unit |
|---|---|
| Position and when it was determined | latitude/longitude |
| State of charge | % |
| Range | km |
| Charging cable plugged in, charging status | |
| Time until full (shown only while charging) | min |
| Ignition on/off | |
| Door locks locked, doors and windows closed | |
| Odometer | km |
| Outside temperature | °C |
| 12 V battery | V, % |
| Number of alerts | |
| Time reported by the vehicle | |

Not every model reports every value; missing values are shown as "–". Further endpoints (wallbox, departure times, charge schedules, charging history) are not requested yet.

## Home page

The home page shows two modules for the selected vehicle:

- **Location:** a map with the vehicle position, the street address and when the position was determined. The address can be switched off; tile and address services are replaceable (see [Configuration](Configuration)).
- **Range:** range in km, state of charge as a ring and the charging status, with the time until full while charging.

Values older than three times `POLL_INTERVAL_SECONDS` (at least 30 minutes) are marked as "stale". With several vehicles you pick the vehicle at the top; "All values" leads to the details page.

## Polling and retention

- A background job in the app polls every active connection every `POLL_INTERVAL_SECONDS` seconds (default 300, minimum 60), with some random spread.
- **Polling too often can get the vehicle account locked at the provider.** Only change the default if you need to.
- After errors, the interval for that connection grows step by step (up to 6 hours); a rate-limit response from the provider is respected.
- The access token is refreshed automatically shortly before it expires. All tokens are stored encrypted in the database and never reach the browser.
- Normalized values are stored on every fetch, raw data per endpoint only when it changed. This saves a lot of storage.
- Data older than `RETENTION_DAYS` days (default 365, `0` = forever) is deleted once a day.

## Known uncertainties

- **Response formats only partly known:** the telemetry mapping is checked against a real response from an electric vehicle. Other models can report other fields, so the translation stays tolerant and guesses unknown fields from typical names. The raw data on the details page shows what your vehicle actually reports.
- **Position often older:** the vehicle reports its position less often than the state of charge, so the details page shows when the position was determined separately.
- **Charging power not translated:** the telemetry contains a charging power value whose unit is ambiguous. It stays in the raw data but is not translated.
- **Several vehicles in one consent:** if the garage lists several vehicles, the dashboard uses the name of the first.

## API characteristics

- **Read-only:** starting a charge, locking and similar commands are not possible.
- **One token per consent:** the endpoints contain no vehicle ID; the token covers the vehicle picked during consent.
- **Polling, not push:** data is requested, not sent by the vehicle.
