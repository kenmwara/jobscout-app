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

**`docs/BUILD-ORDER.md`** — the sequenced build for Claude Code: nine stages,
what blocks what, the files on each surface, measurable acceptance criteria and
the mutation that must break each one. It carries the Compose and SwiftUI
spring equivalents so the native clients do not drift from the web clock.

`docs/CHANGELOG.md` is the same work as a flat, value-ordered list — read it if
you want the *what* without the *order*.

**`demos/rose-demo.html`** — open it. The rose filling *is* the pitch.

```
css/motion.css          the four springs, the stagger, the material ladder
docs/MOTION.md          the spec — every value with the number that justifies it
docs/BUILD-ORDER.md     the sequenced build: stages, files, acceptance, mutations
docs/CHANGELOG.md       the same work as a flat list, with before -> should-be
demos/rose-demo.html    scoring: the rose fills, the numeral counts, AUTO pulses
demos/surfaces-demo.html sector tiles as a distribution, list re-forming, empty state
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
   not one anywhere a reader looks.
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

`docs/CHANGELOG.md` ends with four checks written to be mutation-tested:
`check_motion.mjs`, `check_rose.mjs`, an extension to `check_halo.mjs` that
catches findings 3 and 4, and a reduced-motion pass of `cycle3.mjs` asserting
identical *information*.
