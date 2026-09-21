# JobScout design system v3 — build order

One document to work from. Nine stages, each with an accept block that asserts
**behaviour**. A check that only asserts presence is rejected.

Read `docs/DESIGN-ALGORITHM.md` first — it is the reasoning, and the stages
below assume it. `docs/DECISIONS.md` lists the five things that need your
ruling before or during the build.

**The one-line summary:** three of the six subsystems were already generative
and had never been written down; three had drifted. v3 writes down the
generator and brings the other three up to it. Nothing about the rose, the
band ramp, the market hues or the hero changes.

---

## Stage 0 — the generator · blocks everything

**Files:** `tokens/tokens.json`, `tokens/generate.mjs`

```
node tokens/generate.mjs           # writes tokens.css, Tokens.kt, Tokens.swift
node tokens/generate.mjs --check   # CI: fails if any is hand-edited
```

Never hand-edit a generated file. Put `--check` in CI before anything else —
it is the only thing standing between three platforms and a slow divergence.

**Accept:** `--check` exits 0 on a clean tree and 1 after a one-character edit
to any of the three outputs.

---

## Stage 1 — tokens into the web · blocks 2–6

**Files:** `site/base.css` (replace its `:root` block), `mockups/*`

Drop `tokens/tokens.css` in ahead of everything, then `css/base.css`,
`css/components.css`, `css/screens.css` in that order.

Two band values change by 1/255 (`DECISIONS.md` D2) and `check_palette.py`
needs its table updated once.

**Accept:** `node tools/check_scale.mjs` green on all six routes × both
themes. **Mutations:** `off-scale-type`, `off-grid-space`, `band-wash` — all
three must fail the check.

> Running this the first time caught three real violations in this package's
> own CSS: `.tier1` at 10px padding, and the user-agent's 1px/6px button
> padding leaking through `.hero__go`, `.heart` and `.sheet__x`. Expect it to
> find more in `site/base.css`. That is the point.

---

## Stage 2 — the three tiers as geometry · after 1

**Files:** `css/base.css` (`.tier1/.tier2/.tier3`)

Fill cannot carry this hierarchy and never could: on light the verdict fill
sits 1.141:1 off the card and the fact fill 1.253:1, so **by fill alone the
fact wins.** Geometry settles it in both themes at once:

| | height | padding-x | radius | fill |
|---|---|---|---|---|
| tier 1 verdict | **22px** | **12px** | pill | band `-fill` |
| tier 2 fact | 19px | 8px | 4px | `--sunken` |
| tier 3 context | — | — | — | **none** |

**Accept:** `node tools/check_tiers.mjs`. **Mutations:** `fat-fact`,
`boxed-date`, `pill-fact`.

---

## Stage 3 — the rose and the band contract · after 1

**Files:** `js/rose.js`, `js/band.js`, replacing `site/rose.js`

The scorer emits `fit` only and **every client derives the band**, so the
threshold table is load-bearing in five places. It is now generated from
`tokens.json` into CSS, Kotlin and Swift; `band.js` reads the generated custom
properties at runtime. Confirmed values: `auto ≥ 80 · ping ≥ 70 · unsure ≥ 55`.

`reconcile()` exists and is **not wired up** — it is for the day the worker
emits a band of its own, so that becomes a one-line change.

`lightRose()` **throws** on an unknown band rather than drawing a plausible
wrong number. A rose that lies about the band is worse than no rose.

**Accept:** the existing `tools/check_rose.mjs`, unchanged, plus
`--mutate wrong-band` and `--mutate cropped-viewbox`. Additionally
`node tools/derive_thresholds.mjs <real feed>.json` exits 0 and reprints
`{ "auto": 80, "ping": 70, "unsure": 55 }` — or exits 1, which means the band
is not a pure function of `fit` and is a finding worth having.

---

## Stage 4 — the honesty layer · after 1

**Files:** `js/evidence.js`

`validate()` runs at render time. A line that fails is **not shown**. Placement
is a function (`allowedOn`) so it cannot be forgotten at a call site.

**Accept:** `node tools/check_honesty.mjs`. **Mutations:** `gap-on-browse`,
`persuasion`, `ember-quote`.

---

## Stage 5 — the screens · after 2–4

**Files:** `markup/*.html` → `site/index.html`, `site/apply.html`,
`site/saved.html`, `mockups/mobile.html`

Seven surfaces, all written: `browse`, `detail`, `prepare`, `prepare-done`,
`saved`, `sheet`, `states`. Each is complete markup on the generated tokens.

The two that have never had a design pass:

- **prepare** — the score came back as the rose (it shipped as the bare text
  "fit 28"), one filled button replaces three, card titles move to Newsreader,
  and a finished step demotes its own button so the single filled button is
  always the next move.
- **saved** — rows, not cards. The band lives on a saved row as the **rose**,
  not a pill: the row already has a verdict-shaped thing in it and two would
  compete. `APPLIED` is the only state word.

**Accept:** all four checks green on every route.

---

## Stage 6 — the sheet · after 5

**Files:** `css/components.css` (`.sheet`, `.row`, `.seg`), `site/hsheet.js`

**Selected is not primary.** The shipped menu painted "Kenya is selected" and
"Copy all" in the same `--action` fill — a state and an action rendered
identically. `--selected-bg/-edge/-fg` exist for exactly this and were unused.

Navigation first, settings second: a menu is opened to *go* somewhere. Rows
are 56px with a chevron and real states. `--scrim`, `--r-sheet`,
`--sh-sheet` and the dark edge all exist and were all unused.

**Accept:** on the open sheet, the computed `background-color` of any
`aria-pressed="true"` control differs from the sheet's primary button, and an
element covering the content behind has a non-transparent background.
**Mutation:** set the selected control's fill to `--action`.

---

## Stage 7 — Android · after 5

**Files:** `native/Tokens.kt` (generated), `native/Rose.kt`, `native/Card.kt`

Compose cannot consume `linear()`. **Do not eyeball an equivalent and do not
substitute Compose's named stiffness constants** — the durations stop matching
and the clients drift. `stiffness = ω²`, generated: snap **1218**, settle
**342**, arrive **146**.

Compose has no `:active`: use `interactionSource.collectIsPressedAsState()`
and animate scale on **exit** timing.

**Accept:** `check_palette.py` extended to assert the four durations and four
damping ratios match `tokens.json` within 1ms / 0.01; an emulator capture of a
scoring run shows the same lit-dot counts as web for the same fixture.

> **Not verified from here.** The Kotlin and Swift in this package are written
> from the same generator as the CSS but were never compiled — no toolchain in
> the authoring environment. Treat them as spec-accurate and build-unproven.

---

## Stage 8 — iOS · after 5

**Files:** `native/Tokens.swift` (generated), `native/RoseView.swift`,
`native/CardView.swift`

SwiftUI's `response` **is** the natural period, so it equals the CSS duration.

Sheets use an explicit `--surface`, **not `.regularMaterial`** — a system
material samples the hero gradient behind it, which would leak market colour
into a theme surface and break law 1.

**Accept:** six-corner sampling matches web's halo lift within ±0.02;
Instruments shows zero Core Animation commits in a 10s idle window; with Low
Power Mode on, the phase timer does not fire.

Same build-unproven caveat as Stage 7.

---

## Not in scope — decided, do not re-propose

- The hero rebuild (real-number headline, proof card, stat row) — rejected as
  marketing. No persuasion copy anywhere.
- Reducing the 150px landing padding.
- Deleting the hero panel, or moving Kenya off green.
- Changing the rose geometry, the display cut, or the band→lit table.
