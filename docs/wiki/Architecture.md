# Architecture

## Overview

```
Browser ──HTTPS──► Caddy (TLS, HTTP/3, security headers, compression)   :8080 / :8443
                     │  reverse_proxy 127.0.0.1:3000
                     ▼
               SvelteKit app (Node 22, adapter-node)
               ├─ UI (Svelte 5, MapLibre + OpenStreetMap)
               ├─ Auth (Better Auth: email+password, passkey, GitHub, Google, OIDC)
               ├─ Vehicle data provider modules (connect-query)
               ├─ Poller (background fetching, snapshots)
               └─ Drizzle ORM ──► SQLite (node:sqlite, volume /data)
```

## Container

- Base: [Wolfi](https://github.com/wolfi-dev) (`cgr.dev/chainguard/wolfi-base`), very small with fast security updates.
- Supervision: [s6-overlay](https://github.com/just-containers/s6-overlay) starts three services:
  1. `init-config` (oneshot): validates `APP_URL` and `TLS_MODE` and derives the Caddy settings.
  2. `app`: the SvelteKit app, listening on `127.0.0.1:3000` only.
  3. `caddy`: reverse proxy on the unprivileged ports 8080 (HTTP) and 8443 (HTTPS).
- If a service fails permanently the container exits so Docker can restart it.
- Runs as user `app` (UID 10001) without Linux capabilities. Persistent data only under `/data`.
- Health check: `GET /api/health` returns `{"status":"ok","version":"…","uptimeSeconds":…}`.

## Data and authentication

- SQLite through Node's built-in `node:sqlite` (no native addon, so no ABI issues between build and runtime Node or amd64/arm64), accessed with Drizzle ORM (`drizzle-orm/sqlite-proxy`).
- Schema in `apps/web/src/lib/server/db/schema.ts`; migrations are generated with drizzle-kit and bundled into the build. They run automatically at startup.
- Better Auth uses the Drizzle adapter. The sign-up rule (first account = administrator, afterwards only with `AUTH_ALLOW_SIGNUP`) runs in a database hook for every new account, whatever the method.
- Caddy sets `X-Real-IP` (for rate limiting) and `X-Forwarded-Proto`/`-Host`, from which the app derives its public origin.

## Modularity

- **Provider modules** wrap a vehicle data provider behind the `VehicleProvider` interface (`authorizeUrl`, `exchangeCode`, `refresh`, `listVehicles`, `fetchSnapshot`). More providers can be added without touching the core.
  The first module, `connect-query`, lives in `apps/web/src/lib/server/providers/`. Connections (one per consent, tokens encrypted) and the in-process poller are in `apps/web/src/lib/server/vehicles/`; every fetch is stored in the `snapshot` table as normalized values; raw responses only when they changed since the previous fetch.
- **UI modules** (map, range, charging, trips …) are self-contained cards with the same structure and can be shown or hidden.

## Repository

```
apps/web/            SvelteKit app
docker/              Dockerfile, s6 services, Caddyfile
docs/wiki/           source of this wiki
deploy/              updater (systemd timer) and SSH deploy target
.github/workflows/   CI, CodeQL, release, wiki
```
