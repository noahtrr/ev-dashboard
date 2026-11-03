# Design-Philosophie

## Leitbild

**Ein ruhiges Cockpit auf schwarzer Bühne** („Bronze und Zeit“). Das Dashboard beantwortet in unter zwei Sekunden die Fragen, wegen derer man es öffnet: *Wo ist mein Auto, und wie weit komme ich?* Alles andere liegt eine Ebene tiefer.

## Prinzipien

1. **Ruhe vor Fülle.** Wenige, große, eindeutige Zahlen und viel Weißraum. Jede Anzeige muss sich ihren Platz verdienen.
2. **Präzision ohne Lärm.** Werte mit sinnvoller Genauigkeit, immer mit Zeitpunkt der letzten Aktualisierung.
3. **Dunkel zuerst.** Gestaltet für dunkle Umgebungen, Light-Mode gleichwertig. Folgt der Systemeinstellung.
4. **Bronze und Saphir.** Bronze als Akzent für Interaktion und den aktuellen Fahrzeugzustand, Saphirblau für Laden und kühle Zustände. Grün, Gelb und Rot nur für echte Zustände.
5. **Daumen zuerst.** Mobile Layouts sind die Referenz; Desktop ergänzt Spalten statt neuer Konzepte.
6. **Ehrliche Daten.** Veraltete, geschätzte oder fehlende Werte sind als solche gekennzeichnet.
7. **Modular sichtbar.** Jedes Modul ist eine Karte mit Titel, Hauptwert, Kontext und Zeitstempel.
8. **Markenneutral.** Kein Herstellername, kein Herstellerlogo, keine Anlehnung an Hersteller-Design.

## Startseite

Von oben nach unten: **Live-Standort** (Karte, Adresse, „zuletzt aktualisiert vor …“), dann **Reichweite** (große km-Zahl mit Ladestand in %). Weitere Module folgen darunter.

## Visuelle Sprache

| | Dunkel | Hell |
|---|---|---|
| Fläche | `#000000` | `#F6F1EA` |
| Text | `#FFF6ED` | `#1C140D` |
| Akzent (Bronze) | `#D4A373` | `#8A5526` |
| Laden (Saphir) | `#7FB0E0` | `#2C5D8F` |

- Schrift: Italiana für Überschriften und große Werte, Outfit für alles andere (Werte mit tabellarischen Ziffern).
- Feine Rasterlinien mit langsam wandernden Punkten im Hintergrund, Haarlinien statt Schatten, kleine Radien, Buttons als Pillen.
- Kleine Beschriftungen in Versalien mit Sperrung.
- Auf Anmelden und Startseite atmet im Dark-Mode eine langsame Bronzewelle (WebGL, halbe Auflösung, rund 30 Bilder pro Sekunde). Lädt das Fahrzeug, kippt sie Richtung Saphir.
- Titel der Startseite und der Anmeldung erscheinen Buchstabe für Buchstabe. Mit `prefers-reduced-motion` stehen Welle, Punkte und Titel still.
- Kein eigener Cursor, Scrollleisten bleiben sichtbar.
- Karte: OpenStreetMap über MapLibre mit warmem, dunklem Stil, Fahrzeug als Bronze-Punkt.

## Zwei Stile

Der oben beschriebene Bronze-Stil ist der Standard. Unter **Konto → Design** lässt sich pro Gerät der ursprüngliche **Cockpit**-Stil wählen: Fläche `#0A0E13`, Akzent `#38BDF8` (hell `#0369A1`), Geist und Geist Mono, abgerundete Karten, ohne Raster, Welle und Buchstaben-Animation, Karte kühl entsättigt mit Cyan-Punkt. Beide Stile teilen Aufbau und Inhalte. Sie unterscheiden sich nur in den Design-Tokens in `app.css` (`:root[data-style='cockpit']`). Icons und E-Mails nutzen immer Bronze.

## Rahmen

Deutsch und Englisch (Standard folgt dem Browser), nur metrische Einheiten, mehrere Fahrzeuge pro Konto.
