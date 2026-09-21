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
