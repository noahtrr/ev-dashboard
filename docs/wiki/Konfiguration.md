# Konfiguration

Die gesamte Konfiguration erfolgt über Umgebungsvariablen in der `.env`-Datei. Vorlage: [`.env.example`](https://github.com/noahtrr/ev-dashboard/blob/main/.env.example).

## Allgemein

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `APP_URL` | ja | | Öffentliche URL der Instanz, z. B. `https://ev.example.com`. Muss mit `http://` oder `https://` beginnen. Grundlage für OAuth-Callbacks und Passkeys. |
| `TLS_MODE` | nein | `auto` | `auto`: Let's-Encrypt-Zertifikat über Caddy. `internal`: selbst signiertes Zertifikat zum Testen. `off`: nur HTTP auf Port 8080, für den Betrieb hinter einem eigenen Proxy. |
| `ACME_EMAIL` | bei `auto` | | Kontaktadresse für Let's Encrypt. |
| `TRUSTED_PROXIES` | nein | `private_ranges` | Proxys, deren `X-Forwarded-*`-Header vertraut wird. |
| `DATA_DIR` | nein | `/data` im Image | Ablage für Datenbank und erzeugte Schlüssel. Nur ändern, wenn die App außerhalb von Docker läuft. |

## Anmeldung

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `AUTH_SECRET` | nein | erzeugt | Signiert die Sitzungen, mindestens 32 Zeichen (`openssl rand -base64 32`). Leer: wird beim ersten Start erzeugt und in `/data/auth-secret` (Modus 0600) gespeichert. Eine Änderung meldet alle Benutzer ab. |
| `ENCRYPTION_KEY` | nein | erzeugt | Verschlüsselt die Fahrzeug-API-Zugangsdaten in der Datenbank, mindestens 32 Zeichen. Leer: wird in `/data/encryption-key` (0600) erzeugt. Nach einer Änderung sind gespeicherte Zugangsdaten unlesbar und müssen neu eingegeben werden. |
| `AUTH_EMAIL_PASSWORD` | nein | `true` | Anmeldung mit E-Mail und Passwort. |
| `AUTH_PASSKEY` | nein | `true` | Anmeldung mit Passkey. Relying Party ist der Hostname aus `APP_URL`. |
| `AUTH_ALLOW_SIGNUP` | nein | `false` | Neue Registrierungen nach dem ersten Konto erlauben, auch die erste Anmeldung unbekannter Benutzer über GitHub, Google oder SSO. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | nein | | Anmeldung mit GitHub, aktiv wenn beide gesetzt sind. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | nein | | Anmeldung mit Google, aktiv wenn beide gesetzt sind. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | nein | | SSO über OpenID Connect (Authentik, Keycloak, Entra ID …), aktiv wenn alle drei gesetzt sind. Die Endpunkte kommen aus `<OIDC_ISSUER>/.well-known/openid-configuration`. |
| `OIDC_NAME` | nein | `SSO` | Beschriftung des SSO-Knopfs. |

### Ablauf

- **Ersteinrichtung:** Solange es kein Konto gibt, leitet die App auf `/setup` um. Das erste Konto wird Administrator.
- **Weitere Konten** werden abgelehnt, solange `AUTH_ALLOW_SIGNUP` nicht `true` ist. Das gilt auch für die erste Anmeldung eines unbekannten Benutzers über GitHub, Google oder SSO.
- Alle Seiten außer `/api/health`, `/api/auth/*`, `/login`, `/signup` und `/setup` erfordern eine Anmeldung.
- Die Anmelde-Endpunkte haben eine Ratenbegrenzung (z. B. 10 Anmeldeversuche pro Minute und Adresse).
- Passkeys verwaltet jeder Benutzer auf der Seite **Konto** (Menü oben rechts).
- E-Mail-Bestätigung und Passwort-Zurücksetzen per Mail gibt es noch nicht (kein SMTP).

### Callback-URLs

Beim jeweiligen Anbieter als Redirect- bzw. Callback-URL eintragen (`<APP_URL>` ersetzen):

| Anbieter | Callback-URL |
|---|---|
| GitHub | `<APP_URL>/api/auth/callback/github` |
| Google | `<APP_URL>/api/auth/callback/google` |
| OIDC | `<APP_URL>/api/auth/callback/oidc` |

Beim OIDC-Anbieter einen vertraulichen Client (Authorization Code mit PKCE) mit den Scopes `openid email profile` anlegen.

## Fahrzeug-API

Die Zugangsdaten für den Fahrzeugdaten-Anbieter (Client ID und Client Secret) stehen nicht in der `.env`. Jeder Benutzer trägt seine eigenen auf der Seite **Konto → Fahrzeug-API** ein. Sie werden mit `ENCRYPTION_KEY` (AES-256-GCM) verschlüsselt gespeichert; das Secret wird nach dem Speichern nie wieder angezeigt. Siehe [Fahrzeugdaten](Fahrzeugdaten).

## Daten

Unter `/data` liegen die SQLite-Datenbank `ev-dashboard.db`, die erzeugten Schlüssel `auth-secret` und `encryption-key` sowie die Caddy-Zertifikate. Datenbank-Migrationen laufen beim Start automatisch. Für ein Backup den Container stoppen und das Verzeichnis sichern; die Schlüsseldateien gehören dazu.
