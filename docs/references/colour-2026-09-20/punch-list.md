# JobScout colour — punch list after the rebuild

Measured from the live screenshots, 2026-09-19. The dark theme landed exactly:
every band pair matches the spec to two decimals. What remains is one class of
error — **market colour on control-scale elements** — in four new places.

## Blocking

1. **Cover-letter modal link fails AA badly.**
   "Read the whole letter" is `#144d2b` on `#0b100d` — **1.94:1**.
   Fix: `--link` (`#a2baff` on dark). Worst contrast anywhere in the app.

2. **Kenya hero submit button is still `#2fbd6a`.**
   Bright saturated green on a control. Green at that scale means AUTO.
   Canada's equivalent is already correct at `#f8f3eb`. Match it.

3. **The Remote / Hybrid location pill is market-coloured.**
   Canada `#a2baff`, Kenya `#2fbd6a`. This is new and it's worse than the old
   bug, because the pill now sits *inside the card*, inches from the band pill —
   a NEAR-MISS card wearing a green pill. It is a metadata chip, not a signal:
   use `--sunken` with `--text-2`, no hue.

## Should fix

4. **Market still tints the whole page ground.**
   Canada `#1a173a`, Kenya `#102017` / `#132f20`, and the apply modal drifts to
   `#181e1a` (green-black) instead of the token `#16103a`. Market belongs to the
   hero block; ground and surfaces are shared. One `--canvas`, one `--surface`.

5. **The saved heart is `#ff9b6f`.**
   That is ember — the UNSURE band. A saved job should not read as unsure.
   Use `--action` or a neutral.

6. **The period is market-coloured.** Canada `#ff9b6f` (ember, = unsure),
   Kenya `#ef4b3c` (not a kit colour at all). Make it one colour in both, or
   drop it.

## Check, don't assume

7. **Is light mode still there?** Both markets now render dark. If that is
   `prefers-color-scheme` following the OS, it is exactly right. If the cream
   theme was dropped, that is a real loss — cream + Newsreader is what makes
   JobScout look like JobScout, and the whole brand kit is built on it.

## Already correct — do not touch

- `--surface` `#16103a`, `--text` `#f8f3eb`, `--text-2` `#b9b3c4` (8.82:1)
- near-miss `#ddd7e4` on `#1e1a44` — 11.59:1
- ping `#2c2a56`, strongest `#5fd07a` on `#1f2940` — 7.44:1
- what-to-answer `#ff9b6f` on `#36223e` — 6.99:1
- Canada submit `#f8f3eb`; Kenya "Prepare application" cream — 17.53:1
