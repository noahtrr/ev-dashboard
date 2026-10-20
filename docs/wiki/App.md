# App

## Installieren

Das Dashboard lässt sich wie eine App auf den Homescreen legen. Es startet dann ohne Browserleiste.

- **Android, Chrome und Edge am Desktop:** Auf der Startseite erscheint der Hinweis **Als App installieren**. **Nicht jetzt** blendet ihn auf diesem Gerät dauerhaft aus; installieren lässt sich die App dann weiterhin über das Browsermenü.
- **iPhone und iPad:** Safari bietet keinen Knopf dafür. Der Hinweis auf der Startseite erklärt den Weg: **Teilen** → **Zum Home-Bildschirm**.

Voraussetzung ist HTTPS, wie es das Image mit Caddy ohnehin einrichtet.

## Offline

Ohne Verbindung zeigt die App die Seiten, die zuletzt geladen wurden, und oben den Hinweis **Offline**. Seiten, die noch nie geöffnet wurden, führen zur Startseite. Gespeichert werden die Seiten nur im Browser des Geräts; beim Abmelden werden sie gelöscht.
