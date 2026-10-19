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

Optional aktualisiert sich der Server selbst: Ein systemd-Timer prüft alle 5 Minuten, ob es ein neues Release (`latest`) gibt, verifiziert dessen Cosign-Signatur gegen die Release-Pipeline dieses Repositorys und startet den Container nur dann neu. Der geprüfte Digest wird in `compose.override.yaml` festgeschrieben, damit nie ein ungeprüftes Image startet.

Voraussetzung: Der Benutzer, der den Timer ausführt (Standard `deploy`), ist in der Gruppe `docker` und darf in `/opt/ev-dashboard` schreiben.

```sh
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/deploy/install.sh
sudo sh install.sh deploy
systemctl list-timers ev-dashboard-update.timer
journalctl -u ev-dashboard-update.service -n 20
```

Vor dem ersten Release gibt es noch kein `latest`; bis dahin meldet der Dienst einen Fehler beim Abruf.

## Deploy per SSH aus GitHub Actions

Alternativ zum Timer kann GitHub Actions nach jedem erfolgreichen Push auf `main` deployen. Der Job `Deploy to production` läuft erst, wenn das Image gebaut, mit Trivy geprüft und signiert ist, und übergibt dem Server per SSH nur den Image-Digest. Der Server prüft die Signatur trotzdem selbst, startet das Image und meldet einen Fehler, wenn der Container nicht `healthy` wird. Der Job schlägt dann fehl.

Der SSH-Schlüssel kann auf dem Server nichts anderes ausführen: Der Eintrag in `authorized_keys` erzwingt `ev-dashboard-deploy`, das nur einen Digest (`sha256:` und 64 Hex-Zeichen) annimmt.

Auf dem Server (nach `install.sh`):

```sh
sudo systemctl disable --now ev-dashboard-update.timer   # sonst setzt der Timer auf latest zurück
ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f ~/gh-deploy
printf 'restrict,command="/usr/local/bin/ev-dashboard-deploy" %s\n' "$(cat ~/gh-deploy.pub)" >> ~/.ssh/authorized_keys
printf '%s %s\n' ev.example.org "$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"   # Wert für DEPLOY_KNOWN_HOSTS (eigenen Hostnamen einsetzen)
cat ~/gh-deploy   # Wert für DEPLOY_SSH_KEY, danach: rm ~/gh-deploy ~/gh-deploy.pub
```

In GitHub (Settings des Repositorys):

| Wo | Name | Wert |
| --- | --- | --- |
| Environments → `production` → Secrets | `DEPLOY_SSH_KEY` | privater Schlüssel (`~/gh-deploy`) |
| Environments → `production` → Secrets | `DEPLOY_KNOWN_HOSTS` | Host-Key-Zeile, z. B. `ev.example.org ssh-ed25519 AAAA…` |
| Secrets and variables → Actions → Variables | `DEPLOY_HOST` | Hostname des Servers |
| Secrets and variables → Actions → Variables | `DEPLOY_USER` | optional, Standard `deploy` |

Ohne `DEPLOY_HOST` wird der Job übersprungen. Unter Environments → `production` → Deployment branches sollte nur `main` erlaubt sein.

## Aktualisieren

```sh
docker compose pull && docker compose up -d
```

Image-Tags: `latest` (letztes Release), `X.Y.Z` / `X.Y` / `X` (SemVer), `edge` (Stand von `main`).

## Daten

Alle Daten liegen in `./data` (Datenbank, Zertifikate). Für ein Backup genügt eine Kopie dieses Ordners bei gestopptem Container.
