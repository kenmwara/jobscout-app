# JobScout — motion & material, v1

A design pass over the whole product, 2026-09-20. Measured from the 41 stills
in `jobscout-handover-2026-09-20.zip`, in the `colour-2026-09-20` format.

> **This adds a fourth axis — time — and changes no colour.**
> All thirteen laws in `HANDOVER-design.md` §3 are intact. `css/motion.css`
> contains no colour token; it composes with `theme-resolution.css`.

## The diagnosis in one paragraph

JobScout has an unusually rigorous **static** system — one OKLCH ramp, measured
contrast pairs, a colour law per axis, §16's area budget, a canonical mark —
and **no temporal system at all**. Not a spring, not a stagger, not a press
state. Apple's "feel" is close to 90% spring physics and material response and
very little colour; the product already won the colour half and has not started
the other one. Three things follow, and they are the whole brief: the rose never
moves, the surfaces never answer the pointer, and the one grid that could carry
data carries none.

## Start here

**`docs/BUILD-ORDER.md` is the single document to work from.** Everything in
this pack is folded in and sequenced: thirteen stages, what blocks what, the
files on each surface, measurable acceptance criteria and the mutation that
must break each one. It carries the Compose and SwiftUI spring equivalents so
the native clients cannot drift from the web clock, and it names the two things
that were proposed and **rejected** so they are not re-proposed.

`docs/CHANGELOG.md` is the same work as a flat, value-ordered list and
`docs/MOTION.md` is the reasoning — read those for the *what* and the *why*
without the *order*.

**`demos/rose-demo.html`** — open it. The rose filling *is* the pitch.

```
css/motion.css          the four springs, the stagger, the material ladder
docs/MOTION.md          the spec — every value with the number that justifies it
docs/BUILD-ORDER.md     the sequenced build: stages, files, acceptance, mutations
docs/CHANGELOG.md       the same work as a flat list, with before -> should-be
docs/IOS-GROUND.md      the one surface with no ground, as SwiftUI
tools/check_motion.mjs  the material ladder, measured + self-mutating
tools/check_rose.mjs    the needle-is-the-score law, measured + self-mutating
tools/check_halo_ext.mjs  the three ground rules — fold into check_halo.mjs
tools/check_card.mjs    Stage 1's two card assertions, measured + self-mutating
stage1/card.css         Stage 1, written. Append to site/base.css.
stage1/card.html        Stage 1, written. Both card types, one skeleton.
stage1/card.js          Stage 1, written. The rose generator and lighting.
demos/card-demo.html     the card anatomy: swept vs scored, desktop and 390pt
demos/rose-demo.html     scoring: the rose fills, the numeral counts, AUTO pulses
demos/pulse-demo.html    the AUTO pulse alone, at 1x and 4x, frame by frame
demos/surfaces-demo.html sector tiles as a distribution, list re-forming, empty state
demos/phone-demo.html    the phone header, Android browse, and the three states
reference/jobscout-motion.json        every token, generated from the CSS
reference/springs-crossplatform.json  the four springs as CSS / Compose / SwiftUI
stills/                 both demos, both themes
```

## The five findings

Each one measured, each one in the stills.

1. **The signature device is absent from the densest surface.** The score is a
   bare numeral on the phone, the web list and Android. Sampling the score
   region of `mockup-ca-dark.png` returns `#1c1544` and `#a4bbff` and no rose
   geometry. The handover calls the rose "the score device"; it currently is
   not one anywhere a reader looks. The card also renders a verdict and a fact
   identically, and the phone puts its title in sans-bold while the desktop
   card obeys law 13.
2. **The sector grid carries no information.** 17 tiles, 11 reading "24 open"
   because 24 is a page cap — 65% of the grid is the same number, and the real
   4–24 (6×) spread is invisible.
3. **A section paints its own ground.** A hard `1.126:1` seam at y=364 on the
   landing page, against the light halo's own `1.105:1` ceiling. The accident
   is louder than the design. Breaks law 7.
4. **The decorative circles subtract chroma** — 0.019 → 0.006, hue 37° → 348°
   at an overlap. This is the retired `--blob` failure, returned as geometry.
5. **There is one elevation state.** No hover, no press, anywhere. A hover with
   no press state is the most common reason an interface feels like a picture
   of an interface.

## Four rules that cover most of it

1. **Exits are faster than entries.** Entry 340–520ms, exit 160ms, and exits
   never overshoot. A thing that leaves faster than it arrives feels
   responsive; the reverse feels broken.
2. **Overshoot is rationed.** Only `--spring-arrive` overshoots meaningfully
   (8.3%), and it is spent on one thing: the score landing. Overshoot is a
   reward signal — spread it everywhere and it stops meaning anything.
3. **Every actionable surface has three states.** Rest, hover, press. Press
   uses exit timing, because a give that eases in is not a give.
4. **Reduced motion means no motion, not less.** Every rule resolves instantly
   rather than partially: same lit-dot count, same tile bar, same contrast.

## The one thing that creates the high

The rose filling. Eight bearings in bearing order from 000, 46ms apart, on a
520ms spring with 8.3% overshoot, with the numeral counting up on the same
clock and seating as the last dot lands — and **the lit count *is* the band**,
so watching it fill is watching the verdict form rather than a spinner
pretending to work. It happens eight times per run. A real AUTO gets a single
1.05 pulse; a NEAR-MISS gets nothing, because law 12 applies to motion too and
celebrating a 32 would be the interface lying to someone having a bad morning.

Everything else in here is in service of that moment reading as earned.

## What this deliberately does not do

No parallax hero, no scroll-jacking, no page transitions, no motion added to the
halo or the wandering mark (law 8 already tuned those), and not one new colour.
`docs/MOTION.md` §9 has the reasoning so the argument is not re-run.

## Tried and withdrawn — 2026-09-20

**A rebuilt landing hero.** Proposed and built: real sweep numbers counting up
in the headline, a pre-scored "today's top match" card floating beside the
paste box, a live-dot kicker, and a four-stat row under the fold.

**Withdrawn the same day.** It was a SaaS landing page — proof, social proof
and a stat row, on a free public tool that is not selling anything and has
nobody to convince. The existing hero is a headline and a paste box, and that
is correct: if you know what it is, you try it. The device was persuasion
dressed as design, and it belongs on the same list as the oryzo restyle.

A follow-up proposal to cut the hero's padding from 150px to 56px was also
**declined** — the tall block is the landing effect and that is a deliberate
call, not an oversight. The one thing still worth doing there is the paste box
taking the focus/press states from §4, because a control that does not answer
the pointer feels broken regardless of what it is for.

Everything else in this pack is interaction, information density or a measured
bug. None of it argues with the reader.

## The native clients

Compose and SwiftUI cannot consume `linear()`, so the same damped-spring
parameters are solved for each (omega = 2*pi/T, k = omega^2):

| token | duration | zeta | Compose | SwiftUI |
|---|---|---|---|---|
| snap | 180ms | 0.72 | `stiffness = 1218f` | `response: 0.180` |
| settle | 340ms | 1.00 | `stiffness = 342f` | `response: 0.340` |
| arrive | 520ms | 0.62 | `stiffness = 146f` | `response: 0.520` |

SwiftUI's `response` **is** the natural period, so it equals the CSS duration.
Do not substitute Compose's named stiffness constants — the durations stop
matching the web and the clients drift.

## Verifying it

Two checks ship in `tools/`, both written to your standard — a check that only
asserts presence is rejected, so every assertion reads a **computed value at a
real interaction state** and compares it to the other two.

```
node tools/check_rose.mjs                        # lit count == band, geometry, clipping
node tools/check_rose.mjs --mutate wrong-band    # must FAIL (exit 2 if it does not)
node tools/check_rose.mjs --reduced              # same information, no motion

node tools/check_motion.mjs                      # three distinct states, exits faster
node tools/check_motion.mjs --mutate press-equals-hover
node tools/check_motion.mjs --mutate slow-press  # breaks the asymmetry law
```

Both were run against the demos. Both passed, both mutations broke them — and
**both found real bugs in the demos they were written for**:

- `check_rose` found that NEAR-MISS's lit and unlit dots shared a fill, because
  that band's colour *is* the neutral. Fixed with `--rose-empty` (`--text` at
  14% — distinct from every band, and not a new colour).
- `check_motion` found four `light-dark()` shadow declarations with **three**
  arguments, which CSS drops silently — the exact trap documented two sections
  below, in the demos written to document it. Fixed as plain values with a dark
  override.

`tools/check_halo_ext.mjs` covers the three ground rules and folds into
`check_halo.mjs`:

```
node tools/check_halo_ext.mjs                     # one ground, warm, halo present
node tools/check_halo_ext.mjs --mutate section-bg # a container paints its own ground
node tools/check_halo_ext.mjs --mutate grey-blob  # a layer that subtracts chroma
node tools/check_halo_ext.mjs --mutate kill-halo  # the halo misses a route
```

`tools/check_card.mjs` is Stage 1's other half — the two assertions in its
accept block that the rose check does not cover:

```
node tools/check_card.mjs                          # Newsreader everywhere, three tiers
node tools/check_card.mjs --mutate sans-title      # the phone's sans-bold bug, returned
node tools/check_card.mjs --mutate chip-equals-band # a fact wearing the verdict's container
node tools/check_card.mjs --mutate flat-date       # tier 3 grows a container
```

It finds the ground with `elementFromPoint` rather than sampling fixed
coordinates — fixed points land on cards the moment a layout changes, which
this check did on its first run. And rule B tests *losing* warmth rather than
hitting an exact hue, because below ~0.010 chroma the hue angle is numerically
unstable and a near-white will report any value.

Still to write: a reduced-motion pass of `cycle3.mjs` asserting identical
information.
