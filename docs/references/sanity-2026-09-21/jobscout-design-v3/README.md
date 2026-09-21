# JobScout design system v3

A design language expressed as a **generator** rather than as a stylesheet.

## What this is

Six subsystems. Three of them — colour, motion, rose geometry — were already
algorithmic and had never been written down. Three — type, space, elevation —
were hand-tuned and had drifted to 20 type sizes, 17 spacing values and no
elevation constant.

v3 writes the generator down and brings the other three up to it. Nothing
about the rose, the band ramp, the market hues or the hero changes.

**The keystone measurement:** 14 numbers regenerate all 24 shipped band
colours — 22/24 byte-exact, 2 off by 1/255 rounding.

## Start here

1. `docs/DESIGN-ALGORITHM.md` — the derivations and the measurements
2. `docs/PRODUCT-LOGIC.md` — score→band, what a line may say, the state machine
3. `docs/DECISIONS.md` — five things that need your ruling
4. `BUILD-ORDER.md` — nine stages with accept blocks

## Layout

```
tokens/tokens.json      the single source of truth — every constant
tokens/generate.mjs     emits tokens.css + Tokens.kt + Tokens.swift
tokens/tokens.css       GENERATED — never hand-edit
css/base.css            ground, type, material ladder, primitives, tiers
css/components.css      rose, card, evidence, rows, sheet, heart, header
css/screens.css         hero, browse, detail, prepare, saved, states
js/band.js              score→band. The ONE place the thresholds live.
js/rose.js              law 9 geometry, generated; lighting; the arrival
js/evidence.js          the honesty law as code, not as intention
markup/*.html           seven complete surfaces
native/Tokens.kt|swift  GENERATED — build-unproven, see BUILD-ORDER stage 7
tools/check_scale.mjs   type on the scale, space on the grid, hue membership
tools/check_tiers.mjs   container weight is importance, measured as geometry
tools/check_honesty.mjs placement and content of every evidence line
tools/derive_thresholds.mjs  measures the band boundaries from a real feed
preview.html            all seven surfaces side by side
stills/                 rendered samples, both themes
```

## The sanity suite — start here

```
node sanity.mjs --url http://localhost:8761/markup/browse.html
node sanity.mjs --url <pack> --site-url https://jobscout.page   # everything
node sanity.mjs ... --mutations                                 # prove it is awake
```

Twelve checks, one verdict. Exit `3` means a check did not RUN — not that it
passed. `docs/SANITY.md` lists what each guards and the defect that motivated
it; **`docs/GAPS.md` lists the eight things it still does not watch**, which
are the only places worth a fine-tooth comb.

Current: **8 passing · 0 failing · 0 asleep · 4 skipped** (the four written
against the site's routes need `--site-url`).

## Run the individual pieces

```
node tokens/generate.mjs --check
python3 -m http.server 8761          # then, in another shell:
node tools/check_scale.mjs   --url http://localhost:8761/markup/browse.html
node tools/check_tiers.mjs   --url http://localhost:8761/markup/browse.html
node tools/check_honesty.mjs --url http://localhost:8761/markup/browse.html
```

All four green in this package. All **eleven** mutations break them:

```
--mutate off-scale-type | off-grid-space | band-wash | second-hero
--mutate fat-fact | boxed-date | pill-fact
--mutate gap-on-browse | persuasion | ember-quote | lede-lack
```

## Where the thresholds live

The scorer emits `fit` only and **every client derives the band**, so that
table was load-bearing in five places with nothing holding it together —
exactly the failure the band colours had before v3. It now lives in
`tokens.json` and generates into `--threshold-*`, `object Band` and
`enum JSBand`. Confirmed: `auto ≥ 80 · ping ≥ 70 · unsure ≥ 55`.

## Three things found while building this

- **The light hover measures 1.000:1** — no surface change at all. Not an
  oversight: `--surface` is `#ffffff`, the ceiling, so light carries elevation
  in shadow alone and dark carries it in lift. The asymmetry is the rule.
- **The hero's ink was `--canvas`**, which inverts to near-black on the fixed
  market wash in dark mode and loses the headline. The wash is dark in both
  themes, so its foreground is a constant. Caught in the v3 dark render, fixed
  as `--hero-ink`.
- **The honesty law only policed evidence blocks**, so the prepare screen's
  lede led with a lack for a whole draft and nothing looked at it. Screen copy
  is now checked too — and the check's own first run failed the weak-day
  paragraph for length, which was the rule being wrong rather than the copy.
  `lede` and `explanation` are separate kinds now.

## Corrections to earlier guides from this author

Listed at the foot of `docs/DECISIONS.md`. The short version: law 7 was cited
wrongly against the hero, and the chroma-magnitude test for large surfaces was
wrong — hue **membership** is the test.
