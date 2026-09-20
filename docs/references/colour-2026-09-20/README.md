# JobScout theme — v3

Two themes, N markets, one palette. Generated 2026-09-20.

> **Market sets the hero gradient. Theme sets everything else. They never touch.**

## Start here

`docs/THEME.md` is the single source of truth. If an implementation disagrees
with it, the implementation is wrong. Sections 10–15 are the recent work:

| § | |
|---|---|
| 0–9 | The two axes, the truth table, implementation, test cases, anti-patterns |
| 10 | Dark on a page that is mostly text — why it went flat |
| 11 | **The band ramp** — where every band colour comes from |
| 12 | Three structural fixes on the browse page |
| 13 | What landed on the live site, and what the tokens never reached |
| 14 | The halo |
| 15 | Modals and sheets |

## What's in here

```
css/
  theme-resolution.css   ← ship this. Every colour once, as light-dark().
  jobscout-theme.css     ← same palette as two blocks, for older browsers.
docs/
  THEME.md               ← the spec
  punch-list.md          ← earlier findings, superseded by THEME.md §13
demos/
  halo-demo.html         ← the halo, both themes. Flip data-theme on <html>.
  sheet-demo.html        ← the cover-letter sheet: as built, then fixed.
reference/
  jobscout-band-ramp.json  the OKLCH rungs + the four hues
  jobscout-theme.json      every token, split by theme, generated from the CSS
boards/
  Band-Ramp.png          how the four bands are built
  Light-Browse.png       the browse card, measured, before and after
  Dark-Longform.png      why a long dark page went flat
  Sheet.png              the modal, as built and fixed
  Tokens.png  Main.png  Markets.png  Web-Browse.png
  Canada-{Light,Dark}.png  Kenya-{Light,Dark}.png
```

## Three rules that cover most of it

1. **Hue is the only variable.** Every band rung fixes an OKLCH lightness and
   chroma; only the hue moves. Never pick a band colour by hand, never tint an
   existing one, never composite a dark fill from a light one. §11.
2. **Hue at control scale means a fit band.** Not a market, not a location tag,
   not a filter. Green on a button reads as AUTO whatever you meant. §12.2.
3. **Neither theme separates by brightness.** Dark separates by hue and
   hairline, light by hue and shadow. There isn't enough room at either end.
   §10.

## One trap worth knowing

`light-dark()` takes exactly two arguments. A multi-part value — two shadows,
a comma-separated font stack — contains a top-level comma, so `light-dark()`
sees three arguments and **silently drops the whole declaration**. The first
symptom is a missing shadow, not an error. `--shadow-card`, `--shadow-cta` and
`--shadow-sheet` all take real overrides for this reason. §15.
