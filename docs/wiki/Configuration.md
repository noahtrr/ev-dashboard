# Configuration

All configuration is done through environment variables in the `.env` file. Template: [`.env.example`](https://github.com/noahtrr/ev-dashboard/blob/main/.env.example).

## Available now

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_URL` | yes | | Public URL of the instance, e.g. `https://ev.example.com`. Must start with `http://` or `https://`. |
| `TLS_MODE` | no | `auto` | `auto`: Let's Encrypt certificate via Caddy. `internal`: self-signed certificate for testing. `off`: plain HTTP on port 8080, for running behind your own proxy. |
| `ACME_EMAIL` | with `auto` | | Contact address for Let's Encrypt. |
| `TRUSTED_PROXIES` | no | `private_ranges` | Proxies whose `X-Forwarded-*` headers are trusted. |

## Planned

These variables arrive with the next versions and are already commented out in `.env.example`:

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Session signing |
| `ENCRYPTION_KEY` | Encrypts vehicle tokens in the database |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Sign in with GitHub (empty = off) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google (empty = off) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | SSO via OpenID Connect (Authentik, Keycloak, Entra ID …) |
| `VEHICLE_CLIENT_ID`, `VEHICLE_CLIENT_SECRET` | Credentials of your own app at the vehicle data provider |
