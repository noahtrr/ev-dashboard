# Configuration

All configuration is done through environment variables in the `.env` file. Template: [`.env.example`](https://github.com/noahtrr/ev-dashboard/blob/main/.env.example).

## General

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_URL` | yes | | Public URL of the instance, e.g. `https://ev.example.com`. Must start with `http://` or `https://`. Base for OAuth callbacks and passkeys. |
| `TLS_MODE` | no | `auto` | `auto`: Let's Encrypt certificate via Caddy. `internal`: self-signed certificate for testing. `off`: plain HTTP on port 8080, for running behind your own proxy. |
| `ACME_EMAIL` | with `auto` | | Contact address for Let's Encrypt. |
| `TRUSTED_PROXIES` | no | `private_ranges` | Proxies whose `X-Forwarded-*` headers are trusted. |
| `DATA_DIR` | no | `/data` in the image | Location of the database and generated keys. Only change it when running the app outside Docker. |

## Authentication

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_SECRET` | no | generated | Signs sessions, at least 32 characters (`openssl rand -base64 32`). Empty: generated on first start and stored in `/data/auth-secret` (mode 0600). Changing it signs everyone out. |
| `ENCRYPTION_KEY` | no | generated | Encrypts the vehicle API credentials in the database, at least 32 characters. Empty: generated in `/data/encryption-key` (0600). After a change, stored credentials and vehicle tokens can no longer be read: enter the credentials again and reconnect the vehicles. |
| `AUTH_EMAIL_PASSWORD` | no | `true` | Sign in with email and password. |
| `AUTH_PASSKEY` | no | `true` | Sign in with a passkey. The relying party is the host name of `APP_URL`. |
| `AUTH_ALLOW_SIGNUP` | no | `false` | Allow new registrations after the first account, including the first sign-in of unknown users via GitHub, Google or SSO. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | no | | Sign in with GitHub, enabled when both are set. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | | Sign in with Google, enabled when both are set. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | no | | SSO via OpenID Connect (Authentik, Keycloak, Entra ID …), enabled when all three are set. Endpoints are read from `<OIDC_ISSUER>/.well-known/openid-configuration`. |
| `OIDC_NAME` | no | `SSO` | Label of the SSO button. |

### How it works

- **First start:** while no account exists, the app redirects to `/setup`. The first account becomes administrator.
- **Further accounts** are refused unless `AUTH_ALLOW_SIGNUP` is `true`. This also applies to the first sign-in of an unknown user via GitHub, Google or SSO.
- **Invitations:** with mail set up, an administrator can invite addresses on the **Administration** page. The link in the mail is valid for 7 days and allows exactly that address to sign up, even when `AUTH_ALLOW_SIGNUP` is `false`. The address then counts as confirmed.
- Every page except `/api/health`, `/api/auth/*`, `/login`, `/signup`, `/setup`, `/forgot-password` and `/reset-password` requires sign-in.
- The auth endpoints are rate limited (e.g. 10 sign-in attempts per minute and address).
- Passwords need at least 8 characters.
- Signing in via GitHub, Google or SSO with the same email as an existing account links that sign-in to the account, provided the provider reports the email as verified. One account can thus be used several ways without letting others in through an unverified address.
- Each user manages their passkeys on the **Account** page (menu at the top right).
- **Administration** (administrators only, menu at the top right): a list of all accounts with registration date, sign-in methods, number of vehicles, last activity and open sessions. Administrators can change the role, sign an account out everywhere, lock it or delete it. Locked accounts are signed out at once, cannot sign in with any method, and their vehicles are no longer fetched; their data is kept. Deleting removes the account with all vehicles, trips, charging sessions and costs; the email address has to be typed to confirm. Your own account cannot be changed there, and the last administrator account always stays. Not even administrators see other users' vehicle data.
- Email confirmation, password reset and invitations need mail, see [Email](#email). Every user changes their email address and password on the **Account** page.

### Callback URLs

Register these as redirect or callback URL at the provider (replace `<APP_URL>`):

| Provider | Callback URL |
|---|---|
| GitHub | `<APP_URL>/api/auth/callback/github` |
| Google | `<APP_URL>/api/auth/callback/google` |
| OIDC | `<APP_URL>/api/auth/callback/oidc` |

At the OIDC provider, create a confidential client (authorization code with PKCE) with the scopes `openid email profile`.

## Email

Without `SMTP_HOST` the app sends no mail: accounts need no confirmation, and "Forgot password?" and invitations are not available. With a mail server you get:

- **Forgot password?** on the sign-in page sends a link (valid for one hour). Resetting the password ends all sessions of the account.
- **Email confirmation:** new accounts have to confirm their address via a link (valid for 24 hours) before they can sign in. The first account and invited addresses count as confirmed. Accounts that existed before the update to this version count as confirmed as well.
- **Change email address** on the **Account** page: the new address is only taken over once it is confirmed via a link sent to it.
- **Invitations** and a **test mail** for administrators on the **Administration** page.

Mails are in German or English, depending on the browser language of the request. If a mail cannot be sent, the error is in the log (`[mail] …`); for security the page does not reveal whether an address exists.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SMTP_HOST` | no | | Mail server. When set, mail is enabled. |
| `SMTP_PORT` | no | `587` | Port of the mail server. |
| `SMTP_SECURE` | no | `true` on port 465 | `true`: TLS from the start (usually port 465). `false`: STARTTLS if the server offers it (usually port 587). |
| `SMTP_USER`, `SMTP_PASSWORD` | no | | Credentials at the mail server. Empty: send without authentication. |
| `SMTP_FROM` | with `SMTP_HOST` | | Sender, e.g. `EV Dashboard <ev@example.com>`. The app does not start if `SMTP_HOST` is set without `SMTP_FROM`. |

## Vehicle API

The credentials for the vehicle data provider (client ID and client secret) are not part of `.env`. Every user enters their own on the **Account → Vehicle API** page and registers the redirect URI `<APP_URL>/api/providers/connect-query/callback` (shown on the account page) in their app at the provider. Credentials and vehicle tokens are stored encrypted with `ENCRYPTION_KEY` (AES-256-GCM). See [Vehicle data](Vehicle-Data).

| Variable | Required | Default | Description |
|---|---|---|---|
| `POLL_INTERVAL_SECONDS` | no | `300` | Seconds between two fetches per connected vehicle, at least `60`. Polling too often can get the vehicle account locked at the provider. |
| `RETENTION_DAYS` | no | `365` | Days fetched vehicle data is kept; older data is deleted once a day. The trip log is kept. `0` = forever. |

## Address

The home page shows the street address of the vehicle position. To get it, the server sends the position to a Nominatim-compatible service (default: the public OpenStreetMap service). Results are cached, and at most one request per second goes out. With `GEOCODING_ENABLED=false` the position never leaves the server.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEOCODING_ENABLED` | no | `true` | Show the street address of the vehicle position. |
| `GEOCODING_URL` | no | `https://nominatim.openstreetmap.org` | Base URL of the Nominatim-compatible service, e.g. a self-hosted instance. |

## Map

The browser loads map tiles directly from the tile server, which therefore learns which map area is shown, roughly where the vehicle is. The default is [OpenFreeMap](https://openfreemap.org) (free, no key). Any server with vector tiles in the OpenMapTiles schema works, including a self-hosted one.

| Variable | Required | Default | Description |
|---|---|---|---|
| `MAP_TILES_URL` | no | `https://tiles.openfreemap.org/planet` | TileJSON URL of the vector tiles. |
| `MAP_GLYPHS_URL` | no | `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` | URL template for the map label fonts. |

## Data

`/data` holds the SQLite database `ev-dashboard.db`, the generated keys `auth-secret`, `encryption-key` and `push-key`, and the Caddy certificates. Database migrations run automatically at startup. For a backup, stop the container and copy the directory, including the key files.
