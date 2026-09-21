# v3 pack — verification and status (2026-09-21)

Pack: `jobscout-design-v3/` (Chat's design-system v3: the token generator + type/space/elevation
brought up to the colour/motion/rose standard). Filed unmodified.

## Verified here (repo root, real runs)

| claim | result |
|---|---|
| `generate.mjs --check` exits 0 clean, 1 after a one-character edit | **true** (edited `--t2`, exit 1; restored, exit 0) |
| regenerating rewrites tokens.css / Tokens.kt / Tokens.swift byte-identical | **true** (no diff) |
| check_scale · check_tiers · check_honesty green on the pack's own markup | **true** (12 cells / 8 rows / 5 blocks) |
| all nine mutations break their check | **true** — each reports "correctly broke N assertions"; an asleep check would exit 2 |
| Kotlin / Swift compile | **not verified** — Chat says so too; no toolchain used here either |

## D3 — answered from the code (relay to Chat)

The thresholds are **auto ≥ 80 · ping ≥ 70 · unsure ≥ 55 · near-miss < 55**, on every surface:
`site/index.html` FIT_FLOOR = 55, `worker/src/index.js` FIT_FLOOR = 55 (drafting refuses below it),
`mockups/mobile.html` bandOf, iOS `RoseView.swift` litFor, Android Rose.kt litFor.
Chat's `js/band.js` carries 80 / **69** / **45** — the two inferred boundaries are wrong. Also: the scorer
emits `fit` only; the band is derived on every client today, so band.js becoming the ONE place is a
change in fact, not a description of the present.

## Rulings still Ken's

- **D1** hero exemption by class, plus "exactly one exempt element per page" — recommend yes.
- **D2** take the two generated band values (1/255) and update `check_palette.py` once — recommend yes.
- **D4** band-dependent prepare lead (resume leads at UNSURE/NEAR-MISS) — a product call; the copy
  "At 28, the resume is the gap — not the letter" leads with a lack on the prepare screen.
- **D5** type 20 → 8 sizes, space → 4px grid: moves live pixels by ≤2px on every route.

## What implementing it means

Stages 1–6 replace `site/base.css`'s root block and the mockup's CSS with the generated tokens + the
three v3 sheets, and re-cut seven screens' markup (browse, detail, prepare, prepare-done, saved, sheet,
states) — the whole live site's type and spacing change. Stages 7–8 hand the apps unproven Kotlin/Swift.
Not started: waiting on the rulings and the go.

---

# Revision 1 (same day) — verified

Chat's reply to the D3 finding. Replaced the pack in place (17 files changed + `tools/derive_thresholds.mjs`).

| claim | result |
|---|---|
| thresholds moved into `tokens.json` (80/70/55) and generated into `--threshold-*`, Kotlin, Swift | **true** (tokens.css lines 83–85; the native objects carry the same three) |
| `band.js` reads the generated custom properties at runtime, falls back to the same table | **true**; `reconcile()` present and deliberately unwired |
| `generate.mjs --check` still 0 clean / 1 edited | **true** (edited `--threshold-ping`, exit 1; restored, 0) |
| three checks green | **true** (12 cells / 8 rows / **12** evidence blocks — screen copy now checked) |
| eleven mutations all break their check | **true** — every one reports "correctly broke N"; none asleep |
| D4 copy no longer leads with a lack | **true**: "Aiming the resume first is worth more here than the letter." |
| D1 exemption + "exactly one exempt element" (`second-hero` mutation) | **true** (broke 4) |
| D2 generated band values taken | **true** |

Still open: **D5 only** (type 20 → 8, space → 4px grid, ≤2px moves on every route) — Ken's look-and-decide.
Implementation (Stages 1–8) remains not started pending D5 and the go.


---

# Implemented (D5 = YES, Ken 2026-09-21)

All nine stages, on the site, the mockup and both apps, in the local commits of 2026-09-21:

| stage | done | where |
|---|---|---|
| 0 generator | `tokens/` in the repo; outputs into `site/`, `android/.../design/`, `ios/Sources/`; `--check` is the first deploy step | `tokens/`, `.github/workflows/deploy.yml` |
| 1 tokens into the web | `tokens.css` loads ahead of `base.css` on every page; base.css keeps only aliases; 878 values snapped (type 47 → 13 steps incl. five desktop display steps, space → the 4px grid with 16 rungs); `check_scale` green on 12 cells + 4 mutations | `site/*.html`, `site/base.css`, `mockups/*` |
| 2 tiers | `.meta .tier1/2/3` in base.css (one rule set for site AND mockup); `check_tiers` green + 3 mutations | `site/base.css`, card templates |
| 3 band contract | `site/band.js` (reads `--threshold-*`), `rose.js` takes its table from it and throws on an unknown band; lit dots on the band SOLID; `check_rose` + `wrong-band` / `cropped-viewbox` | `site/band.js`, `site/rose.js`, the three pages, the mockup |
| 4 honesty | `site/evidence.js`; STRONGEST gated at render on the browse card, both lines on the apply page; the worker prompt anchors + caps (0/8 → 8/8 measured); `check_honesty` + 4 mutations | `site/evidence.js`, `worker/src/index.js` (deployed) |
| 5 screens | apply = the rose alone, the three tiers, one filled button, lead step, lede, the two evidence lines; saved rows = rose + APPLIED, no pill; the swept line copy unchanged (count only) | `site/apply.html`, `site/saved.html` |
| 6 sheet | navigation first, 56px rows with a chevron, selected ≠ primary; `check_motion` asserts it + `selected-as-action` | `site/hsheet.js`, `site/base.css`, `tools/check_motion.mjs` |
| 7 Android | `design/Tokens.kt` generated; `Motion`, `litFor`, `bandName`, `FIT_FLOOR` forward to it; `check_palette` 8/9 read tokens.json | **build-unproven here** (no local toolchain; Codemagic on the next push) |
| 8 iOS | `Tokens.swift` generated; `Motion`, `litFor`, `fitFloor` forward to it | **build-unproven here** |

Deviations from the pack, for Chat: the type series and the space grid are EXTENDED (same formulas, more
steps) for the desktop site; the product's band key stays `near-miss` (`JSBand.TOKEN` maps it to the
generated `nearmiss`); the apply page is detail + prepare in one so it takes surface `detail`; the
evidence anchors gained `profile|certif|degree|years` because the scorer says "the profile shows".
Résumé spelling swept across reader-facing strings the same day (Ken).
