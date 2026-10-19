# Architektur

## Überblick

```
Browser ──HTTPS──► Caddy (TLS, HTTP/3, Security-Header, Kompression)   :8080 / :8443
                     │  reverse_proxy 127.0.0.1:3000
                     ▼
               SvelteKit-App (Node 24, adapter-node)
               ├─ UI (Svelte 5, MapLibre + OpenStreetMap)
               ├─ Auth (Better Auth: E-Mail+Passwort, Passkey, GitHub, Google, OIDC)
               ├─ Provider-Module für Fahrzeugdaten (connect-query)
               ├─ Poller (Hintergrundabfrage, Snapshots)
               └─ Drizzle ORM ──► SQLite (node:sqlite, Volume /data)
```

## Container

- Basis: [Wolfi](https://github.com/wolfi-dev) (`cgr.dev/chainguard/wolfi-base`), sehr klein und mit schnellen Sicherheitsupdates.
- Prozessüberwachung: [s6-overlay](https://github.com/just-containers/s6-overlay) startet drei Dienste:
  1. `init-config` (einmalig): prüft `APP_URL` und `TLS_MODE` und erzeugt daraus die Caddy-Einstellungen.
  2. `app`: die SvelteKit-App, lauscht nur auf `127.0.0.1:3000`.
  3. `caddy`: Reverse-Proxy auf den unprivilegierten Ports 8080 (HTTP) und 8443 (HTTPS).
- Fällt ein Dienst dauerhaft aus, beendet sich der Container, damit Docker ihn neu starten kann.
- Läuft als Benutzer `app` (UID 10001) ohne Linux-Capabilities. Persistente Daten nur unter `/data`.
- Healthcheck: `GET /api/health` liefert `{"status":"ok","version":"…","uptimeSeconds":…}`.

## Daten und Anmeldung

- SQLite über das in Node eingebaute `node:sqlite` (kein natives Addon, daher keine ABI-Probleme zwischen Build- und Laufzeit-Node oder amd64/arm64), angebunden über Drizzle ORM (`drizzle-orm/sqlite-proxy`).
- Schema in `apps/web/src/lib/server/db/schema.ts`, Migrationen mit drizzle-kit erzeugt und in den Build eingebettet. Sie laufen beim Start automatisch.
- Better Auth nutzt den Drizzle-Adapter. Die Anmelderegel (erstes Konto = Administrator, danach nur mit `AUTH_ALLOW_SIGNUP` oder einer Einladung) greift in einem Datenbank-Hook für jedes neue Konto, unabhängig von der Methode. Einladungen speichert die Tabelle `invitation` nur als SHA-256-Hash des Links; die Registrierung über eine Einladung läuft serverseitig, damit der Hook sie erkennt. Mails verschickt `nodemailer` über den Server aus `SMTP_*`.
- Caddy setzt `X-Real-IP` (für die Ratenbegrenzung) und `X-Forwarded-Proto`/`-Host`, aus denen die App ihre öffentliche Herkunft ableitet.

## Modularität

- **Provider-Module** kapseln einen Fahrzeugdaten-Anbieter hinter der Schnittstelle `VehicleProvider` (`authorizeUrl`, `exchangeCode`, `refresh`, `listVehicles`, `fetchSnapshot`). Weitere Anbieter lassen sich ergänzen, ohne den Kern zu ändern.
  Das erste Modul, `connect-query`, liegt in `apps/web/src/lib/server/providers/`. Verbindungen (eine je Freigabe, Tokens verschlüsselt) und der Poller im App-Prozess liegen in `apps/web/src/lib/server/vehicles/`; jeder Abruf landet in der Tabelle `snapshot` als einheitliche Werte; Rohantworten nur, wenn sie sich seit dem letzten Abruf geändert haben.
- **UI-Module** (Karte, Reichweite, Laden, Fahrten …) sind eigenständige Karten mit gleichem Aufbau und lassen sich ein- und ausblenden.

## Repository

```
apps/web/            SvelteKit-App
docker/              Dockerfile, s6-Dienste, Caddyfile
docs/wiki/           Quelle dieses Wikis
deploy/              Updater (systemd-Timer) und SSH-Deploy-Ziel
.github/workflows/   CI, CodeQL, Release, Wiki
```
