# Design-Philosophie

## Leitbild

**Ein ruhiges Cockpit.** Das Dashboard beantwortet in unter zwei Sekunden die Fragen, wegen derer man es öffnet: *Wo ist mein Auto, und wie weit komme ich?* Alles andere liegt eine Ebene tiefer.

## Prinzipien

1. **Ruhe vor Fülle.** Wenige, große, eindeutige Zahlen und viel Weißraum. Jede Anzeige muss sich ihren Platz verdienen.
2. **Präzision ohne Lärm.** Werte mit sinnvoller Genauigkeit, immer mit Zeitpunkt der letzten Aktualisierung.
3. **Dunkel zuerst.** Gestaltet für dunkle Umgebungen, Light-Mode gleichwertig. Folgt der Systemeinstellung.
4. **Kühles Licht als Akzent.** Blau/Cyan als einzige Akzentfarbe. Grün, Gelb und Rot nur für echte Zustände.
5. **Daumen zuerst.** Mobile Layouts sind die Referenz; Desktop ergänzt Spalten statt neuer Konzepte.
6. **Ehrliche Daten.** Veraltete, geschätzte oder fehlende Werte sind als solche gekennzeichnet.
7. **Modular sichtbar.** Jedes Modul ist eine Karte mit Titel, Hauptwert, Kontext und Zeitstempel.
8. **Markenneutral.** Kein Herstellername, kein Herstellerlogo, keine Anlehnung an Hersteller-Design.

## Startseite

Von oben nach unten: **Live-Standort** (Karte, Adresse, „zuletzt aktualisiert vor …“), dann **Reichweite** (große km-Zahl mit Ladestand in %). Weitere Module folgen darunter.

## Visuelle Sprache

| | Dunkel | Hell |
|---|---|---|
| Akzent | `#38BDF8` | `#0369A1` |

- Schrift: Geist, Werte in Geist Mono mit tabellarischen Ziffern.
- Abgerundete Karten, keine Schatten im Dark-Mode, feine Trennlinien.
- Bewegung nur funktional, `prefers-reduced-motion` wird respektiert.
- Karte: OpenStreetMap über MapLibre mit dunklem, entsättigtem Stil, Fahrzeug als Cyan-Punkt.

## Rahmen

Deutsch und Englisch (Standard folgt dem Browser), nur metrische Einheiten, mehrere Fahrzeuge pro Konto.
