# JobScout theme — v3.1

Two themes, N markets, one palette. Generated 2026-09-20.

> **Market sets the hero gradient. Theme sets everything else. They never touch.**

## Read this first

One thing is **still undecided**: see `docs/THEME.md` §16. The tokens in here
ship **option A**; option C is written out and commented at the foot of both
CSS files, ready to uncomment. Nothing else is pending.

## docs/THEME.md — the source of truth

If an implementation disagrees with it, the implementation is wrong.

| § | |
|---|---|
| 0–9 | The two axes, truth table, implementation, test cases, anti-patterns |
| 10 | Dark on a page that is mostly text — why it went flat |
| 11 | **The band ramp** — where every band colour comes from |
| 12 | Three structural fixes on the browse page |
| 13 | What landed on the live site, and what the tokens never reached |
| 14 | The halo — plus a per-page audit of where it actually renders |
| 15 | Modals and sheets |
| 16 | **OPEN** — how much colour a large surface may carry |

## What's in here

```
css/
  theme-resolution.css   ← ship this. Every colour once, as light-dark().
  jobscout-theme.css     ← same palette as two blocks, for older browsers.
docs/
  THEME.md               ← the spec
  punch-list.md          ← earlier findings, superseded by §13
demos/
  halo-demo.html         ← the halo, both themes. Flip data-theme on <html>.
  sheet-demo.html        ← the cover-letter sheet: as built, then fixed.
reference/
  jobscout-band-ramp.json  the OKLCH rungs + the four hues
  jobscout-theme.json      every token by theme, generated from the CSS
boards/
  Band-Ramp.png          how the four bands are built
  Tint-At-Scale.png      §16 — the three options on dark
  Tint-Light.png         §16 — the same three on light, at true width
  Halo-Audit.png         where the halo actually renders, corner by corner
  Halo-Light.png  Halo-Dark.png   the halo as specified
  Light-Browse.png       the browse card, measured, before and after
  Dark-Longform.png      why a long dark page went flat
  Sheet.png              the modal, as built and fixed
  Tokens.png  Main.png  Markets.png  Web-Browse.png
  Canada-{Light,Dark}.png  Kenya-{Light,Dark}.png
```

## Four rules that cover most of it

1. **Hue is the only variable.** Every band rung fixes an OKLCH lightness and
   chroma; only the hue moves. Never pick a band colour by hand, never tint an
   existing one, never composite a dark fill from a light one. §11.
2. **Colour intensity is a budget spent over area.** A tinted fill is for
   pill-scale elements. Above roughly 4,000px² a surface is neutral and the
   band colour moves to a rule, a label or a small mark. §16 — this is the
   rule §11 was missing, and it is what made the evidence cards read as brown
   slabs on dark.
3. **Hue at control scale means a fit band.** Not a market, not a location tag,
   not a filter. Green on a button reads as AUTO whatever you meant. §12.2.
4. **Neither theme separates by brightness.** Dark separates by hue and
   hairline, light by hue and shadow. There isn't enough room at either end.
   §10.

## Two traps worth knowing

**`light-dark()` takes exactly two arguments.** A multi-part value — two
shadows, a font stack — contains a top-level comma, so it sees three arguments
and **silently drops the whole declaration**. The first symptom is a missing
shadow, not an error. `--shadow-card`, `--shadow-cta` and `--shadow-sheet` all
take real overrides for this reason. §15.

**A site-wide layer has to be site-wide.** The halo is one rule on
`body::before`. Measured per route, it renders on `/browse` and is entirely
absent on `/saved`, which also carries a 30×30px dot grid that is louder than
the halo it stands in for. §14.

## A correction worth keeping

§11 claimed the ramp's fixed-lightness-and-chroma construction is "how Apple's
system palette is built." That is wrong. Apple holds chroma roughly constant
near 0.20 and lets lightness vary by a third; this ramp's fills sit at
0.022–0.038, a tenth of Apple's chroma. The hue-63 measurement behind the
ember change is real and stands. The methodology claim on top of it does not.
§16 has the numbers.
