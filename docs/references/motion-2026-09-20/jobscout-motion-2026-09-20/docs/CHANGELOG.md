# Changelog — motion & material v1

Measured from the 41 stills, 2026-09-20. Reasoning is in `docs/MOTION.md`; the
section numbers point at it. **Drop in `css/motion.css` first** — every item
below assumes those tokens are loaded. It contains no colour decisions, so it
composes with `theme-resolution.css` without touching any of the thirteen laws.

Items 1–3 change how the product *feels*. Items 4–7 make it look considered.
Item 8 is a bug that is currently louder than the halo.

---

## 1. Put the rose in the list — §3

**The highest-value item here.** The score is currently a bare numeral on the
phone mockup, the web list and Android. Sampling the first card in
`mockup-ca-dark.png` returns only `#1c1544` and `#a4bbff` — no rose geometry
anywhere in the score region.

| | now | should be |
|---|---|---|
| web/phone list score | `<span>79</span>` in `--accent` | 44–52px rose + centred mono numeral |
| viewBox at ≥48px | — | `-4.2416 -3.0639 31.3054 31.3054` (display cut) |
| lit dots | — | `= band` (AUTO 8 · PING 6 · UNSURE 5 · NEAR-MISS 3) |
| unlit dots | — | opacity `.16`, scale `.55` — the reader must see what was *not* awarded |

Do not use `0 0 24 24` — it clips every outer dot. Law 9's geometry is
unchanged; only the rendering surface is new.

## 2. Animate the score arriving — §3.1–3.5

Once the rose is in place:

- Fill in **bearing order from 000**, one dot every `--stagger-dot` (46ms), each
  on `--spring-arrive` (520ms, 8.3% overshoot). Eight dots = 368ms.
- The numeral counts up on the same clock, `font-variant-numeric: tabular-nums`,
  seating as the last dot lands.
- **Hover lights the next dot** at opacity `.55`, scale `.86`. One CSS rule; it
  is what teaches that the rose is a quantity.
- Settled roses breathe: lit dots 1 → `.90` → 1 over `--t-breathe` (4.2s),
  offset 260ms per card and 120ms per dot. **The offset is mandatory** — a grid
  pulsing in unison reads as a loading state.
- **AUTO only** gets a 1.05 band-pill pulse, 420ms, once. NEAR-MISS gets
  nothing. Law 12 as motion: celebrating a 32 is the interface lying.

Reference implementation: `demos/rose-demo.html`.

## 3. Give every actionable surface three states — §4

There is exactly one elevation state in the product today (light tile
`#ffffff` on `#f8f2e6`, 1.115:1; dark card `#1c1544` on `#1c1735`, 1.014:1).
No hover, no press, anywhere.

```
rest    --edge-rest    --sh-rest     —
hover   --edge-hover   --sh-hover    translateY(-2px)
press   --edge-hover   --sh-press    scale(.988) @ --t-exit
```

- Press **must** use exit timing. A give that eases in is not a give.
- Press scale by mass: cards `.988`, controls `.96`, the heart `.88`.
- **On dark there are no shadows.** The ladder is the hairline `.13 → .26` plus
  the surface `#1c1544 → #221a52` (1.10:1 — the rung `--surface` already takes
  above `--canvas`; no new colour).

`.u-surface` in `motion.css` is the whole thing if you want it as one class.

## 4. Make the sector grid the distribution — §5

17 tiles, **11 of them reading "24 open"** because 24 is the page cap. 65% of
the grid is the same number and none of the real 4–24 (6×) spread is visible.
On Android this is ~1,100px of identical rectangles before one posting.

- Bar behind each tile at `count / max`, `--tile-fill`, drawn on
  `--spring-settle` 90ms after the tile seats.
- **Sort by count descending.** Alphabetical hides the story.
- Label `24+ of 318`, not `24 open` — law 12; the current label states a capped
  number as the count.
- Tile size stays uniform. Grid discipline is not the problem.

Live in `demos/surfaces-demo.html`.

## 5. Re-form the list on filter change — §6

Out on `--spring-exit` (160ms, 14ms stagger) → in on `--spring-settle` (340ms,
28ms stagger, 10px travel). Roses re-light with a 34ms per-dot stagger layered
on the row delay.

First paint uses the same entry once via `IntersectionObserver`, then
**unobserve**. Re-running on every scroll is what makes scroll animation
obnoxious. Cap the stagger index at 12.

## 6. Section rhythm without a second ground — §7

Delete the section ground (see item 8). Replace the boundary with a full-bleed
`--hairline` plus the section's serif heading rising `--travel-head` (12px)
with a fade, 400ms `--spring-settle`, **once** on first view.

## 7. Give the empty state the seeking rose — §8

The saved-empty screen is a white box with centred text. Put a 96px unlit rose
in it, one bearing lighting and dimming at a time over `--t-seek` (5.6s), 220ms
per-dot offset. One keyframe; turns the emptiest screen into the mark doing its
job.

---

## 8. BUG — a section paints its own ground, and its seam beats the halo

`web-landing-2-ca-light-desktop.png`, column x=1400:

```
hard edge at y=364:   #f3efeb -> #fffdf9   step 1.126:1
```

Law 7: *"One ground, on `<html>` … No page paints its own body ground."* "How
JobScout works" is doing it. The seam measures **1.126:1** against the light
halo's stated ceiling of **1.105:1** — the accidental edge is more visible than
the designed one. Remove the background; item 6 replaces the cue.

## 9. BUG — the decorative circles subtract chroma

Sampling `web-saved-ca-light-desktop.png`:

| region | hex | chroma | hue |
|---|---|---|---|
| plain cream | `#f8f0e3` | 0.019 | 37° |
| inside a circle | `#f3efeb` | 0.007 | 30° |
| **circle overlap** | `#ede8e9` | **0.006** | **348°** |
| halo corner (correct) | `#f9edd9` | 0.029 | 38° |

The halo adds warmth; the circles remove it, and at an overlap they leave the
warm family for 348°. This is the retired `--blob` failure — *"a blob that
darkens instead of a halo that adds light"* is already on the reverted list. It
returned as geometry.

**Fix:** the circles either become part of the halo layer (lighter than the
canvas, in the canvas's hue family, ΔE ≥ 5 per law 7) or they go. Two systems
drawing the same glow is what produced this.

---

## Verify

Add to the existing suite:

- **`check_motion.mjs`** — assert every `.u-surface` has three distinct computed
  `box-shadow`/`border-color` values at rest/hover/press, and that
  `transition-duration` on press ≤ the entry duration. Mutation-test it: flip
  one press rule and the check must fail.
- **`check_rose.mjs`** — for each list item, count `.d.lit` and assert it equals
  the band's dot count; assert the `viewBox` is the display cut at ≥48px.
- **`check_halo.mjs`** (existing) — extend to assert **no element other than
  `html` paints a body-scale background**, which catches items 8 and 9.
- **Reduced motion** — re-run `cycle3.mjs` with
  `prefers-reduced-motion: reduce` emulated and assert identical *information*:
  same lit-dot counts, same tile bar widths, same filtered row count.


---

## 10. The phone header — one row, and it scales

Measured at 390pt. The header wraps to **two rows, 80px**, before any content:

```
  row 1   brand + market pill (flags only, no labels)
  row 2   theme control (3 icons) + "Browse"
```

Three things are wrong and only one of them is the wrap:

- **The market pill drops its labels on phone** — two flags at 24px, and the
  selected one is a white pill. Nothing says which market you are in.
- **The nav is silently truncated** to "Browse". Saved and How it works are
  gone, not collapsed.
- **It breaks past three markets.** Four flags plus padding is ~200px of a
  390pt row, and the segmented control has no overflow behaviour.

**Fixed: one row, 56px.**

```
  [rose] JobScout .................. [🇨🇦 CA]  [⋯]
```

- The market chip is **flag + 2-letter code**, 44pt tall, and opens a sheet
  when there are more than three markets — so it scales without a redesign.
- `⋯` opens a sheet carrying the **full three-state theme control** (law 2 —
  still Light / Device / Dark, at full size where it is easier to hit) plus
  every nav item with its count. Nothing is truncated any more.
- 24px back, and the header stops being a layout with a breaking point.

## 11. Android browse — the sweep starts 81% down the screen

Measured from `android-browse-ca-light.png`, 1080×2400:

| | |
|---|---|
| two-column tile grid | y 430 → ~1140 (**710px**) |
| filter chips, heading, sub-chips, count | → 1940 |
| **first posting card** | **y 1940 of 2400 = 81% down** |

Ten identical tiles, all reading "24 open", occupy half the screen before a
single job. This is item 4's problem with a phone's aspect ratio on top of it.

**Fixed:** the tile grid becomes a **single horizontal scroller of chips**,
sorted by count, with the count inline — `Finance & banking 24+`. 50px instead
of 710. The list starts immediately underneath, and the chip row is sticky so
the filter stays reachable.

```
  first posting   y 1940  ->  y ~461   (19% down instead of 81%)
                  1,479px recovered
```

No information is lost: every sector is still there, still tappable, still
shows its count — it scrolls sideways instead of downwards.

## 12. Empty and refused states — law 12 as a screen

Three states currently have no design. All three are in `demos/phone-demo.html`.

**Saved, empty.** A white box with centred text today. Gets the 84px seeking
rose (item 7): one bearing lighting at a time over 5.6s. The mark doing the
product's job at the exact moment there is no data.

**Rate-limited.** Leads with *what happened and when*, not with a wall:

> **One run an hour, and you used yours at 09:12.**
> The guard is there so a single visitor cannot drain the day's budget.
> Nothing was lost — your last run is still on the saved page.
> **NEXT RUN** `47:08` from now · 10:12

The countdown is mono with tabular figures. Both actions are real routes, not
dead ends: open the last run, or browse the sweep meanwhile.

**Grounded refusal.** Law 12: *a refusal is shown with its reason, never
silently* — and *never lead with what they lack*. So it leads with what the
product **did**, then names the two claims, quoted, with why each failed:

> **The letter was written, then checked.**
> Two of its claims are not in your resume, so it is not being shown as yours.
> Nothing here is a judgement about you — only about what the document says.
>
> **NOT IN THE RESUME**
> 1. "led a team of six engineers" — the resume names no team size.
> 2. "AWS certified" — no certification appears anywhere in the document.

Quoting the exact phrase matters: "2 things your resume does not contain" is
unactionable, and the reader cannot tell whether the model was wrong. The two
actions are rewrite-without, or add-and-re-run — the second one treats the
refusal as possibly the *resume's* omission rather than the reader's failing.
