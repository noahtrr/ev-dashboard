# Design philosophy

## Guiding idea

**A calm cockpit on a black stage** ("Bronze and Time"). The dashboard answers the questions you open it for in under two seconds: *Where is my car, and how far can I go?* Everything else is one level deeper.

## Principles

1. **Calm over clutter.** Few, large, unambiguous numbers and plenty of whitespace. Every element has to earn its place.
2. **Precision without noise.** Values with sensible precision, always with the time of the last update.
3. **Dark first.** Designed for dark surroundings, light mode maintained equally. Follows the system setting.
4. **Bronze and sapphire.** Bronze is the accent for interaction and the current vehicle state, sapphire blue marks charging and other cool states. Green, yellow and red only for real states.
5. **Thumb first.** Mobile layouts are the reference; desktop adds columns, not new concepts.
6. **Honest data.** Stale, estimated or missing values are marked as such.
7. **Visibly modular.** Each module is a card with title, main value, context and timestamp.
8. **Brand neutral.** No manufacturer names, logos or imitation of manufacturer design.

## Home screen

Top to bottom: **live location** (map, address, "updated … ago"), then **range** (large km value with state of charge in %). More modules follow below.

## Visual language

| | Dark | Light |
|---|---|---|
| Surface | `#000000` | `#F6F1EA` |
| Text | `#FFF6ED` | `#1C140D` |
| Accent (bronze) | `#D4A373` | `#8A5526` |
| Charging (sapphire) | `#7FB0E0` | `#2C5D8F` |

- Typefaces: Italiana for headings and large values, Outfit for everything else (values with tabular figures).
- Thin grid lines with slowly drifting dots in the background, hairlines instead of shadows, small radii, pill buttons.
- Small labels in spaced capitals.
- On sign-in and the home screen a slow bronze wave breathes in dark mode (WebGL, half resolution, about 30 frames per second). While the vehicle charges it shifts towards sapphire.
- Home and sign-in titles appear letter by letter. With `prefers-reduced-motion` the wave, dots and titles stand still.
- No custom cursor; scrollbars stay visible.
- Map: OpenStreetMap via MapLibre in a warm dark style, vehicle as a bronze dot.

## Scope

German and English (default follows the browser), metric units only, multiple vehicles per account.
