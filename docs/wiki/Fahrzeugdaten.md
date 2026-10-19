# Fahrzeugdaten

Das Dashboard liest Fahrzeugdaten über die offizielle, nur lesende Schnittstelle des Herstellers. Jeder Betreiber registriert dafür **eine eigene App** im Entwicklerportal des Anbieters und trägt deren Zugangsdaten im Dashboard auf der Kontoseite ein. Es werden keine Zugangsdaten mit dem Projekt geteilt.

## Ablauf

1. Im Entwicklerportal des Anbieters eine App anlegen (persönliche Nutzung) und als Redirect-URI eintragen:
   `https://<deine-domain>/api/providers/<provider>/callback`
2. Client-ID und Client-Secret im Dashboard unter **Konto → Fahrzeug-API** eintragen. Jeder Benutzer hinterlegt seine eigenen Zugangsdaten; sie werden mit `ENCRYPTION_KEY` (AES-256-GCM) verschlüsselt gespeichert, und das Secret wird nach dem Speichern nie wieder angezeigt.
3. Im Dashboard „Fahrzeug verbinden“ wählen. Du wirst zur Anmeldeseite des Anbieters geleitet und wählst dort das freizugebende Fahrzeug.
4. Das Dashboard erhält ein Zugriffs- und ein Refresh-Token (OAuth 2.0 Authorization Code Flow). Beide werden verschlüsselt in der Datenbank gespeichert.
5. Ein Hintergrunddienst fragt die Daten in festen Abständen ab.

## Eigenschaften der Schnittstelle

- **Nur lesend:** Laden starten, Verriegeln usw. sind nicht möglich.
- **Ein Token je Fahrzeug:** Die Freigabe gilt für das beim Consent gewählte Fahrzeug. Mehrere Fahrzeuge bedeuten mehrere Verbindungen.
- **Polling statt Push:** Daten werden abgefragt, nicht vom Fahrzeug gesendet.
- **Verfügbare Bereiche:** Telemetrie (Standort, Ladestand, Reichweite, Kilometerstand, Reifendruck, Türen, Temperaturen …), Garage (Fahrzeugstammdaten), Warnmeldungen, Wallbox, Abfahrtszeiten, Ladepläne und Ladehistorie.
- Nicht jedes Modell liefert jeden Wert. Fehlende Werte zeigt das Dashboard als „nicht verfügbar“ an.

Details zu Endpunkten und Antwortformaten folgen mit dem Provider-Modul.
