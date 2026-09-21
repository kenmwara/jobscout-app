# Decisions this package needs, and decisions already made

## Answered 2026-09-21

**D1 — yes, and the assertion is in.** The `.hero` exemption stands by ruling,
and `check_scale.mjs` now counts exempt elements and fails when a page carries
more than one. Mutation: `--mutate second-hero`.

**D2 — yes, taken.** The generated `--unsure-label` dark `#ecb078` and
`--unsure-fill` light `#fbede2` are in. `check_palette.py` needs its table
updated once.

**D3 — answered from the code, and I had both inferred boundaries wrong.**
Confirmed: `auto ≥ 80 · ping ≥ 70 · unsure ≥ 55`. The draft carried 69 and 45.
Two separate errors:

- `ping`: the evidence (68 UNSURE, 70 PING) bounded it to `68 < x ≤ 70` and I
  took the midpoint. **A midpoint is a classifier, not a boundary.**
  `derive_thresholds.mjs` now reports the interval and **refuses to print a
  paste-ready table unless the observations pin it** — it exits 2 instead.
- `unsure`: no observation existed between 28 and 68. That was a guess and
  should have been labelled one.

**And the larger correction: the scorer emits `fit` ONLY.** Every client
derives the band. My previous `bandOf()` took "the scorer's band" as
authoritative and logged disagreement — describing a system that does not
exist. It was a proposal wearing a description's clothes.

What follows is the useful part: there are **five copies** of the threshold
table today and nothing holds them together, which is exactly the failure the
band *colours* had before v3. So the table moved into `tokens.json` and now
generates into `tokens.css` (`--threshold-*`), `Tokens.kt` (`object Band`) and
`Tokens.swift` (`enum JSBand`). Five copies, one source.
`js/band.js` reads the generated custom properties at runtime, so the web
client cannot hold a stale copy either. `reconcile()` is written and
deliberately **not wired up** — it is there for the day the worker emits a
band, so that move is a one-line change rather than a redesign.

**D4 — the copy was wrong and is fixed; the ordering is still yours to rule
on.** The objection was right: *"At 28, the resume is the gap"* leads with a
lack, which the law forbids on a card, and the law had simply never been
extended to screen copy. A rule that only polices the easy place is not a
rule. The lede is now **"Aiming the resume first is worth more here than the
letter."** — a comparison of two actions, claiming nothing about the reader's
document. `evidence.js` gained `validateLede()` and `check_honesty.mjs` now
checks lede and explanation copy, with `--mutate lede-lack`.

> That check's first run then failed the weak-day paragraph for length — and
> that paragraph is the best writing in the product. The 160-char cap was
> wrong, not the copy. `lede` and `explanation` are now separate kinds with
> separate limits and the same content law.

---

## Still needs a ruling

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

**D3 — ANSWERED above.** Left here for the trail.

**D3 (superseded) — the band thresholds.**

The first draft of this package called `js/band.js` "the one place score→band
lives" and made confirming the numbers a gate on Stage 3. That was wrong twice
over, and the way it was wrong is worth naming: **it would have made the UI a
second scorer.**

The scorer already emits a band. The UI's job is to display it. `bandOf(row)`
now takes the scorer's band as authoritative, falls back to the threshold
table only when a row arrives with a score and no band, and **logs a
disagreement rather than papering over it**. A wrong table therefore surfaces
as a logged mismatch on real data instead of as a wrong rose.

It also matters that the band may not be a pure function of the score at all.
The product's own evidence lines talk about a location rule passing, so a
posting can plausibly be demoted for a reason a number cannot carry. A UI that
re-derived the band from the score would silently overrule that.

To replace the guesses with measurements, run:

```
node tools/derive_thresholds.mjs mockups/feed-sample.json
```

It prints a `THRESHOLD` block to paste, **and exits 1 if the bands overlap on
score** — which is the more interesting answer, because it means no threshold
table can ever be correct and the fallback should stay an approximation.

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
