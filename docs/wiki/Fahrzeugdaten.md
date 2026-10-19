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
| Türschlösser verriegelt, Türen und Fenster geschlossen, je Tür und Fenster | |
| Motorhaube geschlossen | |
| Reifendruck je Rad, mit Sollwert und Status, falls gemeldet | bar |
| Kilometerstand | km |
| Außentemperatur | °C |
| 12-V-Batterie | V, % |
| Aktive Warnmeldungen mit Text, Dringlichkeit und Zeitpunkt | |
| Zeitpunkt der Fahrzeugmeldung | |

Nicht jedes Modell liefert jeden Wert; fehlende Werte zeigt das Dashboard als „–“ an. Weitere Endpunkte (Wallbox, Abfahrtszeiten, Ladepläne, Ladehistorie) werden noch nicht abgefragt.

## Startseite

Die Startseite zeigt für das gewählte Fahrzeug vier Module:

- **Standort:** Karte mit der Fahrzeugposition, die Straßenadresse und wann die Position ermittelt wurde. Die Adresse lässt sich abschalten, Kachel- und Adressdienst sind austauschbar (siehe [Konfiguration](Konfiguration)).
- **Reichweite:** Reichweite in km, Ladestand als Ring und der Ladestatus, beim Laden mit der Restzeit bis voll.
- **Laden:** die laufende oder letzte Ladung mit geladener Menge und Dauer. Von dort führt **Ladehistorie** zu einer Seite mit dem Ladestand-Verlauf (7, 30 oder 90 Tage, Ladezeiten hervorgehoben) und allen Ladungen des Zeitraums. Ein Klick auf eine Ladung öffnet ihre Detailseite: Ladeort mit Karte und Adresse, Beginn und Ende, Ladestand und Reichweite vorher und nachher, durchschnittliche Ladegeschwindigkeit und Ladeleistung, Kilometerstand, Außentemperatur, den Ladestatus des Fahrzeugs und den Verlauf während der Ladung. Angezeigt wird nur, was das Fahrzeug gemeldet hat.
- **Fahrten:** die laufende oder letzte Fahrt mit Strecke, Uhrzeit, Dauer und Verbrauch. Von dort führt **Fahrtenbuch** zu einer Seite mit der Strecke pro Tag (7, 30 oder 90 Tage), Summen für Fahrten, Strecke, Fahrzeit und Durchschnittsverbrauch sowie allen Fahrten des Zeitraums. Ein Klick auf eine Fahrt öffnet ihre Detailseite: Karte mit der Route, Start- und Zieladresse, Beginn und Ende, Strecke, Verbrauch, Ladestand, Reichweite und Kilometerstand vorher und nachher, Durchschnittsgeschwindigkeit und Außentemperatur.

Ladungen werden aus den gespeicherten Abrufen abgeleitet: Aufeinanderfolgende Abrufe mit dem Status „lädt“ bilden eine Ladung. Meldet das Fahrzeug keinen Ladestatus, zählt ein steigender Ladestand bei eingestecktem Kabel. Liegen zwischen zwei Abrufen mehr als das Dreifache von `POLL_INTERVAL_SECONDS` (mindestens 30 Minuten), beginnt eine neue Ladung. Die Schnittstelle meldet die Akkugröße nicht, daher wird die geladene Menge zunächst in Prozentpunkten angegeben. Trägst du auf der Detailseite des Fahrzeugs (Konto → Fahrzeug) unter **Akku** die nutzbare Kapazität ein (5 bis 250 kWh), zeigt das Dashboard die geladene Energie und die Ladeleistung in kWh bzw. kW. Diese Werte sind aus Prozentpunkten und Kapazität geschätzt; Ladeverluste sind nicht enthalten.

Fahrten werden ebenfalls aus den gespeicherten Abrufen abgeleitet: Zwischen zwei Abrufen ist das Fahrzeug gefahren, wenn die Zündung an ist, der Kilometerstand gestiegen ist oder (ohne Kilometerstand) sich die Position um mehr als 300 m geändert hat. Aufeinanderfolgende solche Abschnitte bilden eine Fahrt, vom letzten Abruf vor der Abfahrt bis zum ersten Abruf am Ziel. Beginn und Ende sind daher auf `POLL_INTERVAL_SECONDS` genau, und die Route verbindet nur die abgerufenen Positionen. Kürzere Bewegungen als 200 m zählen nicht. Die Strecke kommt aus dem Kilometerstand, sonst aus den Positionen. Den Verbrauch in kWh/100 km zeigt das Dashboard, sobald die nutzbare Kapazität eingetragen ist, sonst den verbrauchten Ladestand in Prozentpunkten.

### Fahrtenbuch und Export

Sobald das Fahrzeug nach einer Fahrt wieder steht, übernimmt die App die Fahrt ins Fahrtenbuch. Dort bleibt sie auch, wenn ältere Abrufe nach `RETENTION_DAYS` gelöscht werden. Start- und Zieladresse werden im Hintergrund nachgeschlagen, wenn `GEOCODING_ENABLED` aktiv ist.

- **Einordnen:** Auf der Seite einer Fahrt wählst du **Privat** oder **Geschäftlich** und kannst einen Zweck oder eine Notiz eintragen (bis 500 Zeichen). Die Fahrtenliste zeigt die Fahrtart jeder Fahrt, die Kilometer je Fahrtart und lässt sich nach Geschäftlich, Privat oder Offen filtern.
- **Export:** Über **Export** wählst du Zeitraum, Fahrten (alle, nur geschäftliche oder nur private) und Format. **Excel** enthält ein Blatt mit allen Fahrten und ein Blatt mit Summen je Fahrtart, **CSV** passt zu Buchhaltungsprogrammen (deutsch mit Semikolon und Dezimalkomma), **Text** ist eine lesbare Liste zum Ausdrucken. Datum und Uhrzeit folgen der Zeitzone deines Browsers.
- **Vorlagen:** Eigene Excel-Vorlagen lädst du auf der Export-Seite hoch (bis 2 MB, höchstens 10). Sie bleiben in der Datenbank deines Servers und gelangen nie ins Repository. Unterstützt wird derzeit eine Jahresabrechnung mit einer Zeile pro Monat: Die App trägt Abrechnungsbeginn und -ende, den Kilometerstand zu Beginn, je Monat den Kilometerstand am Monatsende, die privaten Kilometer und die Zahl der Tage mit geschäftlichen Fahrten ein. Alles Weitere, etwa Formeln und Felder für Name oder Unterschrift, bleibt unverändert. Monate, die noch nicht begonnen haben, bleiben leer. Liegt der Zeitraumbeginn vor der ersten Fahrt im Fahrtenbuch, gilt für diese Monate der erste bekannte Kilometerstand.

Das Fahrtenbuch ist eine Übersicht aus den Fahrzeugdaten und kein Fahrtenbuch im steuerlichen Sinn, da Einträge nachträglich geändert werden können.

### Verbrauch

Im Fahrten-Modul führt **Verbrauch** zu einer Auswertung über 30 Tage, 12 Monate oder den ganzen Zeitraum des Fahrtenbuchs:

- der durchschnittliche Verbrauch in kWh/100 km mit dem Vergleich zum gleich langen Zeitraum davor, dazu Strecke, Energie und die rechnerische Reichweite bei vollem Akku;
- ein Balkendiagramm pro Woche (30 Tage) bzw. pro Monat, mit dem Durchschnitt als gestrichelter Linie;
- der Verbrauch nach Außentemperatur (unter 0, 0–10, 10–20, über 20 °C) und nach Fahrtlänge (unter 10, 10–50, über 50 km).

Der Verbrauch jeder Fahrt ist aus dem Ladestand vor und nach der Fahrt und der nutzbaren Kapazität geschätzt; Durchschnitte sind nach Strecke gewichtet. Fahrten unter 1 km, Fahrten mit fehlenden Abrufen und Fahrten, bei denen der Ladestand gestiegen ist, zählen nicht. Gruppen unter 20 km werden nicht angezeigt, weil der Ladestand nur in ganzen Prozent gemeldet wird. Ohne eingetragene Kapazität zeigt die Seite Prozentpunkte des Akkus je 100 km. Die Außentemperatur einer Fahrt ist der Mittelwert der gemeldeten Werte und wird mit der Fahrt im Fahrtenbuch gespeichert; bei Fahrten, die vor dieser Funktion erfasst wurden, trägt die App sie nach, solange die Abrufe noch vorhanden sind. Wochen und Monate folgen der Zeitzone deines Browsers.

### Zustand

Das Zustands-Modul auf der Startseite zeigt eine Gesamtbewertung („Alles in Ordnung“ oder „2 Punkte prüfen“) und bis zu vier gemeldete Werte. **Zustand** führt zur Seite mit:

- dem Fahrzeug von oben: offene Türen, Fenster, Motorhaube und Heckklappe, das Schloss und, falls gemeldet, der Reifendruck an jedem Rad;
- einer Liste mit Verriegelung, Türen, Fenstern, Motorhaube und Reifendruck, bei Abweichungen mit der betroffenen Seite;
- der 12-V-Batterie mit dem tiefsten Wert je Stunde der letzten 14 Tage;
- dem Kilometerstand mit den Kilometern im laufenden Monat, seit 1. Januar und im Schnitt pro Tag (aus dem Fahrtenbuch);
- den aktiven Hinweisen und Warnmeldungen des Fahrzeugs.

Als prüfenswert gelten: entriegelt bei ausgeschalteter Zündung, eine offene Tür, ein offenes Fenster, eine offene Motorhaube, ein zu niedriger Reifendruck (laut Fahrzeug oder mehr als 20 % unter dem Sollwert), eine 12-V-Batterie unter 12,2 V im Ruhezustand sowie Warnmeldungen der Stufe „Warnung“ oder „Dringend“. Was dein Fahrzeug nicht meldet, blendet die Seite aus. Die getestete Schnittstelle liefert für Elektrofahrzeuge weder Reifendruck noch 12-V-Batterie oder Außentemperatur.

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
