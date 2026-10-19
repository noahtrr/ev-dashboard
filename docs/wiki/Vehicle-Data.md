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

The home page shows four modules for the selected vehicle:

- **Location:** a map with the vehicle position, the street address and when the position was determined. The address can be switched off; tile and address services are replaceable (see [Configuration](Configuration)).
- **Range:** range in km, state of charge as a ring and the charging status, with the time until full while charging.
- **Charging:** the ongoing or last charging session with the amount added and its duration. **Charging history** leads to a page with the state of charge over time (7, 30 or 90 days, charging times highlighted) and every session in the period. Selecting a session opens its detail page: location with map and address, start and end, state of charge and range before and after, average charging speed and power, odometer, outside temperature, the vehicle's charging status and the state of charge during the session. Only values the vehicle reported are shown.
- **Trips:** the ongoing or last trip with distance, time, duration and consumption. **Trip log** leads to a page with the distance per day (7, 30 or 90 days), totals for trips, distance, driving time and average consumption, and every trip in the period. Selecting a trip opens its detail page: map with the route, start and destination address, start and end, distance, consumption, state of charge, range and odometer before and after, average speed and outside temperature.

Sessions are derived from the stored fetches: consecutive fetches with the status "charging" form a session. If the vehicle reports no charging status, a rising state of charge with the cable plugged in counts. More than three times `POLL_INTERVAL_SECONDS` (at least 30 minutes) between two fetches starts a new session. The API does not report the battery size, so the charged amount is given in percentage points at first. If you enter the usable capacity under **Battery** on the vehicle's detail page (Account → vehicle; 5 to 250 kWh), the dashboard shows charged energy and charging power in kWh and kW. These values are estimated from the percentage points and the capacity; charging losses are not included.

Trips are derived from the stored fetches as well: the vehicle drove between two fetches if the ignition is on, the odometer went up or (without an odometer) the position changed by more than 300 m. Consecutive such intervals form a trip, from the last fetch before departure to the first fetch at the destination. Start and end are therefore accurate to `POLL_INTERVAL_SECONDS`, and the route only connects the fetched positions. Movements shorter than 200 m do not count. The distance comes from the odometer, otherwise from the positions. The dashboard shows consumption in kWh/100 km once the usable capacity is entered, otherwise the state of charge used in percentage points.

### Trip log and export

Once the vehicle is parked again after a trip, the app copies the trip into the trip log. It stays there even when older fetches are deleted after `RETENTION_DAYS`. Start and destination addresses are looked up in the background when `GEOCODING_ENABLED` is on.

- **Classify:** On a trip's page you choose **Private** or **Business** and can add a purpose or note (up to 500 characters). The trip list shows each trip's purpose and the kilometres per purpose, and can be filtered by business, private or open.
- **Export:** **Export** lets you pick the period, the trips (all, business only or private only) and the format. **Excel** holds a sheet with all trips and a sheet with totals per purpose, **CSV** suits accounting programs (German with semicolons and decimal commas), **Text** is a readable list for printing. Dates and times follow your browser's time zone.
- **Templates:** You upload your own Excel templates on the export page (up to 2 MB, at most 10). They stay in your server's database and never go into the repository. Currently supported is an annual statement with one row per month: the app enters the start and end of the period, the odometer at the start, and per month the odometer at the end of the month, the private kilometres and the number of days with business trips. Everything else, such as formulas and fields for name or signature, stays unchanged. Months that have not begun yet stay empty. If the period starts before the first trip in the log, those months get the first known odometer reading.

The trip log is an overview built from vehicle data and not a tax-compliant logbook, as entries can be changed afterwards.

### Consumption

In the trips module, **Consumption** leads to an analysis over 30 days, 12 months or the whole trip log:

- the average consumption in kWh/100 km compared with the equally long period before, plus distance, energy and the calculated range on a full battery;
- a bar chart per week (30 days) or per month, with the average as a dashed line;
- consumption by outside temperature (below 0, 0–10, 10–20, above 20 °C) and by trip length (under 10, 10–50, over 50 km).

Each trip's consumption is estimated from the charge level before and after the trip and the usable capacity; averages are weighted by distance. Trips under 1 km, trips with missing fetches and trips in which the charge level rose do not count. Groups under 20 km are not shown, because the charge level is reported in whole percent only. Without a capacity the page shows percentage points of the battery per 100 km. A trip's outside temperature is the mean of the reported values and is stored with the trip in the trip log; for trips recorded before this feature, the app fills it in as long as the fetches are still there. Weeks and months follow your browser's time zone.

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
