# Two tokens in this bundle do not apply — measured, not read

These are reference files, kept as delivered. Both defects are the same one,
and both are in the files an implementer is most likely to copy from.

## `light-dark()` returns a `<color>`, and nothing else

`light-dark(1px solid transparent, 1px solid rgba(248,243,235,.13))` parses as
a function whose arguments are not colours. The declaration that substitutes it
is invalid at computed-value time, so the property falls back to its initial
value and **nothing at all is applied**.

| file | token | measured |
|---|---|---|
| `theme-resolution.css:132` | `--sheet-edge` | — |
| `sheet-demo.html:17` | `--sheet-edge` | `border-top: 0px none` in **both** themes |
| `halo-demo.html:21` | `--card-border` | `0px none` — cards have no edge in dark |
| `halo-demo.html:22` | `--shadow` | two args, neither a colour — no card shadow in light |

Measured on `sheet-demo.html` with transitions suppressed:

```
light  border-top 0px none   shadow 0 -2px 8px rgba(75,68,57,.06), …
dark   border-top 0px none   shadow none
```

§15.4 gives the sheet its elevation from `--shadow-sheet` in light and from
`--sheet-edge` in dark. In dark the demo has **neither** — the sheet meets the
scrim with no edge. It reads as intended only because `--surface` is lighter
than the scrim.

`jobscout-theme.css` (the two-block version) is **correct**: it declares
`--sheet-edge: 1px solid transparent` in `:root` and overrides it in the dark
block, which is the same pattern `--shadow-sheet` already uses for the same
reason.

## What shipped instead

`site/base.css` carries the edge as a colour, which is what `light-dark()` is
for, and the consumer supplies the width and style:

```css
--sheet-edge: light-dark(transparent, rgba(248,243,235,.13));
/* consumer: */  border: 1px solid var(--sheet-edge);
```

Verified in `mockups/mobile.html`: 1px present in dark, invisible in light.

## The general rule

A multi-part value — a shadow, a border shorthand, a font shorthand — cannot
go through `light-dark()`. Either split the colour out (above), or declare the
light value in `:root` and override it in the two dark blocks. `--shadow-sheet`
already does the second, and its comment says why; `--sheet-edge` sat four
lines below it and did not.

## The light halo cannot be brightness — measured 2026-09-20

`CHANGELOG.md` says to verify the halo by reading a corner of the ground:
"1.05:1 on light and 1.26:1 on dark". Dark is exactly that (1.258). Light was
exactly that too (1.049) and was reported twice, on two routes, as *no halo*.
Both were true, and here is why.

§14 asks for blooms **lighter than the canvas**. On cream that is white on
`#f8f3eb`, and pure white at alpha 1 is **1.105:1** — the entire range is ten
percent, and the spec's 1.053 spends half of it. Composited, the spec bloom is
`#fefbf1`: a perceptual distance of **ΔE 2.9 at its peak**, the just-noticeable
step, *before* the gradient falls off toward the corner. Pushed to pure white
at full opacity it reached 1.070. There was no visible halo available on that
axis.

| light bloom | composite | contrast | ΔE76 (peak) |
|---|---|---|---|
| spec, white .92 | `#fefbf1` | 1.067 | 2.9 |
| pure white 1.0 | `#ffffff` | 1.105 | 6.0 |
| **amber .26 (shipped)** | `#faebd5` | 1.062 | **8.5** |

What shipped: light blooms carry **hue** instead of brightness — amber and
peach at low alpha, a warm glow on warm paper. `--halo-1/2/3` light are
`rgba(255,214,150,.26)`, `rgba(255,206,178,.22)`, `rgba(255,228,176,.24)`.
Measured at the corner: **ΔE 6.0**, luminance contrast 1.047. It reads as
warmth, not as a bright patch. Dark is untouched.

The tool was half the problem. `check_halo.mjs` measured luminance contrast,
which is right for dark and wrong for light: a warm bloom at the canvas's own
lightness is plainly visible and scores ~1.000 on a contrast meter. It now
asserts light on ΔE (≥ 5) and dark on contrast.

**§14 and the "How to verify" paragraph want updating**: the light number to
check is a colour difference, not a lift.
