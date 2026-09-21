# The design algorithm

Every number in this design system is either a **constant** or **derived from
one by a stated formula**. This document is the derivation, with the
measurements that justify each one.

Nothing here is a taste claim. Where a rule was tested and the measurement
went against the guess, the measurement is what is recorded.

---

## 0. The finding that shapes everything

The product has six subsystems. **Three were already generative and had never
been written down. Three were hand-tuned and had drifted.**

| subsystem | state before v3 | evidence |
|---|---|---|
| colour | **generative** | 14 numbers regenerate all 24 band colours — 22/24 byte-exact |
| motion | **generative** | each curve is a real spring step response sampled into `linear()` |
| rose geometry | **generative** | `r = 2.275 + 0.2944·i` on a ring of 11 in a 24 box |
| type | hand-tuned | **20 distinct sizes** between 8 and 31px |
| space | hand-tuned | **17 distinct values** between 1 and 26px |
| elevation | hand-tuned | no constant rung; light hover measured **1.000:1** |

So v3 is not a redesign. It is **writing down the generator that three of the
six already obeyed, and bringing the other three up to that standard.**

Everything lives in `tokens/tokens.json`. `tokens/generate.mjs` emits
`tokens.css`, `Tokens.kt` and `Tokens.swift` from it, and
`tokens/generate.mjs --check` fails if any of the three has been hand-edited.
The platforms cannot drift, because there is only one set of numbers.

---

## 1. Colour — proven, not asserted

### The band ramp is a function of hue

Measured across the four shipped bands, excluding NEAR-MISS:

| role | theme | L spread | C spread |
|---|---|---|---|
| colour | light | **0.0019** | **0.0006** |
| colour | dark | 0.0008 | 0.0010 |
| label | light | 0.0009 | 0.0012 |
| label | dark | 0.0019 | 0.0007 |
| fill | light | 0.0011 | 0.0011 |
| fill | dark | 0.0018 | 0.0016 |

Lightness and chroma are constant to three decimal places. **Hue is the only
variable.** The generator is:

```
band(role, theme, hue) = oklch(L[role][theme],
                               C[role][theme] × (hue is NEAR-MISS ? 0.28 : 1),
                               hue)

hues   auto 147 · ping 270 · unsure 63 · nearmiss 285
colour L .600/.760   C .1360/.1225      (light/dark)
label  L .420/.800   C .0960/.1005
fill   L .955/.305   C .0215/.0380
```

Fourteen numbers. **Regenerated against the shipped hexes: 22/24 byte-exact,
2 off by 1/255 rounding.** The two that differ (`--unsure-label` dark,
`--unsure-fill` light) are the generator being *more* correct than the hand
value; take the generated ones.

### NEAR-MISS is the ramp at 0.28× chroma

This is why it reads as the neutral rather than as a fourth colour: **its band
IS the neutral.** It is also why an unlit rose dot may never be a band colour —
using NEAR-MISS for the empty track leaves lit and unlit identical but for
opacity. `check_rose.mjs` caught exactly that.

### One neutral family, and only two hues outside it

| | hue | chroma |
|---|---|---|
| canvas · surface · sunken · evidence · ink · the whole dark theme | 277–286 | — |
| light canvas / sunken (warm cream) | 80–83 | 0.012 – 0.019 |
| **NEAR-MISS** | 285 | 0.039 |
| **PING** | 270 | 0.136 |
| AUTO | **147** | 0.136 |
| UNSURE | **63** | 0.136 |

PING and NEAR-MISS live *inside* the family by design. **AUTO and UNSURE are
the only two hues outside it, and they are the only two that mean something on
sight.** Green and amber speak; everything else is material.

So the rule for a large surface is **hue membership, not chroma magnitude**:

> No element above 4,000pt² may carry chroma above 0.03 while its hue lies
> outside 265–295.

This is what `check_scale.mjs` rule C enforces. It is also the correction to an
earlier draft that proposed a chroma-magnitude test: that test would have
failed an ink panel at C 0.087 while passing nothing useful, because chroma at
L 0.16 is perceptually tiny. The market hero is exempt **by ruling** — see
`DECISIONS.md` D1.

---

## 2. Type — there was no scale

**Measured:** 20 distinct sizes between 8 and 31px. Fitting them to a modular
scale returns "base 9, ratio 1.100, RMS 0.41px", which proves nothing: at a
1.10 ratio the steps are so dense that almost any number is within half a pixel
of one. **The type was unmanaged.**

The scale:

```
size(n) = 9 × 1.195ⁿ, rounded to 0.5px, n ∈ 0..7
        = 9 · 11 · 13 · 15.5 · 18.5 · 22 · 26 · 31.5
```

Eight steps replacing twenty, and each lands within 0.5px of a role the
product already uses:

| token | px | role | was |
|---|---|---|---|
| `--t0` | 9 | caps label — band pill, evidence key | 8 / 8.5 |
| `--t1` | 11 | meta — chip, date, org | 10.5 / 11 / 11.5 |
| `--t2` | 13 | body — descriptions, buttons | 12 / 12.5 / 13 / 13.5 |
| `--t3` | 15.5 | emphasis — nav rows, lede | 14 / 14.5 / 15 / 16 |
| `--t4` | 18.5 | card title (serif) | 17 / 18 / 19 |
| `--t5` | 22 | screen title (serif) | 20 / 24 |
| `--t6` | 26 | page title (serif) | 25 / 26 |
| `--t7` | 31.5 | hero (serif) | 31 |

Family law, unchanged: **serif 400 for `t4`–`t7` only; sans for everything
else; mono tabular for every numeral that is data.** Newsreader ships at 400,
so the weight is pinned — a synthesised bold is the phone's sans-bold bug
wearing the right family name.

---

## 3. Space — a 4px grid with one half-step

**Measured:** 17 distinct values from 1 to 26px. Snapping to
`2 · 4 · 8 · 12 · 16 · 20 · 24 · 32` moves nothing by more than 2px.

`check_scale.mjs` rule B asserts every computed padding, margin and gap is on
the grid. Running it the first time caught three real violations in this
package's own CSS: `.tier1` at 10px, and the user-agent's 1px/6px button
padding leaking through `.hero__go`, `.heart` and `.sheet__x` because form
elements inherit nothing by default. Both are fixed in `css/base.css`.

---

## 4. Radius — one constant, one step

```
card = 16
chip = card − 2·step = 4     inner = card − step = 10
sheet = card + step = 22     pill  = 1600
```

with `step = 6`. The sheet's 22 is top-corners-only: a sheet has no bottom
edge.

---

## 5. Elevation — and why the asymmetry is not a bug

**Measured, off `--surface`:**

| | light | dark |
|---|---|---|
| canvas → surface | 1.105 | 1.170 |
| surface → sunken | 1.253 | 1.225 |
| surface → **hover** | **1.000** | 1.079 |
| surface → evidence | 1.123 | 1.225 |

The light hover measures **1.000:1** — no surface change at all. That looked
like an oversight and is not: on light, `--surface` is `#ffffff`, the **ceiling**.
A hover cannot go lighter. So:

> **On light, elevation is carried by shadow alone. On dark there is no shadow
> — a warm shadow on ink reads as dirt — so it is carried entirely by the lift
> and the edge.**

Two named steps replace the hand-picked rungs: `rung = 1.10` (elevation) and
`recess = 1.25` (sunken). The remaining deviations are the ceiling rule doing
its job, not drift.

---

## 6. Motion — already generative, now emitted

Each curve is a real damped-spring step response, sampled into `linear()` by
`generate.mjs`:

```
ω = 2π / T        ζ = damping ratio
y(t) = 1 − e^(−ζωt)·(cos ω_d t + (ζω/ω_d)·sin ω_d t)      ζ < 1
y(t) = 1 − e^(−ωt)·(1 + ωt)                               ζ = 1
```

| token | duration | ζ | overshoot | Compose `stiffness = ω²` | SwiftUI `response` |
|---|---|---|---|---|---|
| `snap` | 180ms | 0.72 | 3.8% | **1218** | 0.180 |
| `settle` | 340ms | 1.00 | 0% | **342** | 0.340 |
| `arrive` | 520ms | 0.62 | 8.3% | **146** | 0.520 |
| `exit` | 160ms | — | never | `tween(160, cubic(0.4,0,1,1))` | `.easeIn(0.16)` |

SwiftUI's `response` **is** the natural period, so it equals the CSS duration.
Compose cannot consume `linear()`; do not eyeball an equivalent and do not
substitute Compose's named stiffness constants — the durations stop matching
and the clients drift.

**The asymmetry law:** entries 340–520ms, exits 160ms, exits never overshoot.
A thing that leaves faster than it arrives feels responsive; the reverse feels
broken. A press that eases in is not a give.

---

## 7. The rose — unchanged, and stated

```
ring r = 11 in a 24 box, 8 bearings clockwise from 000
dot  r = 2.275 + 0.2944·i
display cut viewBox = "-4.2416 -3.0639 31.3054 31.3054"
```

The cut comes from the true bounding box (x −3.041…25.864, y −1.275…26.453)
plus 1.2 clear space, squared. `0 0 24 24` clips every outer dot **at every
size**, so the cut is used at 44 as well as at 64.

**The two largest dots touch at bearings 270 and 315 on purpose. Do not "fix"
them.**

**The law:** the number of lit dots IS the band — AUTO 8 · PING 6 · UNSURE 5 ·
NEAR-MISS 3. Not the score. A 79 and a 65 are both PING and both light six.

---

## 8. What the checks actually assert

A check that only asserts presence is rejected. Every assertion below reads a
**computed value off a rendered element**, and every check has mutations that
must break it.

| check | asserts | mutations |
|---|---|---|
| `generate.mjs --check` | the three generated files still match `tokens.json` | hand-edit any of them |
| `check_scale.mjs` | A type on the scale · B space on the grid · C no coloured surface outside the neutral family | `off-scale-type`, `off-grid-space`, `band-wash` |
| `check_tiers.mjs` | verdict taller **and** wider **and** differently shaped than fact; context bare | `fat-fact`, `boxed-date`, `pill-fact` |
| `check_honesty.mjs` | no gap leads a browse card; no line persuades or claims; ember means one thing | `gap-on-browse`, `persuasion`, `ember-quote` |

All four run green against this package. Every mutation breaks them.
