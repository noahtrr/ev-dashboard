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

## Deploy over SSH from GitHub Actions

As an alternative to the timer, GitHub Actions can deploy after every successful push to `main`. The `Deploy to production` job runs only once the image is built, scanned with Trivy and signed, and passes nothing but the image digest to the server over SSH. The server still verifies the signature itself, starts the image and reports an error when the container does not become `healthy`; the job then fails.

The SSH key cannot run anything else on the server: its `authorized_keys` entry forces `ev-dashboard-deploy`, which accepts only a digest (`sha256:` plus 64 hex characters).

On the server (after `install.sh`):

```sh
sudo systemctl disable --now ev-dashboard-update.timer   # otherwise the timer resets to latest
ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f ~/gh-deploy
printf 'restrict,command="/usr/local/bin/ev-dashboard-deploy" %s\n' "$(cat ~/gh-deploy.pub)" >> ~/.ssh/authorized_keys
printf '%s %s\n' ev.example.org "$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"   # value for DEPLOY_KNOWN_HOSTS (use your hostname)
cat ~/gh-deploy   # value for DEPLOY_SSH_KEY, then: rm ~/gh-deploy ~/gh-deploy.pub
```

In GitHub (repository settings):

| Where | Name | Value |
| --- | --- | --- |
| Environments → `production` → Secrets | `DEPLOY_SSH_KEY` | private key (`~/gh-deploy`) |
| Environments → `production` → Secrets | `DEPLOY_KNOWN_HOSTS` | host key line, e.g. `ev.example.org ssh-ed25519 AAAA…` |
| Secrets and variables → Actions → Variables | `DEPLOY_HOST` | server hostname |
| Secrets and variables → Actions → Variables | `DEPLOY_USER` | optional, default `deploy` |

Without `DEPLOY_HOST` the job is skipped. Under Environments → `production` → Deployment branches, allow only `main`.

## Updating

```sh
docker compose pull && docker compose up -d
```

Image tags: `latest` (latest release), `X.Y.Z` / `X.Y` / `X` (SemVer), `edge` (current `main`).

## Data

All data lives in `./data` (database, certificates). To back up, copy that folder while the container is stopped.
