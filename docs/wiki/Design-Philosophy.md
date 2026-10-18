# Design philosophy

## Guiding idea

**A calm cockpit.** The dashboard answers the questions you open it for in under two seconds: *Where is my car, and how far can I go?* Everything else is one level deeper.

## Principles

1. **Calm over clutter.** Few, large, unambiguous numbers and plenty of whitespace. Every element has to earn its place.
2. **Precision without noise.** Values with sensible precision, always with the time of the last update.
3. **Dark first.** Designed for dark surroundings, light mode maintained equally. Follows the system setting.
4. **Cool light as accent.** Blue/cyan is the only accent colour. Green, yellow and red only for real states.
5. **Thumb first.** Mobile layouts are the reference; desktop adds columns, not new concepts.
6. **Honest data.** Stale, estimated or missing values are marked as such.
7. **Visibly modular.** Each module is a card with title, main value, context and timestamp.
8. **Brand neutral.** No manufacturer names, logos or imitation of manufacturer design.

## Home screen

Top to bottom: **live location** (map, address, "updated … ago"), then **range** (large km value with state of charge in %). More modules follow below.

## Visual language

| | Dark | Light |
|---|---|---|
| Accent | `#38BDF8` | `#0369A1` |

- Typeface: Geist, values in Geist Mono with tabular figures.
- Rounded cards, no shadows in dark mode, hairline separators.
- Motion only where it carries meaning; `prefers-reduced-motion` is respected.
- Map: OpenStreetMap via MapLibre in a dark, desaturated style, vehicle as a cyan dot.

## Scope

German and English (default follows the browser), metric units only, multiple vehicles per account.
