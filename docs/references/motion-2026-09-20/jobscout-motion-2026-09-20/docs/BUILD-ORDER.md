# Build order — motion & material v1

For Claude Code. Sequenced, with acceptance criteria that are measurable and
mutation-testable. Reasoning lives in `docs/MOTION.md`; the *what* lives in
`docs/CHANGELOG.md`; this file is the *order*, the *files* and the *proof*.

**Read first:** `docs/MOTION.md` §0 and §12, then this file end to end before
touching anything. `css/motion.css` contains no colour token — if a step here
makes you reach for a hex that is not already in `theme-resolution.css`, stop:
the step is wrong.

---

## Ground rules

1. **No law is being changed.** All thirteen in `HANDOVER-design.md` §3 hold.
   If an implementation disagrees with THEME.md, the implementation is wrong.
2. **No new colour.** `motion.css` contains exactly three hexes and all three
   are the dark surface rung reused (`#1c1544 → #221a52`, 1.10:1 — the step
   `--surface` already takes above `--canvas`).
3. **Measure, then mutate.** A check that only asserts presence is rejected.
   Every acceptance criterion below is written so that flipping one rule makes
   it fail. Prove that by flipping it.
4. **One commit per stage.** Each stage lands green on its own checks before
   the next begins. Stages 1–3 are the ones that change how it feels; ship them
   even if 4–8 slip.
5. **Web first, always.** `site/base.css` is the reference implementation.
   Android and iOS follow the numbers in stage 7, not their own judgement.

---

## Stage 0 — land the tokens · blocks everything

**Files:** `site/base.css`

- Append `css/motion.css` to `base.css`, or `@import` it — one file either way,
  because two stylesheets is how the theme drifted before.
- Keep it *below* the colour tokens. It reads `--surface`, `--canvas` and the
  band colours; it defines none of them.

**Accept when**
- `getComputedStyle(document.documentElement).getPropertyValue('--spring-arrive')`
  is non-empty in both themes and both markets.
- `check_palette.py` passes unchanged. Motion adds no colour, so a single
  drift here means something was pasted that should not have been.

**Mutation:** delete one `--spring-*` line; the assertion above must fail.

---

## Stage 1 — the rose enters the list · the highest-value item

**Files:** `site/index.html`, `site/saved.html`, `site/base.css`,
`mockups/mobile.html`

Today the score is a bare numeral. Sampling the score region of the first card
in `mockup-ca-dark.png` returns `#1c1544` and `#a4bbff` and **no rose geometry**
— the device the whole brand kit is built from does not appear anywhere a
reader looks.

- Replace the numeral with the rose + a centred mono numeral. 44px in a list
  row, 52px in a card.
- **viewBox is the display cut:** `-4.2416 -3.0639 31.3054 31.3054`. Computed
  from the true bbox (x −3.041…25.864, y −1.275…26.453) plus 1.2 clear space,
  squared. `0 0 24 24` clips every outer dot — the demo shipped that bug first,
  and `stills/` shows both.
- Geometry unchanged (law 9): ring r=11 in a 24 box, eight bearings,
  r = 2.275 + 0.2944·i clockwise from 000. **The two largest dots touch at
  270/315 on purpose. Do not "fix" them.**
- Lit count **is** the band: AUTO 8 · PING 6 · UNSURE 5 · NEAR-MISS 3.
- Unlit dots stay visible: `opacity .16`, `scale .55`. The reader must be able
  to see what was *not* awarded — a 32 has to look like a 32.
- Numeral: JetBrains Mono, `font-variant-numeric: tabular-nums` (law 13 already
  assigns mono to data).

**Reference:** `demos/rose-demo.html`, the `.rose` block.

**Accept when** — `check_rose.mjs`, new:
- For every list item on browse, saved and the mockup, in both themes and both
  markets: `querySelectorAll('.d.lit').length` equals the band's dot count from
  the table above. Twelve cells minimum.
- Every rose at ≥48px has the display-cut viewBox verbatim.
- No dot's rendered bbox extends outside its `<svg>` rect — this is the clip
  regression, and it is invisible in a diff.

**Mutation:** change one card's band in the DOM without changing its dot count;
the check must fail.

---

## Stage 2 — the score arrives · depends on 1

**Files:** `site/base.css`, `site/app.js` (or wherever scoring resolves),
`mockups/mobile.html`

This is the moment the product sells itself. It happens eight times per run.

- Fill in **bearing order from 000**, one dot every `--stagger-dot` (46ms), each
  on `--spring-arrive` (520ms, 8.3% overshoot). Eight dots = 368ms.
- Numeral counts up on the same clock, cubic-eased, seating on the frame the
  last dot lands. Not a separate timer — they must not drift.
- **Hover lights the next dot** at `opacity .55`, `scale .86`. One rule. It is
  what teaches that the rose is a quantity rather than an ornament.
- Settled roses breathe: lit dots `1 → .90 → 1` over `--t-breathe` (4.2s),
  offset **260ms per card and 120ms per dot**. The offset is not optional — a
  grid pulsing in unison reads as a loading state, which is the opposite of
  what a settled result should say.
- **AUTO only** gets a 1.05 band-pill pulse, 420ms, once. NEAR-MISS gets
  nothing. Law 12 as motion: the celebration is earned or it means nothing, and
  celebrating a 32 is the interface lying to someone having a bad morning.

**Accept when**
- With the clock stubbed, the last dot's transition end and the numeral
  reaching its target land within **one frame (16ms)** of each other.
- `[data-band="auto"]` has a running pill animation after settle;
  `[data-band="near"]` has none. Assert on `getAnimations()`, not on a class.
- Breathing animation `delay` values are pairwise distinct across a grid of
  three or more cards.

**Mutation:** set both offsets to 0; the distinctness assertion must fail.

---

## Stage 3 — every actionable surface gets three states

**Files:** `site/base.css`, `mockups/mobile.html`

There is exactly one elevation state in the product today: light tile `#ffffff`
on `#f8f2e6` (1.115:1), dark card `#1c1544` on `#1c1735` (1.014:1). No hover,
no press, anywhere. **A hover with no press state is the single most common
reason an interface feels like a picture of an interface**, and this is the
cheapest item on the list.

Use `.u-surface` from `motion.css` or inline the same three rules:

```
rest    --edge-rest    --sh-rest     —
hover   --edge-hover   --sh-hover    translateY(-2px)
press   --edge-hover   --sh-press    scale(.988)  @ --t-exit
```

- Press **must** use exit timing. A give that eases in is not a give.
- Press scale by mass: cards `.988`, controls `.96`, the heart `.88`. A small
  control needs a larger scale to register the same felt give.
- **On dark there are no shadows** (§10 — a warm shadow on ink reads as dirt).
  The dark ladder is the hairline `.13 → .26` plus the surface
  `#1c1544 → #221a52`. No new colour; the existing rung reused.

Apply to: job cards, sector tiles, list rows, both buttons, the heart, filter
chips, market pills, theme segments.

**Accept when** — `check_motion.mjs`, new:
- For every `.u-surface` and every control listed above, the computed
  `box-shadow` **and** `border-color` are three distinct values across
  rest/hover/press. Distinct, not merely present.
- `transition-duration` on `:active` ≤ the entry duration for that element.
  This is the asymmetry law and it is the one people get backwards.
- In dark, all three `box-shadow` values are `none` and the three
  `border-color` values are still distinct.

**Mutation:** make hover and press shadows equal; the distinctness check must
fail.

---

## Stage 4 — the sector grid becomes the distribution

**Files:** `site/index.html`, `site/base.css`, the sector count source

17 tiles, **11 reading "24 open"** because 24 is a page cap. 65% of the grid is
the same number and none of the real 4–24 (6×) spread is visible. On Android
this is ~1,100px of identical rectangles before a single posting.

- Bar behind each tile at `count / max`, `--tile-fill`, drawn on
  `--spring-settle` **90ms after the tile seats** (so the tile arrives, then the
  data fills — not both at once).
- **Sort by count descending.** Alphabetical hides the story.
- Label `24+ of 318`, not `24 open`. Law 12 — the current label states a capped
  number as if it were the count.
- **Tile size stays uniform.** Grid discipline is not the problem; the missing
  encoding is.

§16 governs the fill colour: a tile is a large surface, so `--tile-fill` is
`rgba(72,101,255,.085)` light / `rgba(162,186,255,.10)` dark — near-neutral,
nowhere near band strength. It is a quantity, not a signal, and it must never
compete with a band pill.

**Reference:** `demos/surfaces-demo.html`.

**Accept when**
- For every tile, `getBoundingClientRect().width` of the bar ÷ the tile width
  equals `count / max` within **±1%**.
- Tiles are in descending count order in the DOM.
- No tile's label matches `/^\d+ open$/`.

**Mutation:** swap two tiles' counts without moving them; the ordering check
must fail.

---

## Stage 5 — lists re-form

**Files:** `site/index.html`, `site/base.css`, `site/app.js`

- Filter change: out on `--spring-exit` (160ms, 14ms stagger) → in on
  `--spring-settle` (340ms, 28ms stagger, 10px travel).
- Roses re-light with a 34ms per-dot stagger layered on the row delay.
- First paint uses the same entry **once** via `IntersectionObserver`, then
  `unobserve`. Re-running on every scroll is what makes scroll animation
  obnoxious.
- **Cap the stagger index at 12.** Past ~400ms of total stagger the last item
  feels forgotten.

**Accept when**
- Scroll a filtered list out of view and back; no row replays its entry.
  Assert `getAnimations()` is empty on a row already marked in.
- The 13th row's `transition-delay` equals the 12th's.

**Mutation:** remove the `unobserve`; the replay check must fail.

---

## Stage 6 — the two ground bugs

**Files:** `site/index.html`, `site/base.css`

### 6a — a section paints its own ground

`web-landing-2-ca-light-desktop.png`, column x=1400:

```
hard edge at y=364:   #f3efeb -> #fffdf9   step 1.126:1
```

Law 7: *"One ground, on `<html>` … No page paints its own body ground (saved
and privacy once did and buried the halo)."* "How JobScout works" is doing it
now, and at **1.126:1** the seam is a larger step than the light halo's own
stated ceiling of **1.105:1** — the accident is more visible than the design.

Remove the background. Replace the boundary with a full-bleed `--hairline` plus
the section's serif heading rising `--travel-head` (12px) with a fade, 400ms on
`--spring-settle`, **once** on first view. That is a stronger cue than the seam
and it competes with nothing.

### 6b — the decorative circles subtract chroma

Sampling `web-saved-ca-light-desktop.png`:

| region | hex | chroma | hue |
|---|---|---|---|
| plain cream | `#f8f0e3` | 0.019 | 37° |
| inside a circle | `#f3efeb` | 0.007 | 30° |
| **circle overlap** | `#ede8e9` | **0.006** | **348°** |
| halo corner (correct) | `#f9edd9` | 0.029 | 38° |

The halo adds warmth; the circles remove it, and at an overlap they leave the
warm family entirely for 348°. This is the retired `--blob` failure — *"a blob
that darkens instead of a halo that adds light"* is already on the reverted
list in `HANDOVER-design.md` §6. It returned as geometry.

**Fix:** the circles either join the halo layer — lighter than the canvas, in
the canvas's hue family, ΔE ≥ 5 per law 7 — or they go. Two systems drawing the
same glow is what produced this.

**Accept when** — extend `check_halo.mjs`:
- **No element other than `html` paints a background covering >50% of the
  viewport.** One assertion, catches both 6a and 6b and anything like them
  later.
- Sampling a 12-point grid across the light page, every sample has chroma ≥
  0.012 and hue within 25–50°. The 348° overlap must be impossible.

**Mutation:** re-add the section background; the >50% check must fail.

---

## Stage 7 — Android, then iOS · depends on 0–6 being green on web

**Files:** `android/app/src/main/java/trade/tbot/jobscout/{Tokens,Theme,Rose,MainActivity,Apply}.kt`,
then `ios/Sources/`

Compose and SwiftUI cannot consume `linear()`. **Do not eyeball an equivalent
and do not substitute Compose's named stiffness constants** — the durations
stop matching the web and the two clients drift, which is the exact failure
`check_palette.py` exists to prevent for colour.

Derived from the same damped-spring parameters (ω = 2π/T, k = ω², unit mass):

| token | duration | ζ | Compose | SwiftUI |
|---|---|---|---|---|
| `snap` | 180ms | 0.72 | `spring(dampingRatio = 0.72f, stiffness = 1218f)` | `.spring(response: 0.180, dampingFraction: 0.72)` |
| `settle` | 340ms | 1.00 | `spring(dampingRatio = 1.00f, stiffness = 342f)` | `.spring(response: 0.340, dampingFraction: 1.00)` |
| `arrive` | 520ms | 0.62 | `spring(dampingRatio = 0.62f, stiffness = 146f)` | `.spring(response: 0.520, dampingFraction: 0.62)` |
| `exit` | 160ms | — | `tween(160, easing = CubicBezierEasing(0.4f, 0f, 1f, 1f))` | `.easeIn(duration: 0.16)` |

SwiftUI's `response` **is** the natural period, so it equals the CSS duration
directly. These live in `reference/springs-crossplatform.json`.

Android specifics:
- `Rose.kt` already draws the canonical geometry — add the staggered fill and
  the breathe. Keep `Modifier.ground()`'s stepped wander (1.2s every 12s) as
  it is; law 8 tuned it so the window idles.
- Stage 4's tile bar matters more here than on web: the two-column grid is what
  pushes the sweep list off-screen.
- Press: Compose has no `:active`. Use `interactionSource.collectIsPressedAsState()`
  and animate `scale` on `--t-exit` timing.

iOS carries **no ground at all** today (law 8, and §5 of the handover). That is
its own piece of work — the halo, the 24px texture and the wandering mark as
SwiftUI-drawable. It is out of scope for this build order; land the springs and
the rose first so the two clients share a clock.

**Accept when**
- `check_palette.py` extended: assert the four durations and four damping
  ratios match between `base.css` and `Tokens.kt` within 1ms / 0.01.
- An emulator capture of a scoring run shows the same lit-dot counts as web for
  the same fixture.

---

## Stage 8 — reduced motion · last, and non-negotiable

**Reduced motion means no motion, not less information.**

Every rule above must resolve instantly rather than partially: the rose still
shows its lit count, the tile bar still shows its share, the list still
filters, the band pill still reads AUTO.

This is why the breathing, the seek and the AUTO pulse are **animations** and
every state change is a **transition** — one class can be killed wholesale
without touching the other. Keep that split; it is load-bearing.

**Accept when**
- Re-run `cycle3.mjs`, `sweep_mockup.mjs` and `cycle3_mobile.py` with
  `prefers-reduced-motion: reduce` emulated. Assert **identical information**:
  same lit-dot counts, same tile bar widths, same filtered row count, same
  computed contrast on every band pair.
- `getAnimations()` returns empty document-wide.
- On Android, the same under *Remove animations* in Developer options.

**Mutation:** leave one `animation` outside the reduce block; the
`getAnimations()` assertion must fail.

---

## Order of merge

```
0  tokens            blocks all
1  rose in list      blocks 2
2  score arrives     the moment the product sells itself
3  three states      independent; cheapest; ship early if anything slips
4  sector grid       independent
5  list re-forms     depends on 3 for the surface states
6  ground bugs       independent; 6a is a law violation, treat as a bug not a polish
7  Android, iOS      after web is green
8  reduced motion    after everything, before release
```

**If time runs out:** 1, 2, 3 and 6a. The first two are the product's signature
moment; the third is what stops it feeling like a screenshot; 6a is a law
violation that is currently more visible than the halo it breaks.

## One line to keep in your head

> **The static system says what is true. The temporal system says it is alive.
> JobScout has the first and needs the second.**
