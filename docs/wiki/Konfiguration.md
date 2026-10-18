# Konfiguration

Die gesamte Konfiguration erfolgt über Umgebungsvariablen in der `.env`-Datei. Vorlage: [`.env.example`](https://github.com/noahtrr/ev-dashboard/blob/main/.env.example).

## Aktuell verfügbar

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `APP_URL` | ja | | Öffentliche URL der Instanz, z. B. `https://ev.example.com`. Muss mit `http://` oder `https://` beginnen. |
| `TLS_MODE` | nein | `auto` | `auto`: Let's-Encrypt-Zertifikat über Caddy. `internal`: selbst signiertes Zertifikat zum Testen. `off`: nur HTTP auf Port 8080, für den Betrieb hinter einem eigenen Proxy. |
| `ACME_EMAIL` | bei `auto` | | Kontaktadresse für Let's Encrypt. |
| `TRUSTED_PROXIES` | nein | `private_ranges` | Proxys, deren `X-Forwarded-*`-Header vertraut wird. |

## Geplant

Diese Variablen kommen mit den nächsten Versionen und sind in `.env.example` bereits auskommentiert:

| Variable | Zweck |
|---|---|
| `AUTH_SECRET` | Signatur der Sitzungen |
| `ENCRYPTION_KEY` | Verschlüsselung der Fahrzeug-Tokens in der Datenbank |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Anmeldung mit GitHub (leer = aus) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Anmeldung mit Google (leer = aus) |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | SSO über OpenID Connect (Authentik, Keycloak, Entra ID …) |
| `VEHICLE_CLIENT_ID`, `VEHICLE_CLIENT_SECRET` | Zugangsdaten der eigenen App beim Fahrzeugdaten-Anbieter |
