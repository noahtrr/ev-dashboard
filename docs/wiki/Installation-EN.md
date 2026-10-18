# Installation

## Requirements

- A server with Docker and Docker Compose (amd64 or arm64).
- A domain whose A/AAAA record points to the server.
- Ports 80 and 443 available (TCP, plus 443/UDP for HTTP/3).

## Steps

```sh
mkdir -p /opt/ev-dashboard && cd /opt/ev-dashboard
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/.env.example
mkdir data && sudo chown 10001:10001 data   # the container runs as UID 10001
nano .env                                   # set APP_URL, ACME_EMAIL and so on
docker compose up -d
```

The app is then served at `APP_URL`. Caddy obtains the certificate automatically on first start.

Check:

```sh
docker compose ps        # status "healthy"
docker compose logs -f
curl https://<your-domain>/api/health
```

## Behind your own reverse proxy

Set `TLS_MODE=off`. The container then serves plain HTTP on port 8080; point your proxy there and adjust `TRUSTED_PROXIES`.

## Automatic updates

Optionally the server updates itself: a systemd timer checks every 5 minutes for a new release (`latest`), verifies its Cosign signature against this repository's release pipeline and only then restarts the container. The verified digest is pinned in `compose.override.yaml` so an unverified image never starts.

Requirement: the user running the timer (default `deploy`) is in the `docker` group and can write to `/opt/ev-dashboard`.

```sh
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/deploy/install.sh
sudo sh install.sh deploy
systemctl list-timers ev-dashboard-update.timer
journalctl -u ev-dashboard-update.service -n 20
```

Before the first release there is no `latest` yet; until then the service reports a pull error.

## Updating

```sh
docker compose pull && docker compose up -d
```

Image tags: `latest` (latest release), `X.Y.Z` / `X.Y` / `X` (SemVer), `edge` (current `main`).

## Data

All data lives in `./data` (database, certificates). To back up, copy that folder while the container is stopped.
