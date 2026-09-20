# Changelog for Claude Code — theme v3.1

Everything here is measured from the live site, 2026-09-19/20. Full reasoning
is in `docs/THEME.md`; the section numbers below point at it. Work top to
bottom — 1 and 2 are one-line fixes that account for most of what looks wrong.

**Drop in `css/theme-resolution.css` first.** Every item below assumes those
tokens are loaded. Do not hand-edit hexes into components.

---

## 1. Wire the summary panel to the tokens — §13

**The highest-value item on this list.** The block at the top of `#browse`
("Today's postings are a stretch…" and the what-to-answer cards under it) is a
separate component that never got the tokens. Both themes.

| | measured | should be |
|---|---|---|
| dark ground | `#0f0a2a` | `var(--canvas)` `#0a0524` |
| dark panel | `#100b2f` | `var(--surface)` `#1c1544` |
| dark answer card | `#100b2f`, grey text | `var(--answer-bg)` + `var(--answer-label)` |
| light answer card | `#fffdf9`, `#6e6973` · 5.26:1 | `var(--answer-bg)` + `var(--answer-label)` · 7.75:1 |

Dark page→panel there measures **1.05:1 with no hue difference** — the exact
flatness that started this whole pass, on the one block where it was first
noticed. The job-card grid below it is already correct; this panel is not.

## 2. Make the halo actually site-wide — §14

`body::before` is one rule on one element, but measured per route it renders on
`/browse` and is **entirely absent on `/saved`** — 1.000 at all six corners, in
both themes. It is being applied per page or per layout component.

Find where it is mounted and move it to a single global rule.

While you are there: `/saved` carries a **30×30px dot grid**, `#e7e2dd` on
cream at 1.165:1, light theme only. It is not in the spec and it is *louder*
than the halo it stands in for (1.053:1 at peak). Remove it, or fold it into
the same `body::before` rule as a fourth layer below the halo's amplitude.
Two routes must not have two background systems.

Also nudge dark: measured peak 1.174:1 against a spec of 1.258:1.

## 3. Four control-scale colour fixes — §12.2, §13

Each of these is a hue at control scale that is not a fit band.

| | measured | use |
|---|---|---|
| Search placeholder | `#757575` — **4.61:1** light, **3.68:1** dark, both fail AA | `var(--text-2)` |
| "Apply anyway" | wears `--unsure-label` on a NEAR-MISS card | `var(--action)` |
| "Saved" filter, active | `#4865ff` + white, **4.58:1** | `var(--selected-bg)` / `var(--selected-fg)` |
| Market chip, active | `#e7ebff` light / `#24215c` dark, neither a token | `var(--selected-bg)` / `var(--selected-fg)` |

## 4. The browse card — §12

Three structural fixes, none of them colour-token problems:

- **A grey panel is covering the cream.** The gutter samples `#f8f3eb` (hue
  37°); behind the cards it is `#e8e7ed` (hue 250°). One `--canvas`, no second
  ground.
- **The Remote/On-site pill.** `#4865ff` measures chroma **0.230** — seven
  times anything else on the card, and it is a location tag. "On site" is a
  plain outline, so one field is drawn two ways. Both become `--sunken` +
  `--text-2`, no hue.
- **Inverted hierarchy.** "posted yesterday" is Newsreader, underlined, at
  **19.67:1** — identical to the job title. "what to answer", a signal, sits at
  **4.91:1**. Date drops to 11px sans at `--text-2`; Newsreader is for titles,
  the fit number and display headings only.

## 5. Evidence cards become neutral + accent — §16

**This changes markup, not just tokens.** `--answer-bg` and `--strongest-bg`
are now `var(--evidence-bg)`, a neutral at the surface's own hue. The band
colour moves to a 2px left rule:

```html
<div class="evidence-card evidence-card--answer">
  <div class="evidence-card__label">WHAT TO ANSWER</div>
  <p class="evidence-card__body">…</p>
</div>
```
```css
.evidence-card {
  background: var(--evidence-bg);
  border-left: 2px solid var(--evidence-rule-answer);
  border-radius: var(--radius-inner);
}
.evidence-card--strongest { border-left-color: var(--evidence-rule-strongest); }
```

Why: the same fill served a 70×22px pill and a 440×230px card — the same tint
over **66× the area** on dark, 23× on light. At pill size it is a hint; at card
size it was a brown slab.

**The rule:** a tinted fill is for pill scale. Above roughly 4,000px² a surface
is neutral and the band colour becomes a rule, a label or a small mark. Colour
intensity is not a constant; it is a budget spent over area.

`--auto-fill` / `--unsure-fill` are unchanged and still serve pills.

## 6. Modals become bottom sheets — §15

The cover-letter popup is a desktop dialog on a phone. Seven things:

1. **Scrim at 0.55** leaves the page behind readable at **4.08:1**. A scrim is
   meant to fail contrast. `var(--scrim)` is 0.66 → 2.78:1 light, 2.68:1 dark.
2. **Dialog, not sheet.** Inset on four sides gives a ~600px window *plus* a
   second scrollbar. Use a bottom sheet: full width, ~90% height,
   `var(--radius-sheet)` on the top corners only, flat to the bottom edge.
3. **A raw OS scrollbar** (`#8b8b8b` track) inside a rounded sheet, clipping
   its corner. Style it to `--hairline` at 4px.
4. **No elevation.** `var(--shadow-sheet)` — a sheet casts *upward*. On dark
   there is no shadow, so `var(--sheet-edge)` carries it.
5. **No letterhead.** Name and contact run as body text at body weight.
6. **Buttons backwards.** Close is a wide outlined pill; Copy, the real action,
   is a small pill in the corner. Invert: Close is a 30px `--sunken` icon
   button, Copy is full width in a footer with a `--hairline` above.
7. **Sans title.** `var(--font-serif)` at 20px, plus a 34×4 grab handle.

`demos/sheet-demo.html` is the whole thing, live, in both themes.

## 7. Ember moved — regenerate anything that embeds it

`--unsure` went from `#ff6d39` (OKLCH hue 39) to `#b86b03` / `#e89f59`
(hue 63). Hue 39 sits in the gap between Apple's red (29) and orange (63) —
close enough to red to read as an *error*, which UNSURE is not, and it is the
hue that goes muddy when darkened.

The brand kit, mark SVGs, PNGs and `tokens/brand.{css,json}` in
`jobscout-brand-assets.zip` are already rebuilt. Anything in the app that
hardcodes the old ember needs replacing:

```
#ff6d39 -> #b86b03      #cc3600 -> #713f00      (ember, ember-deep)
#328a3b -> #3e954d      #114e0b -> #225b2c      (forest, meadow)
#5fd07a -> #92d098      #ff9b6f -> #ecaf78      (dark labels)
```

Ember also improves: **2.54:1 → 3.70:1** on cream, so it moves from
"decorative surfaces only" to "large text and fills only".

Leave `#1b1463` (midnight-violet, `--link`) and `#dce4fb` (info) alone — those
are named brand colours, not band tokens.

---

## Two traps

**`light-dark()` takes exactly two arguments.** A multi-part value — two
shadows, a font stack — contains a top-level comma, so it sees three arguments
and **silently drops the whole declaration**. The first symptom is a missing
shadow, not an error. `--shadow-card`, `--shadow-cta` and `--shadow-sheet` all
take real overrides for this reason.

**Set the hue first, then check the contrast.** Never generate a dark fill by
compositing a light one over the surface — that is how all four bands ended up
at the same hue and made a long dark page read as one flat field.

## How to verify

`docs/THEME.md` §8 has eight theme/market states and three behavioural checks.
Then, per route and per theme, read the computed background of a corner of
`<body>` — the halo should lift it 1.05:1 on light and 1.26:1 on dark, and the
same numbers should hold on `/browse` and `/saved` alike.
