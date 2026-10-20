# App

## Installieren

Das Dashboard lässt sich wie eine App auf den Homescreen legen. Es startet dann ohne Browserleiste.

- **Android, Chrome und Edge am Desktop:** Auf der Startseite erscheint der Hinweis **Als App installieren**. **Nicht jetzt** blendet ihn auf diesem Gerät dauerhaft aus; installieren lässt sich die App dann weiterhin über das Browsermenü.
- **iPhone und iPad:** Safari bietet keinen Knopf dafür. Der Hinweis auf der Startseite erklärt den Weg: **Teilen** → **Zum Home-Bildschirm**.

Voraussetzung ist HTTPS, wie es das Image mit Caddy ohnehin einrichtet.

## Offline

Ohne Verbindung zeigt die App die Seiten, die zuletzt geladen wurden, und oben den Hinweis **Offline**. Seiten, die noch nie geöffnet wurden, führen zur Startseite. Gespeichert werden die Seiten nur im Browser des Geräts; beim Abmelden werden sie gelöscht.

## Benachrichtigungen

Unter **Konto → Benachrichtigungen** schaltet **Auf diesem Gerät aktivieren** Push-Nachrichten für den Browser oder die installierte App ein. Sie kommen auch, wenn die App geschlossen ist. Jedes Gerät wird einzeln eingeschaltet; die Liste zeigt alle Geräte des Kontos, andere lassen sich dort entfernen. **Testnachricht senden** prüft die Zustellung.

Die Auswahl gilt für alle Fahrzeuge des Kontos:

| Ereignis | Wann |
| --- | --- |
| Laden beendet | Der Ladevorgang ist zu Ende, mit Ladestand und Reichweite. |
| Laden unterbrochen | Der Ladevorgang endet mit eingestecktem Kabel oder mit einem Fehler. |
| Ladestand niedrig | Einmal, wenn der Ladestand unter die Schwelle (10, 20, 30 oder 40 %) fällt. |
| Warnung vom Fahrzeug | Eine neue Warnmeldung aus der Zustandsanzeige. |
| Nicht verriegelt | Das Fahrzeug steht seit 10 Minuten unverriegelt. Ab Werk aus. |
| Verbindung unterbrochen | Das Fahrzeug muss im Konto neu verbunden werden. |

Neue Werte kommen mit jedem Abruf (`POLL_INTERVAL_SECONDS`), eine Nachricht also mit entsprechender Verzögerung. Beim Abmelden wird das Gerät abgemeldet, damit die nächste Person dort keine Nachrichten dieses Kontos bekommt.

- **iPhone und iPad:** Push-Nachrichten gehen nur in der installierten App (ab iOS 16.4), nicht in Safari.
- **Blockiert:** Wurden Benachrichtigungen für die Seite abgelehnt, müssen sie in den Einstellungen des Browsers wieder erlaubt werden.

Die Nachrichten laufen über den Push-Dienst des jeweiligen Browsers (Google, Mozilla, Apple, Microsoft); andere Adressen nimmt der Server nicht an. Der Inhalt ist Ende-zu-Ende verschlüsselt. Der Server meldet sich bei den Diensten mit einem eigenen Schlüssel an, der beim ersten Start in `/data/push-key` erzeugt wird. Er gehört zur Sicherung des Datenverzeichnisses; geht er verloren, muss jedes Gerät die Benachrichtigungen neu einschalten.
