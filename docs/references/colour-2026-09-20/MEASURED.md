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
