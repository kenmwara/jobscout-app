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
