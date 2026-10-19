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
| `ENCRYPTION_KEY` | nein | erzeugt | Verschlüsselt die Fahrzeug-API-Zugangsdaten in der Datenbank, mindestens 32 Zeichen. Leer: wird in `/data/encryption-key` (0600) erzeugt. Nach einer Änderung sind gespeicherte Zugangsdaten und Fahrzeug-Tokens unlesbar: Zugangsdaten neu eingeben und Fahrzeuge neu verbinden. |
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
- **Einladungen:** Mit Mailversand kann ein Administrator auf der Seite **Konto** Adressen einladen. Der Link in der Mail ist 7 Tage gültig und erlaubt die Registrierung genau dieser Adresse, auch wenn `AUTH_ALLOW_SIGNUP` `false` ist. Die Adresse gilt damit als bestätigt.
- Alle Seiten außer `/api/health`, `/api/auth/*`, `/login`, `/signup`, `/setup`, `/forgot-password` und `/reset-password` erfordern eine Anmeldung.
- Die Anmelde-Endpunkte haben eine Ratenbegrenzung (z. B. 10 Anmeldeversuche pro Minute und Adresse).
- Passwörter brauchen mindestens 8 Zeichen.
- Meldet sich jemand über GitHub, Google oder SSO mit derselben E-Mail an wie ein bestehendes Konto, wird die Anmeldung mit diesem Konto verknüpft. Voraussetzung: Der Anbieter meldet die E-Mail als bestätigt. So lässt sich ein Konto auf mehreren Wegen nutzen, ohne dass Fremde mit einer unbestätigten Adresse hineinkommen.
- Passkeys verwaltet jeder Benutzer auf der Seite **Konto** (Menü oben rechts).
- E-Mail-Bestätigung, Passwort-Zurücksetzen und Einladungen brauchen den Mailversand, siehe [E-Mail](#e-mail). E-Mail-Adresse und Passwort ändert jeder Benutzer auf der Seite **Konto**.

### Callback-URLs

Beim jeweiligen Anbieter als Redirect- bzw. Callback-URL eintragen (`<APP_URL>` ersetzen):

| Anbieter | Callback-URL |
|---|---|
| GitHub | `<APP_URL>/api/auth/callback/github` |
| Google | `<APP_URL>/api/auth/callback/google` |
| OIDC | `<APP_URL>/api/auth/callback/oidc` |

Beim OIDC-Anbieter einen vertraulichen Client (Authorization Code mit PKCE) mit den Scopes `openid email profile` anlegen.

## E-Mail

Ohne `SMTP_HOST` verschickt die App keine Mails: Konten brauchen keine Bestätigung, „Passwort vergessen?“ und Einladungen gibt es dann nicht. Mit einem Mailserver kommen hinzu:

- **Passwort vergessen?** auf der Anmeldeseite schickt einen Link (eine Stunde gültig). Nach dem Zurücksetzen werden alle Sitzungen des Kontos beendet.
- **E-Mail-Bestätigung:** Neue Konten müssen ihre Adresse über einen Link (24 Stunden gültig) bestätigen, bevor sie sich anmelden können. Das erste Konto und eingeladene Adressen gelten als bestätigt. Konten, die vor dem Update auf diese Version bestanden, gelten ebenfalls als bestätigt.
- **E-Mail-Adresse ändern** auf der Seite **Konto**: Die neue Adresse wird erst nach Bestätigung über einen Link an sie übernommen.
- **Einladungen** und eine **Test-Mail** für Administratoren auf der Seite **Konto**.

Die Mails sind auf Deutsch oder Englisch, je nach Browsersprache bei der Anfrage. Kann eine Mail nicht verschickt werden, steht der Fehler im Log (`[mail] …`); die Seite verrät aus Sicherheitsgründen nicht, ob eine Adresse existiert.

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `SMTP_HOST` | nein | | Mailserver. Gesetzt: Mailversand aktiv. |
| `SMTP_PORT` | nein | `587` | Port des Mailservers. |
| `SMTP_SECURE` | nein | `true` bei Port 465 | `true`: TLS von Anfang an (meist Port 465). `false`: STARTTLS, falls der Server es anbietet (meist Port 587). |
| `SMTP_USER`, `SMTP_PASSWORD` | nein | | Zugangsdaten am Mailserver. Leer: ohne Anmeldung senden. |
| `SMTP_FROM` | mit `SMTP_HOST` | | Absender, z. B. `EV Dashboard <ev@example.com>`. Die App startet nicht, wenn `SMTP_HOST` ohne `SMTP_FROM` gesetzt ist. |

## Fahrzeug-API

Die Zugangsdaten für den Fahrzeugdaten-Anbieter (Client ID und Client Secret) stehen nicht in der `.env`. Jeder Benutzer trägt seine eigenen auf der Seite **Konto → Fahrzeug-API** ein und registriert in seiner App beim Anbieter die Redirect-URI `<APP_URL>/api/providers/connect-query/callback` (die Kontoseite zeigt sie an). Die Zugangsdaten und die Fahrzeug-Tokens werden mit `ENCRYPTION_KEY` (AES-256-GCM) verschlüsselt gespeichert. Siehe [Fahrzeugdaten](Fahrzeugdaten).

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `POLL_INTERVAL_SECONDS` | nein | `300` | Sekunden zwischen zwei Abrufen je verbundenem Fahrzeug, mindestens `60`. Zu häufiges Abfragen kann das Fahrzeugkonto beim Anbieter sperren. |
| `RETENTION_DAYS` | nein | `365` | Tage, die abgerufene Fahrzeugdaten aufbewahrt werden; ältere werden einmal täglich gelöscht. Das Fahrtenbuch bleibt erhalten. `0` = unbegrenzt. |

## Adresse

Die Startseite zeigt zur Fahrzeugposition die Straßenadresse. Dafür schickt der Server die Position an einen Nominatim-kompatiblen Dienst (Standard: der öffentliche Dienst von OpenStreetMap). Ergebnisse werden zwischengespeichert, und es geht höchstens eine Anfrage pro Sekunde raus. Mit `GEOCODING_ENABLED=false` verlässt die Position den Server nicht.

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `GEOCODING_ENABLED` | nein | `true` | Adresse zur Fahrzeugposition anzeigen. |
| `GEOCODING_URL` | nein | `https://nominatim.openstreetmap.org` | Basisadresse des Nominatim-kompatiblen Dienstes, z. B. einer eigenen Instanz. |

## Karte

Der Browser lädt die Kartenkacheln direkt vom Kachelserver. Dieser erfährt dabei, welcher Kartenausschnitt angezeigt wird, also ungefähr, wo das Fahrzeug steht. Standard ist [OpenFreeMap](https://openfreemap.org) (kostenlos, ohne Schlüssel). Jeder Server mit Vektorkacheln im OpenMapTiles-Schema funktioniert, auch ein selbst betriebener.

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `MAP_TILES_URL` | nein | `https://tiles.openfreemap.org/planet` | TileJSON-Adresse der Vektorkacheln. |
| `MAP_GLYPHS_URL` | nein | `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` | Adressvorlage für die Schriften der Kartenbeschriftung. |

## Daten

Unter `/data` liegen die SQLite-Datenbank `ev-dashboard.db`, die erzeugten Schlüssel `auth-secret` und `encryption-key` sowie die Caddy-Zertifikate. Datenbank-Migrationen laufen beim Start automatisch. Für ein Backup den Container stoppen und das Verzeichnis sichern; die Schlüsseldateien gehören dazu.
