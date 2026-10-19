# Fahrzeugdaten

Das Dashboard liest Fahrzeugdaten über die offizielle, nur lesende Schnittstelle des Herstellers. Jeder Benutzer registriert dafür **eine eigene App** im Entwicklerportal des Anbieters und trägt deren Zugangsdaten im Dashboard auf der Kontoseite ein. Es werden keine Zugangsdaten mit dem Projekt geteilt.

Im Code heißt das Provider-Modul neutral `connect-query`.

## Fahrzeug verbinden

1. **App registrieren:** Im Entwicklerportal des Anbieters eine App für die persönliche Nutzung anlegen (alle Datenkategorien freigeben). Die Freischaltung kann einige Stunden dauern.
2. **Redirect-URI eintragen:** Die Kontoseite zeigt unter **Fahrzeuge** die Redirect-URI deiner Instanz mit einem Kopieren-Knopf an. Sie lautet
   `<APP_URL>/api/providers/connect-query/callback`
   und muss exakt so in der App beim Anbieter stehen. Die Instanz muss unter `APP_URL` aus dem Browser erreichbar sein.
3. **Zugangsdaten eintragen:** Client ID und Client Secret unter **Konto → Fahrzeug-API** speichern. Sie werden mit `ENCRYPTION_KEY` (AES-256-GCM) verschlüsselt gespeichert; das Secret wird nie wieder angezeigt.
4. **Verbinden:** Unter **Konto → Fahrzeuge** auf **Fahrzeug verbinden** klicken. Du wirst zur Anmeldeseite des Anbieters geleitet, meldest dich an und wählst das freizugebende Fahrzeug. Danach kehrst du zur Kontoseite zurück, und der erste Abruf läuft sofort.

Für mehrere Fahrzeuge verbindest du mehrmals: Jede Freigabe ist eine eigene Verbindung mit eigenem Token.

### Verbindungen verwalten

- **Status:** „Verbunden“ oder „Neu autorisieren“, dazu der Zeitpunkt des letzten erfolgreichen Abrufs und der letzte Fehler.
- **Jetzt abrufen:** holt sofort neue Daten (höchstens einmal pro Minute).
- **Details:** zeigt die neuesten Werte und die Rohdaten des letzten Abrufs je Endpunkt.
- **Trennen:** löscht nach einer Rückfrage die Tokens und alle gespeicherten Daten dieses Fahrzeugs. Die Freigabe beim Anbieter selbst widerrufst du dort.
- **Neu autorisieren:** Lässt sich das Token nicht mehr erneuern (abgelaufen, widerrufen, Zugangsdaten geändert oder gelöscht), wird die Verbindung nicht mehr abgefragt. Trenne sie und verbinde das Fahrzeug erneut.

Jeder Benutzer sieht nur seine eigenen Fahrzeuge.

## Abgerufene Daten

Bei jedem Abruf fragt das Dashboard drei Endpunkte ab: Garage (Fahrzeugstammdaten), Telemetrie und Warnmeldungen. Die Antworten werden **unverändert** gespeichert und zusätzlich, soweit erkennbar, in einheitliche Werte übersetzt (metrische Einheiten):

| Wert | Einheit |
|---|---|
| Position und Zeitpunkt der Ortung | Breiten-/Längengrad |
| Ladestand | % |
| Reichweite | km |
| Ladekabel eingesteckt, Ladestatus | |
| Restladezeit bis voll (nur beim Laden angezeigt) | min |
| Zündung an/aus | |
| Türschlösser verriegelt, Türen und Fenster geschlossen | |
| Kilometerstand | km |
| Außentemperatur | °C |
| 12-V-Batterie | V, % |
| Anzahl Warnmeldungen | |
| Zeitpunkt der Fahrzeugmeldung | |

Nicht jedes Modell liefert jeden Wert; fehlende Werte zeigt das Dashboard als „–“ an. Weitere Endpunkte (Wallbox, Abfahrtszeiten, Ladepläne, Ladehistorie) werden noch nicht abgefragt.

## Startseite

Die Startseite zeigt für das gewählte Fahrzeug zwei Module:

- **Standort:** Karte mit der Fahrzeugposition, die Straßenadresse und wann die Position ermittelt wurde. Die Adresse lässt sich abschalten, Kachel- und Adressdienst sind austauschbar (siehe [Konfiguration](Konfiguration)).
- **Reichweite:** Reichweite in km, Ladestand als Ring und der Ladestatus, beim Laden mit der Restzeit bis voll.

Sind Werte älter als das Dreifache von `POLL_INTERVAL_SECONDS` (mindestens 30 Minuten), werden sie als „veraltet“ markiert. Bei mehreren Fahrzeugen wählst du oben das Fahrzeug, „Alle Werte“ führt zur Detailseite.

## Abfrage und Aufbewahrung

- Ein Hintergrunddienst in der App fragt jede aktive Verbindung alle `POLL_INTERVAL_SECONDS` Sekunden ab (Standard 300, Minimum 60), mit etwas Zufallsstreuung.
- **Zu häufiges Abfragen kann das Fahrzeugkonto beim Anbieter sperren.** Den Standard nur ändern, wenn nötig.
- Bei Fehlern verlängert sich der Abstand für diese Verbindung schrittweise (bis 6 Stunden); eine Rate-Limit-Antwort des Anbieters wird beachtet.
- Das Zugriffstoken wird kurz vor Ablauf automatisch erneuert. Alle Tokens liegen verschlüsselt in der Datenbank und erreichen nie den Browser.
- Einheitliche Werte werden bei jedem Abruf gespeichert, Rohdaten je Endpunkt nur, wenn sie sich geändert haben. Das spart viel Speicher.
- Daten älter als `RETENTION_DAYS` Tage (Standard 365, `0` = unbegrenzt) werden einmal täglich gelöscht.

## Bekannte Unsicherheiten

- **Antwortformate nur teilweise bekannt:** Die Zuordnung der Telemetrie ist an einer echten Antwort eines Elektrofahrzeugs geprüft. Andere Modelle können andere Felder liefern; die Übersetzung bleibt deshalb tolerant und rät bei unbekannten Feldern anhand typischer Namen. Die Rohdaten auf der Detailseite zeigen, was dein Fahrzeug tatsächlich liefert.
- **Position oft älter:** Das Fahrzeug meldet die Position seltener als den Ladestand. Die Detailseite zeigt deshalb den Zeitpunkt der Ortung separat an.
- **Ladeleistung nicht übernommen:** Die Telemetrie enthält einen Wert zur Ladeleistung, dessen Einheit nicht eindeutig ist. Er bleibt in den Rohdaten, wird aber nicht übersetzt.
- **Mehrere Fahrzeuge in einer Freigabe:** Liefert die Garage mehrere Fahrzeuge, verwendet das Dashboard den Namen des ersten.

## Eigenschaften der Schnittstelle

- **Nur lesend:** Laden starten, Verriegeln usw. sind nicht möglich.
- **Ein Token je Freigabe:** Die Endpunkte enthalten keine Fahrzeug-ID; das Token gilt für das beim Consent gewählte Fahrzeug.
- **Polling statt Push:** Daten werden abgefragt, nicht vom Fahrzeug gesendet.
