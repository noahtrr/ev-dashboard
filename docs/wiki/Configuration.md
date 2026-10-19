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
| `ENCRYPTION_KEY` | no | generated | Encrypts the vehicle API credentials in the database, at least 32 characters. Empty: generated in `/data/encryption-key` (0600). After a change, stored credentials can no longer be read and have to be entered again. |
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
- Every page except `/api/health`, `/api/auth/*`, `/login`, `/signup` and `/setup` requires sign-in.
- The auth endpoints are rate limited (e.g. 10 sign-in attempts per minute and address).
- Each user manages their passkeys on the **Account** page (menu at the top right).
- Email verification and password reset by mail are not available yet (no SMTP).

### Callback URLs

Register these as redirect or callback URL at the provider (replace `<APP_URL>`):

| Provider | Callback URL |
|---|---|
| GitHub | `<APP_URL>/api/auth/callback/github` |
| Google | `<APP_URL>/api/auth/callback/google` |
| OIDC | `<APP_URL>/api/auth/callback/oidc` |

At the OIDC provider, create a confidential client (authorization code with PKCE) with the scopes `openid email profile`.

## Vehicle API

The credentials for the vehicle data provider (client ID and client secret) are not part of `.env`. Every user enters their own on the **Account → Vehicle API** page. They are stored encrypted with `ENCRYPTION_KEY` (AES-256-GCM); the secret is never shown again after saving. See [Vehicle data](Vehicle-Data).

## Data

`/data` holds the SQLite database `ev-dashboard.db`, the generated keys `auth-secret` and `encryption-key`, and the Caddy certificates. Database migrations run automatically at startup. For a backup, stop the container and copy the directory, including the key files.
