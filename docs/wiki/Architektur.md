# Architektur

## Überblick

```
Browser ──HTTPS──► Caddy (TLS, HTTP/3, Security-Header, Kompression)   :8080 / :8443
                     │  reverse_proxy 127.0.0.1:3000
                     ▼
               SvelteKit-App (Node 22, adapter-node)
               ├─ UI (Svelte 5, MapLibre + OpenStreetMap)
               ├─ Auth (Better Auth: E-Mail+Passwort, Passkey, GitHub, Google, OIDC)   geplant
               ├─ Provider-Module für Fahrzeugdaten                                   geplant
               ├─ Poller (Hintergrundabfrage)                                         geplant
               └─ SQLite (Volume /data)                                               geplant
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

## Modularität

- **Provider-Module** kapseln einen Fahrzeugdaten-Anbieter hinter der Schnittstelle `VehicleProvider` (`authorizeUrl`, `exchangeCode`, `refresh`, `listVehicles`, `fetchSnapshot`). Weitere Anbieter lassen sich ergänzen, ohne den Kern zu ändern.
- **UI-Module** (Karte, Reichweite, Laden, Fahrten …) sind eigenständige Karten mit gleichem Aufbau und lassen sich ein- und ausblenden.

## Repository

```
apps/web/            SvelteKit-App
docker/              Dockerfile, s6-Dienste, Caddyfile
docs/wiki/           Quelle dieses Wikis
deploy/              automatischer Updater (systemd)
.github/workflows/   CI, CodeQL, Release, Wiki
```
