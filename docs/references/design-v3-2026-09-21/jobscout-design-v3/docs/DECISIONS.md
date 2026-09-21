# Decisions this package needs, and decisions already made

## Needs a ruling

**D1 — the market hero is exempt from the large-surface rule.**
`check_scale.mjs` rule C fails any surface above 4,000pt² carrying chroma
above 0.03 at a hue outside 265–295. The Kenya hero is hue 147 at chroma
0.077 and would fail. Per the 2026-09-21 ruling ("Green is ok for KE") it is
**exempted by class name** in the check. That exemption is a hole: any future
element that gets the `.hero` class inherits it. *Recommended:* keep the
exemption, and have the check assert there is exactly **one** exempt element
per page. Say yes and I will add that assertion.

**D2 — two band values change by 1/255.**
The generator emits `--unsure-label` dark `#ecb078` (shipped `#ecaf78`) and
`--unsure-fill` light `#fbede2` (shipped `#fbede1`). The generated values are
the correct ones; the shipped values are rounding drift. Taking them means
`check_palette.py` needs its table updated once. *Recommended:* take the
generated values.

**D3 — the band thresholds.**
`js/band.js` carries `auto ≥ 80 · ping ≥ 69 · unsure ≥ 45`, derived from the
mockup's own data (87 AUTO, 70 PING, 68 UNSURE, 28 NEAR-MISS). Only the
PING/UNSURE boundary is pinned by that evidence. **Confirm against the scorer.**

**D4 — which prepare step leads.** *Proposal, not a correction.*
At NEAR-MISS or UNSURE the resume is the gap, so `Rebuild my resume` leads and
the letter waits; at PING or AUTO the letter leads. The three cards keep a
**fixed order** either way — a list that reorders itself is disorienting —
only the single filled button moves. One line in `js/band.js`:
`leadStep(band)`. If unwanted, the letter always leads and nothing else
changes.

**D5 — type and space snapping moves existing pixels.**
Eight sizes replace twenty and a 4px grid replaces seventeen values. Nothing
moves by more than 2px, and the rendered samples are in `stills/`. Worth one
look before it goes in.

---

## Already decided — do not re-open

- **The hero stays, and Kenya stays green.** Market-driven by design. Law 1's
  hue-147/AUTO overlap was raised and accepted. `check_halo_ext` rule A will
  flag the landing wash forever; that is the ruling, not a bug.
- **The 150px landing padding stays.**
- **The hero rebuild** — real-number headline, proof card, stat row — is
  rejected as marketing. No persuasion copy anywhere.
- **Lit dots = the band**, not the score.
- **The numeral is mono, tabular.** A serif numeral was tried and reversed.
- **The header rule:** landing keeps the two slide tabs at every width; every
  other route gets the flag chip + ⋯ at phone width.
- **ACTION is deep ink, never indigo.** Market → hero + market chip only;
  theme → the device; band → hue, exclusively.
- **Flags are SVG.** Windows draws emoji flags as two letters.

---

## Corrections this package makes to its own earlier guides

- **Law 7 was cited wrongly against the hero.** The hero is inset and
  contained — measured 27.3% of a 390×844 viewport, under rule A's 50%
  threshold. It is a large *surface*, not a second ground. The earlier claim
  that `check_halo_ext` would catch it was wrong.
- **The chroma-magnitude test was wrong.** It would have failed an ink panel
  at C 0.087 while the green panel sits at 0.077. Hue **membership** is the
  test.
- **`light-dark(var(--sunken), var(--evidence-bg))` in stage-1 `card.css` can
  go.** Dark `--sunken` is now `#2b284f` (1.225:1), so parity is real — and
  the workaround made tier 2 a near-peer of tier 1 on dark anyway (1.225 vs
  1.255). Geometry carries the hierarchy now, not fill.
