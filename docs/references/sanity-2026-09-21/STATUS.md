# Sanity suite (Chat, 2026-09-21) + GAPS.md — implemented on the site

Pack filed unmodified under `jobscout-design-v3/`. Run on its own markup with `--mutations`: 8 pass, 4 need the
site. The suite is now REPO-NATIVE, bound to the site's six surfaces (`tools/lib/routes.mjs`):

| check | repo file | source | mutations |
|---|---|---|---|
| tokens | `tokens/generate.mjs --check` | pack | hand-edit |
| lightdark | `tools/check_lightdark.mjs` (static, comments stripped) | GAPS #7 | three-args |
| scale / tiers / honesty | existing | pack | as before |
| score | `tools/check_score_device.mjs` | pack | bare-score |
| deadends | `tools/check_dead_ends.mjs` | pack | dead-end, system-blame |
| primary | `tools/check_one_primary.mjs` | pack | three-primaries, repeat-action |
| rose / motion | existing; motion gained press-equals-hover, slow-press, selected-as-action | pack + GAPS #6 | — |
| parallax | `tools/check_parallax.mjs` (mockup A–D, site A B D) | pack | flat, ignore-motion, shrink-link, bury-actions |
| ground | `tools/check_halo_ext.mjs` (pngjs; light halo is on the HUE axis by ruling, so rule B floors at the canvas's chroma and rule C accepts a chroma lift) | pack | section-bg, grey-blob, kill-halo |
| contrast | `tools/check_contrast.mjs` (ancestor walk; gradients and translucent chips sampled from pixels beside the text) | GAPS #1 | hero-ink |
| gaps | `tools/check_gaps.mjs` heading · twice · pill · fold · targets | GAPS #2 #3 #4 #5 #8 | split-title, repeat-org, double-code, push-below, tiny-target, no-focus |
| theme / palette | existing | — | — |

`node tools/sanity.mjs [--mutations] [--only …]`, or `SITE=https://jobscout.page …` for the live host.

## What the suite found, and the patches

- **The market chip was absent on saved / apply / privacy** (no switch on those routes) — `hsheet.js` now reads `html[data-market]` and draws its own flag.
- **The browse list began 913px down at 390** (60% of 844 is 506) — the two section headings and the lede hide at ≤620; the sticky sector chips carry the same information.
- **Targets under 44px** (mode tabs, sector chips, the select, remove, the hero chips, the filter input, save/apply buttons, the brand) — min sizes in base.css; **no visible focus** on the résumé box and the filter input (the pages' `outline:none`) — a global `:focus-visible` outline at higher specificity.
- **The date was a 16px-tall button** — tier 3 is context: it is a span now, its evidence in `title`.
- **The hero's brand stop** (`.dot`, indigo on the dark wash) measured 2.32:1 — `--hero-accent` is generated, the dark theme's accent as a constant like `--hero-ink`.
- **Parallax shipped** on the site card (`.job`, tokens `--tilt-max/--tilt-perspective/--z-*` generated) and the mockup card (the pack's `parallax.css` verbatim + a pointer press state the pack lacked: hover outranked press and dark counted two states). One real bug found by assertion D: a list that re-renders while scrolled past left cards pending at opacity 0 forever — `parallax.js` now marks passed-over cards in.

## Final serial run, 2026-09-21 (`node tools/sanity.mjs --mutations`)

16 checks, 0 failing; every mutation proven awake after the run (the last four were sharpened in place:
ember-quote plants a quotation, repeat-action plants its filled pair, press-equals-hover copies the measured
hover onto :active, kill-halo removes html's background-image with the page mark hidden for the sample).
Deployed to Pages production 09:46Z as build `4d6ac04+sanity` by local wrangler, no push.
