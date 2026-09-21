# Build order — motion, material & surfaces

For Claude Code. **This is the single document to work from.** Everything from
the 2026-09-20 design pass is folded in and sequenced; `docs/MOTION.md`,
`docs/IOS-GROUND.md` and `docs/CHANGELOG.md` hold the reasoning behind
individual items.

Read `docs/MOTION.md` §0 and §12 first, then this end to end before touching
anything.

---

## Ground rules

1. **No law changes.** All thirteen in `HANDOVER-design.md` §3 hold. If an
   implementation disagrees with THEME.md, the implementation is wrong.
2. **No new colour.** `css/motion.css` contains three hexes and all three are
   the dark surface rung reused (`#1c1544 → #221a52`, 1.10:1 — the step
   `--surface` already takes above `--canvas`). If a stage makes you reach for
   a hex that is not already in `theme-resolution.css`, stop.
3. **Measure, then mutate.** A check that only asserts presence is rejected.
   Every acceptance criterion below is written so that flipping one rule makes
   it fail — prove that by flipping it.
4. **One commit per stage.** Each lands green on its own checks before the next
   begins.
5. **Web first.** `site/base.css` is the reference. Android and iOS follow its
   numbers, not their own judgement.

### Not in scope — decided, do not re-propose

- **A rebuilt landing hero** (real-number headline, pre-scored proof card,
  live-dot kicker, stat row). Withdrawn: it was a SaaS landing page on a free
  public tool that is not selling anything. The existing hero — a headline and
  a paste box — is correct.
- **Reducing the hero's padding from 150px.** Declined; the tall block is the
  landing effect and that is a deliberate call.

The one hero-area item that *is* in scope is the paste box taking the focus and
press states in Stage 3.

---

## Stage 0 — tokens · blocks everything

**Files:** `site/base.css`

Append or `@import` `css/motion.css`, below the colour tokens. One file either
way; two stylesheets is how the theme drifted before.

**Accept:** `--spring-arrive` resolves non-empty in both themes and both
markets. `check_palette.py` passes unchanged — motion adds no colour, so any
drift means something was pasted that should not have been.

**Mutation:** delete one `--spring-*` line; the assertion fails.

---

## Stage 1 — the card · blocks Stage 2

**Files:** `site/index.html`, `site/saved.html`, `site/base.css`,
`mockups/mobile.html`, and the Android/iOS equivalents

**Reference:** `demos/card-demo.html` — both types, both themes, desktop and
390pt.

### 1.1 Two types, one skeleton

The difference between them is whether the rose is lit — which is also the
difference between the sweep and your matches.

| | swept (browse, before a resume) | scored (matches, saved) |
|---|---|---|
| rose | **unlit**, all 8 bearings at `--rose-empty` | lit to the band |
| numeral | an en-dash | the score, mono, tabular |
| band pill | absent | present |
| evidence | absent | one line: STRONGEST |
| action | "Score this against me →" | "Prepare application →" |

**This is the idea worth keeping:** eight empty bearings say *there is a score
to be had here* without a word, on every row of the sweep — and when a resume
arrives, they fill in place. Browse *becomes* matches. Android's sweep card
currently offers only an `×` to dismiss, which is the opposite affordance.

### 1.2 The score leads

It shipped as a **bare numeral parked in the top-right corner at body-text
weight** — the most important value on the card rendered as the least weighted.
Sampling the score region of the first card in `mockup-ca-dark.png` returns
`#1c1544` and `#a4bbff` and **no rose geometry** at all.

- Rose **first in reading order**, left, with the numeral centred in it.
  **52px** on desktop (law 9's floor for the display cut), 44px at 390pt.
- **viewBox is the display cut:** `-4.2416 -3.0639 31.3054 31.3054`, computed
  from the true bbox (x −3.041…25.864, y −1.275…26.453) plus 1.2 clear space,
  squared. `0 0 24 24` clips every outer dot.
- Geometry unchanged. **The two largest dots touch at 270/315 on purpose. Do
  not "fix" them.**
- Lit count **is** the band: AUTO 8 · PING 6 · UNSURE 5 · NEAR-MISS 3.
- Unlit dots visible at `opacity .14`, `scale .55` — a 32 must look like a 32.
- **Unlit dots use `--rose-empty` (`--text` at 14%), never a band colour.**
  NEAR-MISS's band *is* the neutral, so using it for the track leaves lit and
  unlit identical but for opacity. `check_rose.mjs` caught exactly this.
- Numeral: JetBrains Mono, `font-variant-numeric: tabular-nums` (law 13).

### 1.3 The title is Newsreader

The phone shipped the title in **sans-bold**. The desktop card already uses
Newsreader, and law 13 assigns the serif to display — so the densest surface in
the product is the one breaking the type law. 18px desktop, 16px at 390pt,
weight 400.

### 1.4 Three tiers of metadata — container weight is importance

A verdict and a fact currently render identically: same height, same radius,
same type size.

| tier | element | treatment |
|---|---|---|
| 1 — the verdict | band pill | **filled**, band `-bg` + `-l` pair |
| 2 — a fact | location chip | `--sunken` + `--text-2`, **no hue** (law 5) |
| 3 — context | posted date | **no container at all**, `--text-2` |

### 1.5 The heart leaves the score's corner

It sits beside the score today, so the save action competes with the verdict.
Move it to the action row, far right, `margin-left:auto`.

### 1.6 One evidence line, and it is STRONGEST

The card carries the strongest line only. **What-to-answer stays behind the
tap** — a browse card that leads with a gap is leading with what the reader
lacks, which law 12 forbids. Uses §16's option C: `--evidence-bg` with a 2px
`--evidence-rule-strongest` left rule.

**Accept — `tools/check_rose.mjs` plus two card assertions:**
- lit count equals the band across twelve route/theme/market cells; display cut
  verbatim at ≥48px; no dot's painted box escapes its `<svg>`; lit and unlit
  fills differ.
- every card title's computed `font-family` resolves to Newsreader, on **every**
  surface including 390pt.
- on any card, the band pill's computed `background-color` is not
  `transparent` **and** the location chip's is `--sunken`, and the date has no
  background — three distinct treatments, asserted as three distinct computed
  values.

**Mutation:** `--mutate wrong-band`, `--mutate cropped-viewbox`; and set the
chip's background to the band pill's — the three-tier assertion must fail.

---

## Stage 2 — the score arrives · the moment the product sells itself

**Files:** `site/base.css`, `site/app.js`, `mockups/mobile.html`

- Fill in **bearing order from 000**, one dot every `--stagger-dot` (46ms), each
  on `--spring-arrive` (520ms, 8.3% overshoot). Eight dots = 368ms.
- Numeral counts up on the same clock, seating as the last dot lands. Not a
  separate timer — they must not drift.
- **Hover lights the next dot** at `opacity .55`, `scale .86`. One rule; it is
  what teaches that the rose is a quantity.
- Settled roses breathe 1 → `.90` → 1 over `--t-breathe` (4.2s), offset 260ms
  per card and 120ms per dot. **The offset is mandatory** — a grid pulsing in
  unison reads as a loading state.
- **The AUTO pulse** — `scale(1) → 1.05 at 38% → 1` on `--spring-arrive`,
  420ms, **one** iteration, on the band pill only. Fires when the card
  *settles* (after the eighth dot lands), so it reads as the verdict arriving
  rather than the page loading. At the pill's 78×22px, 5% is about **4px of
  travel** at the widest point.

  It does not repeat, does not fire on hover or scroll, and **never fires
  below 80**. NEAR-MISS has no rule at all — the absence is the design, so
  there is nothing to disable. Law 12: a celebration that fires on every
  result is not a signal, and celebrating a 32 is the interface congratulating
  someone on a bad morning.

  `demos/pulse-demo.html` isolates it, with a 4× slow-motion toggle and the
  frame-by-frame scale values.

**Reference:** `demos/rose-demo.html`.

**Accept:**
- with the clock stubbed, the last dot's transition end and the numeral
  reaching target land within one frame (16ms);
- breathing `delay` values are pairwise distinct across three or more cards;
- **the pulse fires only on AUTO.** After settle, a `[data-band="auto"]` band
  pill has exactly **one** running animation named `autopulse` with
  `iterationCount: 1`; `[data-band="ping"]`, `"unsure"` and `"near"` have
  **zero**. Assert on `element.getAnimations()`, never on a class — a class
  proves nothing about whether the keyframes ran.

**Mutation:** set both breathe offsets to 0 — the distinctness assertion fails.
Then drop the `[data-band=auto]` qualifier so the pulse fires on every band —
the zero-animations assertion on NEAR-MISS must fail.

---

## Stage 3 — three states on every actionable surface · cheapest, ship early

**Files:** `site/base.css`, `mockups/mobile.html`

One elevation state exists today: light tile `#ffffff` on `#f8f2e6` (1.115:1),
dark card `#1c1544` on `#1c1735` (1.014:1). No hover, no press, anywhere.

```
rest    --edge-rest    --sh-rest     —
hover   --edge-hover   --sh-hover    translateY(-2px)
press   --edge-hover   --sh-press    scale(.988)  @ --t-exit
```

- Press **must** use exit timing. A give that eases in is not a give.
- Press scale by mass: cards `.988`, controls `.96`, the heart `.88`.
- **On dark there are no shadows** (§10 — a warm shadow on ink reads as dirt).
  The ladder is the hairline `.13 → .26` plus `#1c1544 → #221a52`.
- **Multi-part values cannot go in `light-dark()`.** Two shadows means a
  top-level comma; `light-dark()` sees three arguments and **silently drops the
  whole declaration**. `check_motion.mjs` found four of these in the demos
  written to document the trap. Plain value + dark override.

Apply to: job cards, sector tiles/chips, list rows, both buttons, the heart,
filter chips, market chip, theme segments, **and the hero's paste box**.

**Accept — `tools/check_motion.mjs`:** three distinct computed shadows *and*
border colours across rest/hover/press (on dark, shadows all `none` and the
border/background carriers still distinct); hover displaces; press differs from
hover; `:active` duration ≤ entry duration and ≤ 200ms.

**Mutation:** `--mutate press-equals-hover`, `--mutate slow-press`.

---

## Stage 4 — the sector grid becomes the distribution (web)

**Files:** `site/index.html`, `site/base.css`, the sector count source

17 tiles, **11 reading "24 open"** because 24 is a page cap. 65% of the grid is
the same number; none of the real 4–24 (6×) spread is visible.

- Bar behind each tile at `count / max`, `--tile-fill`, on `--spring-settle`,
  **90ms after the tile seats** — the tile arrives, then the data fills.
- **Sort by count descending.** Alphabetical hides the story.
- Label `24+ of 318`, not `24 open` (law 12 — a capped number stated as the
  count).
- Tile size stays uniform.

§16 governs the fill: a tile is a large surface, so `--tile-fill` is
`rgba(72,101,255,.085)` / `rgba(162,186,255,.10)` — a quantity, not a signal.

**Accept:** bar width ÷ tile width equals `count / max` within ±1%; tiles in
descending order in the DOM; no label matches `/^\d+ open$/`.

**Mutation:** swap two tiles' counts without moving them; ordering fails.

---

## Stage 5 — lists re-form

**Files:** `site/index.html`, `site/base.css`, `site/app.js`

Out on `--spring-exit` (160ms, 14ms stagger) → in on `--spring-settle` (340ms,
28ms stagger, 10px travel). Roses re-light with a 34ms per-dot stagger layered
on the row delay. First paint runs the same entry **once** via
`IntersectionObserver`, then `unobserve`. Cap the stagger index at 12.

**Accept:** scroll a filtered list out and back — no row replays its entry
(`getAnimations()` empty on a row already `in`); the 13th row's delay equals the
12th's.

**Mutation:** remove the `unobserve`; the replay check fails.

---

## Stage 6 — the two ground bugs · law violations, not polish

**Files:** `site/index.html`, `site/base.css`

### 6a — a section paints its own ground

```
web-landing-2-ca-light-desktop.png, x=1400
hard edge at y=364:   #f3efeb -> #fffdf9   step 1.126:1
```

Law 7: *"One ground, on `<html>` … No page paints its own body ground."* The
seam is a **larger step than the light halo's own 1.105:1 ceiling** — the
accident is more visible than the design.

Remove the background. Mark the boundary with a full-bleed `--hairline` plus
the section's serif heading rising `--travel-head` (12px) with a fade, 400ms
`--spring-settle`, **once** on first view.

### 6b — the decorative circles subtract chroma

| region | hex | chroma | hue |
|---|---|---|---|
| plain cream | `#f8f0e3` | 0.019 | 37° |
| inside a circle | `#f3efeb` | 0.007 | 30° |
| **circle overlap** | `#ede8e9` | **0.006** | **348°** |
| halo corner (correct) | `#f9edd9` | 0.029 | 38° |

The halo adds warmth; the circles remove it and leave the warm family for 348°.
This is the retired `--blob` failure returned as geometry. The circles either
join the halo layer — lighter than the canvas, in its hue family, ΔE ≥ 5 — or
they go.

**Accept — `tools/check_halo_ext.mjs`:** no element other than `html` paints
>50% of the viewport; no ground sample below 55% of the ground's median chroma;
hue within 15–110° wherever chroma ≥ 0.010; brightest/dimmest ground samples
lift ≥1.02 on every route and within the theme's ceiling.

Note the check finds ground with `elementFromPoint` rather than fixed
coordinates, and tests *losing* warmth rather than an exact hue — below ~0.010
chroma the hue angle is numerically unstable and a near-white reports anything.

**Mutation:** `--mutate section-bg`, `--mutate grey-blob`, `--mutate kill-halo`.

---

## Stage 7 — the phone header

**Files:** `site/base.css`, `site/index.html` (+ the other three routes),
`mockups/mobile.html`

At 390pt the header wraps to **two rows, 80px**, before any content. Three
faults, only one of which is the wrap:

- **The market pill drops its labels** — two 24px flags and a white pill.
  Nothing says which market you are in.
- **The nav is silently truncated** to "Browse". Saved and How it works are
  gone, not collapsed.
- **It breaks past three markets.** Four flags plus padding is ~200px of a
  390pt row and the control has no overflow behaviour.

**One row, 56px:**

```
[rose] JobScout .................. [🇨🇦 CA]  [⋯]
```

- Market chip is **flag + 2-letter code**, 44pt tall, and opens a sheet beyond
  three markets — it scales without a redesign.
- `⋯` opens a sheet with the **full three-state theme control** (law 2 — still
  Light / Device / Dark, at sheet size where it is easier to hit) plus every nav
  item with its count. Nothing truncated.
- Sheet follows THEME.md §15: 90dvh, rounded top only, grab handle, scrim `.66`.

**Reference:** `demos/phone-demo.html`, panels 1 and 2.

**Accept:** at 390, 360 and 320pt the header is a single flex row with no wrap
(`offsetHeight` ≤ 60 and one line box); every nav destination is reachable
within one tap of `⋯`; with four markets injected the header height is
unchanged.

**Mutation:** inject a fourth market; height must not change and no item may
overflow.

---

## Stage 8 — Android browse: the sweep starts 81% down

**Files:** `android/app/src/main/java/trade/tbot/jobscout/MainActivity.kt`,
plus the web equivalent at phone widths

`android-browse-ca-light.png`, 1080×2400:

| | |
|---|---|
| two-column tile grid | y 430 → ~1140 (**710px**) |
| chips, heading, sub-chips, count | → 1940 |
| **first posting card** | **y 1940 of 2400 = 81% down** |

Ten identical tiles reading "24 open" take half the screen before a single job.

**Fixed:** the grid becomes a **single horizontal scroller of chips**, sorted by
count, count inline — `Finance & banking 24+`. **50px instead of 710.** The list
starts immediately below; the chip row is sticky so the filter stays reachable.

```
first posting   y 1940  ->  y ~461    (19% down instead of 81%)
                1,479px recovered
```

Nothing is lost — every sector is still there, still tappable, still shows its
count. It scrolls sideways instead of downwards.

**Accept:** on a 1080×2400 emulator the first posting card's top is < 700px;
the chip row is one row high; every sector from the grid is present in the
scroller.

**Mutation:** remove the sort; descending-order assertion fails.

---

## Stage 9 — empty and refused states

**Files:** `site/saved.html`, `site/apply.html`, `site/base.css`,
`mockups/mobile.html`, and the Android/iOS equivalents

Three states have no design today. All three are in `demos/phone-demo.html`.

**Saved, empty.** An 84–96px unlit rose, one bearing lighting and dimming at a
time over `--t-seek` (5.6s), 220ms per-dot offset. One keyframe; the mark doing
the product's job at the moment there is no data.

**Rate-limited.** Leads with what happened and when, not with a wall. Countdown
in mono with tabular figures. Both actions are real routes — open the last run,
or browse the sweep — never a dead end.

**Grounded refusal.** Law 12: *a refusal is shown with its reason, never
silently*, and *never lead with what they lack*. So it leads with what the
product **did**, then names the claims **quoted verbatim** with why each failed:

> **The letter was written, then checked.**
> Two of its claims are not in your resume, so it is not being shown as yours.
> Nothing here is a judgement about you — only about what the document says.
>
> **NOT IN THE RESUME**
> 1. "led a team of six engineers" — the resume names no team size.
> 2. "AWS certified" — no certification appears anywhere in the document.

Quoting the exact phrase is the requirement: "2 things your resume does not
contain" is unactionable and gives the reader no way to tell whether the model
was simply wrong. Second action is **add them to the resume and re-run** — it
treats the refusal as possibly the resume's omission rather than the reader's
failing.

**Accept:** each state renders in both themes and both markets with no
market-coloured element; the refusal shows one quoted phrase per flagged claim;
the rate-limit countdown uses `tabular-nums` and does not reflow while ticking.

**Mutation:** replace a quoted phrase with a count ("2 claims"); the
one-quote-per-claim assertion fails.

---

## Stage 10 — Android: springs and the rose · after web is green

**Files:** `android/.../{Tokens,Theme,Rose,MainActivity,Apply}.kt`

Compose cannot consume `linear()`. **Do not eyeball an equivalent and do not
substitute Compose's named stiffness constants** — the durations stop matching
and the clients drift, which is the failure `check_palette.py` exists to
prevent for colour. Derived from the same parameters (ω = 2π/T, k = ω²):

| token | duration | ζ | Compose | SwiftUI |
|---|---|---|---|---|
| `snap` | 180ms | 0.72 | `spring(dampingRatio = 0.72f, stiffness = 1218f)` | `.spring(response: 0.180, dampingFraction: 0.72)` |
| `settle` | 340ms | 1.00 | `spring(dampingRatio = 1.00f, stiffness = 342f)` | `.spring(response: 0.340, dampingFraction: 1.00)` |
| `arrive` | 520ms | 0.62 | `spring(dampingRatio = 0.62f, stiffness = 146f)` | `.spring(response: 0.520, dampingFraction: 0.62)` |
| `exit` | 160ms | — | `tween(160, CubicBezierEasing(0.4f, 0f, 1f, 1f))` | `.easeIn(duration: 0.16)` |

SwiftUI's `response` **is** the natural period, so it equals the CSS duration.
Values in `reference/springs-crossplatform.json`.

- `Rose.kt` already draws the canonical geometry — add the staggered fill and
  the breathe.
- Keep `Modifier.ground()`'s stepped wander (1.2s every 12s); law 8 tuned it.
- Compose has no `:active` — use `interactionSource.collectIsPressedAsState()`
  and animate `scale` on exit timing.

**Accept:** `check_palette.py` extended to assert the four durations and four
damping ratios match `base.css` within 1ms / 0.01; an emulator capture of a
scoring run shows the same lit-dot counts as web for the same fixture.

---

## Stage 11 — iOS: the ground · its own piece of work

**Files:** `ios/Sources/Ground.swift` (new), applied at every screen root

iOS carries **no ground at all** — no halo, no texture, no wandering mark. Full
spec in `docs/IOS-GROUND.md`; the three constraints that shape it:

1. The gradient lives **behind** the ScrollView and is `.drawingGroup()`'d —
   inside the content it re-rasterises as the content moves.
2. The texture is **one cached tile** fed to
   `Image(uiImage:).resizable(resizingMode: .tile)` — never a `ForEach` of
   ~570 circles.
3. The mark needs three guards: `accessibilityReduceMotion`,
   `isLowPowerModeEnabled`, and the 12s step cadence so the display can idle.

Sheets use an explicit `--surface`, **not `.regularMaterial`** — a system
material samples the hero gradient behind it, which would leak market colour
into a theme surface and break law 1.

Order within the stage: tokens + `RoseShape` → `HaloLayer` → `TextureLayer` →
`WanderingMark` → `.ground()` at every root, deleting per-screen backgrounds as
you go → sheets to §15. **Steps 1–2 are worth shipping alone.**

**Accept:** six-corner sampling matches web's halo lift within ±0.02 (light
ceiling 1.105, dark peak 1.26); a 12-point grid on light has chroma ≥ 0.012 and
hue 25–50°; Instruments shows zero Core Animation commits in a 10s idle window;
with Low Power Mode on, the phase timer does not fire.

**Mutation:** swap the light and dark halo arrays; the hue assertion fails on
light.

---

## Stage 12 — reduced motion · last, and non-negotiable

**Reduced motion means no motion, not less information.** Every rule resolves
instantly rather than partially: the rose still shows its lit count, the tile
bar its share, the list still filters, the band pill still reads AUTO.

This is why breathing, seek and the AUTO pulse are **animations** and every
state change is a **transition** — one class can be killed wholesale without
touching the other. Keep that split; it is load-bearing.

**Accept:** re-run `cycle3.mjs`, `sweep_mockup.mjs`, `cycle3_mobile.py` and
`check_rose.mjs --reduced` with `prefers-reduced-motion: reduce` emulated and
assert **identical information** — same lit-dot counts, same tile bar widths,
same filtered row count, same computed contrast on every band pair.
`getAnimations()` empty document-wide. On Android, the same under *Remove
animations*.

**Mutation:** leave one `animation` outside the reduce block; the
`getAnimations()` assertion fails.

---

## Merge order

```
 0  tokens              blocks all
 1  rose in list        blocks 2
 2  score arrives       the signature moment
 3  three states        independent · cheapest · ship early if anything slips
 4  sector grid (web)   independent
 5  list re-forms       depends on 3
 6  ground bugs         law violations — bugs, not polish
 7  phone header        independent
 8  Android browse      depends on 4's thinking, not its code
 9  empty + refused     independent
10  Android springs     after web is green
11  iOS ground          independent of 1–10; its own piece
12  reduced motion      after everything, before release
```

**If time runs out:** 1, 2, 3, 6, 8. The first two are the signature moment;
the third stops it feeling like a screenshot; 6 is two law violations, one of
which is louder than the halo it breaks; 8 is half a phone screen.

## The checks

| | asserts | mutations |
|---|---|---|
| `check_rose.mjs` | lit count = band, canonical geometry, no clipping, lit ≠ unlit fill | `wrong-band`, `cropped-viewbox` |
| `check_motion.mjs` | three distinct states, exits faster than entries | `press-equals-hover`, `slow-press` |
| `check_halo_ext.mjs` | one ground, warm on light, halo on every route | `section-bg`, `grey-blob`, `kill-halo` |

All three were run against the demos; all pass, all mutations break them, and
two of them found real bugs in the demos they were written for — the NEAR-MISS
track colour and four three-argument `light-dark()` shadows.

Fold `check_halo_ext.mjs` into the existing `check_halo.mjs`.

## One line to keep in your head

> **The static system says what is true. The temporal system says it is alive.
> JobScout has the first and needs the second.**
