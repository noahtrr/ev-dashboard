# Installation

## Voraussetzungen

- Ein Server mit Docker und Docker Compose (amd64 oder arm64).
- Eine Domain, deren A/AAAA-Eintrag auf den Server zeigt.
- Freie Ports 80 und 443 (TCP, 443 zusätzlich UDP für HTTP/3).

## Schritte

```sh
mkdir -p /opt/ev-dashboard && cd /opt/ev-dashboard
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/.env.example
mkdir data && sudo chown 10001:10001 data   # der Container läuft als UID 10001
nano .env                                   # APP_URL, ACME_EMAIL usw. setzen
docker compose up -d
```

Danach ist die App unter `APP_URL` erreichbar. Caddy holt das Zertifikat beim ersten Start automatisch.

Prüfen:

```sh
docker compose ps        # Status "healthy"
docker compose logs -f
curl https://<deine-domain>/api/health
```

## Hinter einem eigenen Reverse-Proxy

`TLS_MODE=off` setzen. Dann spricht der Container nur HTTP auf Port 8080; leite deinen Proxy dorthin und passe `TRUSTED_PROXIES` an.

## Automatische Updates

Die Instanz kann sich selbst aktuell halten, entweder per Timer auf dem Server (neue Releases) oder per SSH aus GitHub Actions (jeder Push auf `main`). Beide Wege prüfen die Cosign-Signatur, bevor ein Image startet. Anleitung: [Deployment](Deployment).

## Aktualisieren

```sh
docker compose pull && docker compose up -d
```

Image-Tags: `latest` (letztes Release), `X.Y.Z` / `X.Y` / `X` (SemVer), `edge` (Stand von `main`).

## Daten

Alle Daten liegen in `./data` (Datenbank, Zertifikate). Für ein Backup genügt eine Kopie dieses Ordners bei gestopptem Container.
