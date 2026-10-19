# Deployment

Es gibt zwei Wege, eine Instanz automatisch aktuell zu halten. Beide starten nur Images, deren Cosign-Signatur aus der Release-Pipeline dieses Repositorys stammt, und schreiben den geprüften Digest in `compose.override.yaml`, damit nie ein ungeprüftes Image läuft.

|                        | Timer (Pull)                             | SSH aus GitHub Actions (Push)                                |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Auslöser               | alle 5 Minuten, neues Release (`latest`) | jeder erfolgreiche Push auf `main`                           |
| Zugangsdaten in GitHub | keine                                    | eingeschränkter SSH-Schlüssel                                |
| Für wen                | alle, die das offizielle Image nutzen    | wer die Pipeline selbst betreibt (dieses Repo oder ein Fork) |
| Fehlermeldung          | im Journal des Servers                   | roter Job in GitHub Actions                                  |

Nutze immer nur einen der beiden Wege. Läuft der Timer neben dem SSH-Deploy, setzt er alle 5 Minuten auf das letzte Release zurück.

## Dateien in `deploy/`

| Datei                                    | Zweck                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `install.sh`                             | installiert Skripte und systemd-Units, aktiviert den Timer                                               |
| `ev-dashboard-update`                    | zieht ein Image, prüft die Signatur, pinnt den Digest, startet neu und wartet bis zu 120 s auf `healthy` |
| `ev-dashboard-deploy`                    | Ziel des SSH-Schlüssels (forced command), nimmt nur einen Digest an                                      |
| `ev-dashboard-update.service` / `.timer` | systemd-Dienst und Timer (alle 5 Minuten)                                                                |

## Voraussetzungen

- Installation nach [Installation](Installation) in `/opt/ev-dashboard` (mit `compose.yaml` und `.env`).
- Ein Benutzer (Standard `deploy`), der in der Gruppe `docker` ist und in `/opt/ev-dashboard` schreiben darf.

```sh
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/deploy/install.sh
sudo sh install.sh deploy
```

`install.sh` lädt die Dateien aus `deploy/` (Branch per `EV_REF`, Standard `main`), installiert sie nach `/usr/local/bin` und `/etc/systemd/system` und aktiviert den Timer. Erneut ausführen, um die Skripte zu aktualisieren.

## Weg 1: Timer

Nach `install.sh` ist nichts weiter zu tun.

```sh
systemctl list-timers ev-dashboard-update.timer
journalctl -u ev-dashboard-update.service -n 20 --no-pager
```

Bei einem neuen Release steht im Journal `deployed ghcr.io/…@sha256:…`. Vor dem ersten Release gibt es noch kein `latest`; bis dahin meldet der Dienst einen Fehler beim Abruf.

## Weg 2: SSH aus GitHub Actions

### So funktioniert es

1. Ein Push landet auf `main`.
2. Der Workflow **Release** baut das Image, prüft es mit Trivy und signiert es mit Cosign. Schlägt etwas fehl, wird nichts deployt.
3. Der Job **Deploy to production** verbindet sich per SSH und schickt nur den Image-Digest (`sha256:…`).
4. Der SSH-Schlüssel darf auf dem Server nur `ev-dashboard-deploy` starten. Das prüft, dass genau ein Digest ankam, und ruft `ev-dashboard-update` auf.
5. `ev-dashboard-update` zieht genau dieses Image, prüft die Signatur, startet den Container und wartet auf `healthy`. Wird er nicht healthy, schlägt der Job fehl und das Log zeigt den Grund.

Warum so eingeschränkt: Wer in der Gruppe `docker` ist, hat praktisch Root-Rechte. Ein gewöhnlicher Schlüssel in GitHub wäre damit ein Generalschlüssel für den Server. Mit `restrict,command=…` kann ein gestohlener Schlüssel nur ein signiertes Image deployen, keine Shell öffnen und nichts weiterleiten.

### Schritt 1: Skripte installieren und Timer abschalten

```sh
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/deploy/install.sh
sudo sh install.sh deploy
sudo systemctl disable --now ev-dashboard-update.timer
systemctl list-timers ev-dashboard-update.timer   # erwartet: 0 timers listed
```

### Schritt 2: Deploy-Schlüssel erzeugen und freischalten

Als Deploy-Benutzer auf dem Server:

```sh
ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f ~/gh-deploy
printf 'restrict,command="/usr/local/bin/ev-dashboard-deploy" %s\n' "$(cat ~/gh-deploy.pub)" >> ~/.ssh/authorized_keys
tail -n 1 ~/.ssh/authorized_keys
```

Der Schlüssel hat keine Passphrase, weil GitHub keine eingeben kann; er ist nur für diesen Zweck da. Die letzte Zeile muss mit `restrict,command="/usr/local/bin/ev-dashboard-deploy" ssh-ed25519` beginnen.

Bei einem Fork (eigenes Image, eigene Signatur) Image und Signatur-Identität vor den Befehl setzen:

```text
restrict,command="EV_IMAGE=ghcr.io/<owner>/ev-dashboard:edge EV_IDENTITY='^https://github[.]com/<owner>/ev-dashboard/[.]github/workflows/release[.]yml@refs/heads/main$' /usr/local/bin/ev-dashboard-deploy" ssh-ed25519 AAAA… github-actions-deploy
```

### Schritt 3: Werte für GitHub ausgeben

```sh
printf '%s %s\n' ev.example.org "$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
cat ~/gh-deploy
```

- Erste Ausgabe: der **Host-Key** (eigenen Hostnamen statt `ev.example.org` einsetzen). Damit prüft GitHub, dass es mit deinem Server spricht. Er kommt direkt vom Server und ist deshalb vertrauenswürdig, anders als ein `ssh-keyscan` übers Netz.
- Zweite Ausgabe: der **private Schlüssel**, von `-----BEGIN OPENSSH PRIVATE KEY-----` bis `-----END OPENSSH PRIVATE KEY-----`.

Beides nirgends posten, nur in GitHub eintragen.

### Schritt 4: In GitHub eintragen

Im Repository unter **Settings**:

1. **Environments → New environment** `production`.
2. **Deployment branches and tags** → _Selected branches and tags_ → Regel `main`. Nur Läufe auf `main` kommen an die Schlüssel.
3. **Environment secrets**:
   - `DEPLOY_SSH_KEY`: privater Schlüssel aus Schritt 3
   - `DEPLOY_KNOWN_HOSTS`: Host-Key-Zeile aus Schritt 3
4. **Secrets and variables → Actions → Variables**:
   - `DEPLOY_HOST`: Hostname des Servers
   - `DEPLOY_USER`: optional, Standard `deploy`

Ohne `DEPLOY_HOST` wird der Deploy-Job übersprungen.

### Schritt 5: Privaten Schlüssel auf dem Server löschen

```sh
rm ~/gh-deploy ~/gh-deploy.pub
```

### Schritt 6: Testen

**Actions → Release** → letzten Lauf auf `main` → **Re-run all jobs**. Der Job **Deploy to production** endet mit `deployed …@sha256:…` oder `already running …`. Auf dem Server zeigt `docker ps --format '{{.Names}}  {{.Status}}'` dann `(healthy)`.

## Wechseln und Zurücksetzen

Von SSH zurück zum Timer:

```sh
sudo systemctl enable --now ev-dashboard-update.timer
```

Danach `DEPLOY_HOST` in GitHub löschen und die Zeile `github-actions-deploy` aus `~/.ssh/authorized_keys` entfernen.

Auf eine bestimmte Version zurück: `sudo -u deploy /usr/local/bin/ev-dashboard-update sha256:<digest>` (nur signierte Images dieses Repositorys werden akzeptiert). Bei aktivem SSH-Deploy überschreibt der nächste Push auf `main` diesen Stand.

## Fehlersuche

| Meldung                                        | Ursache und Lösung                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Host key verification failed`                 | `DEPLOY_KNOWN_HOSTS` passt nicht zu `DEPLOY_HOST`. Hostname in der Zeile prüfen, Schritt 3 wiederholen.                           |
| `Permission denied (publickey)`                | Schlüssel fehlt in `authorized_keys` oder `DEPLOY_SSH_KEY` ist unvollständig (BEGIN/END-Zeilen mitkopieren).                      |
| `expected an image digest`                     | Etwas anderes als ein Digest wurde gesendet. Der Workflow ist verändert oder jemand testet den Schlüssel von Hand.                |
| `no matching signatures` / Fehler bei `verify` | Image nicht aus der Pipeline dieses Repositorys signiert. Bei einem Fork `EV_IMAGE`/`EV_IDENTITY` setzen (Schritt 2).             |
| `container not healthy after 120s`             | Die neue Version startet nicht sauber. Die Health-Ausgabe steht im Job-Log; `docker logs ev-dashboard` auf dem Server zeigt mehr. |
| Server springt auf ein älteres Release zurück  | Der Timer läuft noch. Schritt 1 (Timer abschalten) wiederholen.                                                                   |
