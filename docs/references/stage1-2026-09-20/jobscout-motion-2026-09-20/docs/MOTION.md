# JobScout — the motion and material layer

Date: 2026-09-20. A design pass over the whole product — web, mockup, Android,
iOS — measured from the 41 stills in `jobscout-handover-2026-09-20.zip`.

> **Market is the hero. Theme is everything else. They never touch.**
> This document adds a **fourth axis — time** — and changes no colour. Every
> one of the thirteen laws in `HANDOVER-design.md` §3 is left intact. Where a
> proposal here touches a law, the law is quoted and the proposal is shown to
> satisfy it.

---

## 0. The diagnosis, in one paragraph

JobScout has an unusually rigorous **static** system: one OKLCH ramp, measured
contrast pairs, a colour law per axis, §16's area budget, a canonical mark. It
has **no temporal system at all** — not a spring, not a stagger, not a press
state. That is the whole gap. Apple's "feel" is close to 90% spring physics and
material response and very little colour; the product already won the colour
half and has not started the other one. Three things follow from that, and they
are the whole brief: **the rose never moves**, **the surfaces never answer the
pointer**, and **the one grid that could carry data carries none**.

---

## 1. What the stills actually show

Measured, not impressions.

### 1.1 The signature device is absent from the densest surface

Sampling the score region of the first card in `mockup-ca-dark.png` returns
`#1c1544` (the card), `#a4bbff` (`--accent`) and nothing else. The score is a
**bare numeral**. The rose — eight graduated bearings, the product's only
proprietary visual device, the thing the whole brand kit is built from — does
not appear on the phone list, on the web list, or on Android's list.

Law 9 calls the geometry canonical and the handover calls the rose "the score
device (needle-is-the-score law)". It is not currently the score device
anywhere a reader actually looks.

### 1.2 The sector grid carries no information

| | |
|---|---|
| Tiles | 17 |
| Reading "24 open" | **11 (65%)** |
| Real range | 4 – 24, a **6×** spread |
| Encoded in the tiles | none — identical size, weight, colour |

24 is a page cap (Android shows "24 of 318" beneath the same grid), so most of
the grid is the same number repeated. On Android this is ~1,100px of identical
white rectangles before a single posting. The handover already flags it; the
measurement says *why* it reads as synthetic.

### 1.3 A section paints its own ground, and the seam beats the halo

`web-landing-2-ca-light-desktop.png`, column x=1400:

```
hard edge at y=364:  #f3efeb -> #fffdf9   step 1.126:1
```

Law 7: *"One ground, on `<html>` … No page paints its own body ground (saved
and privacy once did and buried the halo)."* "How JobScout works" is doing it
now. And the seam at **1.126:1** is a larger step than the light halo's own
stated ceiling of **1.105:1** — the accidental edge is more visible than the
designed one.

### 1.4 The decorative circles subtract chroma

Sampling `web-saved-ca-light-desktop.png`:

| region | hex | chroma | hue |
|---|---|---|---|
| plain cream | `#f8f0e3` | 0.019 | 37° |
| inside a circle | `#f3efeb` | 0.007 | 30° |
| circle overlap | `#ede8e9` | **0.006** | **348°** |
| halo corner (correct) | `#f9edd9` | 0.029 | 38° |

The halo adds warmth; the circles remove it, and at an overlap they leave the
warm family entirely for 348°. This is the exact failure mode of the retired
`--blob` — *"a blob that darkens instead of a halo that adds light"* is already
in the handover's list of things tried and reverted. It came back as geometry.

### 1.5 There is one elevation state

| | surface | ground | step |
|---|---|---|---|
| light tile | `#ffffff` | `#f8f2e6` | 1.115:1 |
| dark card | `#1c1544` | `#1c1735` | 1.014:1 |

One state. No rest → hover → press ladder anywhere. **A hover with no press
state is the single most common reason an interface feels like a picture of an
interface**, and it is the cheapest thing on this list to fix.

---

## 2. The spring vocabulary

Four curves. Not a bag of easings, not a cubic-bezier chosen by eye. Each is a
real damped-spring step response sampled into `linear()`, and each is named for
its job.

| token | duration | overshoot | for |
|---|---|---|---|
| `--spring-snap` | 180ms | 3.8% | controls, toggles, chips, the theme switch |
| `--spring-settle` | 340ms | 0.0% | cards, sheets, panels — anything with area |
| `--spring-arrive` | 520ms | 8.3% | the rose and the score numeral, and nothing else |
| `--spring-exit` | 160ms | 0.0% | anything leaving |

**The asymmetry law.** Entries take 340–520ms; exits take 160ms and never
overshoot. A thing that leaves faster than it arrives feels responsive; the
reverse feels broken. This is Apple's own asymmetry and it is the single
highest-leverage rule in this document.

**Why overshoot is rationed.** Only `--spring-arrive` overshoots meaningfully,
and it is spent on exactly one thing: the score landing. Overshoot is a reward
signal. Spread it across every button and it stops meaning anything.

---

## 3. The rose becomes the interaction

This is the centrepiece. `demos/rose-demo.html` is the whole thing running.

### 3.1 The fill

The rose fills in **bearing order from 000**, one dot every `--stagger-dot`
(46ms), each dot on `--spring-arrive`. Eight dots = 368ms to fill; a
near-miss's three = 138ms. **The number of lit dots is the band**, so watching
it fill is watching the verdict form — not a spinner pretending to work while
a real answer is fetched.

```
unlit dot   opacity .16   scale .55
lit dot     opacity 1     scale 1     fill = the band's solid colour
```

The unlit dots stay visible at 16% so the reader can see *how much was not
awarded*. A 32 looks like a 32 because five dots are dark.

### 3.2 The numeral

Counts up on the same clock, cubic-eased, in JetBrains Mono with
`font-variant-numeric: tabular-nums` so it does not reflow while counting. It
seats on the exact frame the last dot lands. Law 13 already assigns mono to
data; this is data.

### 3.3 The tell

Hovering a card lights the **next** dot at 55% opacity, scale .86. It is the
cheapest possible way to teach that the rose is a quantity and not decoration,
and it costs one CSS rule.

### 3.4 Idle life

A settled rose breathes: lit dots cycle opacity 1 → .90 → 1 over
`--t-breathe` (4.2s), **offset per card** by 260ms and per dot by 120ms. The
offset is the point — a grid pulsing in unison reads as a loading state, which
is precisely the wrong message for a result that has already arrived.

### 3.5 The reward asymmetry

A real **AUTO** gets a single 1.05 scale pulse on its band pill, 420ms, once.
**NEAR-MISS gets nothing.** This is law 12 (honesty) expressed as motion: the
celebration has to be earned or it means nothing, and celebrating a 32 would be
the interface lying to a reader who is having a bad morning.

### 3.6 The geometry, unchanged

Law 9 stands: ring r=11 in a 24 box, eight bearings, radii 2.275 → 4.336
clockwise from 000, the two largest dots touching at 270/315. At ≥48px the
**display cut** is required, and its viewBox is
`-4.2416 -3.0639 31.3054 31.3054` — computed from the true bbox
(x −3.041…25.864, y −1.275…26.453) plus 1.2 clear space, squared. Using
`0 0 24 24` clips every outer dot; the first build of the demo did exactly
that, and the fix is visible in `stills/`.

---

## 4. Material: the surfaces answer the pointer

Three states, on every actionable surface, always.

```
rest    border --edge-rest    shadow --sh-rest     no transform
hover   border --edge-hover   shadow --sh-hover    translateY(-2px)
press   border --edge-hover   shadow --sh-press    scale(.988)   @ --t-exit
```

Press uses the **exit** timing — the give must be immediate or it is not a
give.

**On dark there are no shadows.** §10 already established that dark separates
by hue and hairline, not brightness, and a warm shadow on ink reads as dirt.
So the dark ladder is carried by two other things: the hairline brightens
`.13 → .26`, and the surface lifts `#1c1544 → #221a52`, which is 1.10:1 — the
same step `--surface` already takes above `--canvas`. No new colour decision;
the existing rung reused.

Press scales differ by mass: cards `.988`, controls `.96`, the heart `.88`. A
small control needs a larger scale to register the same felt give.

---

## 5. The sector grid becomes the distribution

Keep the grid. Keep every tile the same size — grid discipline is not the
problem. Put a **bar behind each tile at `count / max`**, drawn on
`--spring-settle` 90ms after the tile seats, in `--tile-fill`.

§16 governs the colour: the tile is a large surface, so the fill is
`rgba(72,101,255,.085)` light / `rgba(162,186,255,.10)` dark — near-neutral,
nowhere near band strength. The bar is a quantity, not a signal, and it must
not compete with a band pill.

Two more changes that cost nothing:

- **Sort by count descending.** The distribution is the story; alphabetical
  hides it.
- **Show the cap honestly.** `24+ of 318`, not `24 open`. Law 12: the current
  label states a capped number as if it were the count.

Result: seventeen identical rectangles become a chart the reader can tap, and
the 6× spread that was always in the data becomes visible for the first time.
`demos/surfaces-demo.html` has it live.

---

## 6. Lists that re-form

On filter change: rows leave on `--spring-exit` (160ms, 14ms stagger), then
arrive on `--spring-settle` (340ms, 28ms stagger, 10px travel). Roses re-light
with their own 34ms per-dot stagger layered on the row's delay.

The reader sees **the set change** rather than blink. On first paint, the same
entry runs once via `IntersectionObserver`, then unobserves — this is an
arrival, not a scroll effect, and re-running it on every scroll is the thing
that makes scroll animation obnoxious.

Cap the stagger index at 12. Past ~400ms of total stagger the last item feels
forgotten.

---

## 7. Section rhythm without breaking law 7

Delete the "How JobScout works" section ground. Mark the boundary with:

1. a full-bleed `--hairline` at the section's top edge, and
2. the section's serif heading rising `--travel-head` (12px) with a fade,
   400ms on `--spring-settle`, **once**, on first view.

That is a stronger boundary cue than the 1.126:1 seam it replaces, and it
leaves the one ground on `<html>` untouched. The seam currently beats the halo
it sits on; a hairline does not compete with anything.

---

## 8. The empty state is the mark doing its job

`web-saved-ca-light-desktop.png` is a white box with centred text — the one
screen with nothing to show is also the one with nothing to look at.

Put a 96px rose in it, unlit, with one bearing lighting and dimming at a time
over `--t-seek` (5.6s), each dot offset 220ms. It reads as *searching*. The
product's own logo, doing the product's own job, at the exact moment there is
no data — and it costs one keyframe.

---

## 9. What this does not do

Deliberate omissions, so the argument is not re-run later:

- **No parallax hero.** It fights the fixed ground and buys nothing.
- **No scroll-jacking, no scroll-driven timelines** beyond the one-shot entry.
- **No page transitions.** They add latency to a product whose whole pitch is
  that it already did the work.
- **No motion on the halo or the wandering mark.** Law 8 already tuned that
  (48s figure, stepped on Android so the window idles); it is correct.
- **No new colour.** Not one token in `motion.css` is a colour.
- **Nothing that degrades under `prefers-reduced-motion`** to *less
  information* — see §10.

---

## 10. Reduced motion means no motion, not less

Every rule above resolves instantly rather than partially. The rose still shows
its lit count. The tile bar still shows its share. The list still filters. The
band pill still reads AUTO. A reader with vestibular sensitivity gets the same
information at the same contrast, with `transition-duration: 1ms` and every
`animation` off.

This is why the breathing, the seek and the AUTO pulse are all **animations**
and the state changes are all **transitions**: one class can be killed wholesale
without touching the other.

---

## 11. Ordered for the implementer

The numbered, actionable version is `docs/CHANGELOG.md`. Items 1–3 are the ones
that change how the product feels; 4–7 are the ones that make it look
considered.

## 12. One line to keep in your head

> **The static system says what is true. The temporal system says it is alive.
> JobScout has the first and needs the second.**
