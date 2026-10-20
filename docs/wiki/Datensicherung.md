# Datensicherung

Jedes Konto kann seine Daten selbst sichern und in diese oder eine andere Installation einspielen. Das ersetzt nicht die Sicherung des ganzen Servers (siehe [Konfiguration](Konfiguration)), hilft aber beim Umzug auf eine neue Installation oder ein neues Konto.

## Sicherung herunterladen

Unter **Konto → Datensicherung** zeigt die Karte, was in der Sicherung steckt, und **Sicherung herunterladen** lädt eine JSON-Datei (`ev-dashboard-sicherung-JJJJ-MM-TT.json`). Enthalten sind:

- Fahrzeuge mit Name, nutzbarer Akkukapazität, Zuhause und Ladeverlusten
- alle Fahrten im Fahrtenbuch mit Zweck und Notiz
- alle Ladevorgänge mit eingetragenem Preis oder Betrag
- Strompreise zu Hause und unterwegs
- hochgeladene Excel-Vorlagen
- Anordnung der Startseite und Auswahl der Benachrichtigungen

Nicht enthalten sind Passwort, Passkeys, die Zugangsdaten der Fahrzeug-API, die Freigaben beim Anbieter und die einzelnen Abrufe (Rohdaten). Die Datei enthält trotzdem persönliche Daten wie Orte und Fahrzeiten; bewahre sie entsprechend auf.

## Sicherung einspielen

**Sicherung einspielen → Datei auswählen** liest die Datei im Browser und zeigt, was übernommen würde. Für jedes Fahrzeug aus der Sicherung wählst du das Ziel:

- **Zu „…“ hinzufügen:** Ein vorhandenes Fahrzeug. Vorgeschlagen wird das Fahrzeug mit derselben Fahrzeugkennung oder demselben Namen.
- **Als neues Fahrzeug anlegen:** Das Fahrzeug wird ohne Verbindung zum Anbieter angelegt und zeigt **Neu autorisieren**.
- **Nicht übernehmen**

**Einspielen** überträgt die Daten in kleinen Teilen. Fahrten und Ladevorgänge, die es schon gibt (gleiches Fahrzeug, gleiche Startzeit), werden übersprungen; ebenso Strompreise mit gleichem Startdatum und gleiche Excel-Vorlagen. Einstellungen eines vorhandenen Fahrzeugs und des Kontos werden nur ergänzt, wo noch nichts eingetragen ist. Bricht das Einspielen ab, startest du es einfach noch einmal.

## Fahrzeug neu verbinden

Ein Fahrzeug, dessen Freigabe abgelaufen ist oder das aus einer Sicherung stammt, zeigt unter **Konto → Fahrzeuge** den Knopf **Neu verbinden**. Er führt wie beim ersten Verbinden zur Anmeldung beim Anbieter; danach gehört die neue Freigabe zu diesem Fahrzeug, und Fahrtenbuch, Ladevorgänge und Kosten bleiben erhalten. Dafür müssen die Zugangsdaten der Fahrzeug-API in diesem Konto gespeichert sein.
