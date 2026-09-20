# JobScout — theme and market. The complete specification.

Put this at `docs/THEME.md`. It is the single source of truth for how the app
decides what colour anything is. If an implementation disagrees with this file,
the implementation is wrong.

---

## 0. The one paragraph

JobScout has **two completely independent settings**. `market` says whose job
board you are looking at. `theme` says whether the screen is light or dark.
They do not know about each other. They never have. A Kenyan user in light mode
and a Canadian user in dark mode are both normal, expected, correct states.
**Market changes exactly one thing: the hero gradient.** **Theme changes
everything except the hero gradient.**

---

## 1. The two axes

```
              THEME  ──────────────────────────────►
                     light                    dark
   M   ca      Canada + light           Canada + dark
   A
   R   ke      Kenya  + light           Kenya  + dark
   K
   E   us      (inherits Canada's hero — see §7)
   T   uk      (inherits Canada's hero — see §7)
    │
    ▼
```

All four cells are valid. None is an error state. None is a fallback. If the
code contains anything resembling `if (market === 'ke') useDarkTheme()`, delete
it — that line is the entire bug.

### Axis 1 — `market`

* Values: `ca`, `ke`, and later `us`, `uk`.
* Set by: which domain the user is on, or the market switcher in the header.
* Persisted: by domain (`nairobi.jobscout.page` = `ke`) or in `localStorage`.
* **Controls exactly one token: `--hero`.** That is the whole list.

### Axis 2 — `theme`

* Values: `system` (default), `light`, `dark`.
* Set by: the operating system, unless the reader has chosen an override.
* Persisted: `localStorage['jobscout.theme']`, absent when following the system.
* **Controls every other colour token.** Grounds, surfaces, text, actions,
  bands, borders, shadows.

---

## 2. Truth table

`<html>` carries both attributes. `data-theme` is **absent** when following the
system — absence is meaningful, it is not the same as `data-theme="light"`.

| `data-market` | `data-theme` | OS is | Result |
|---|---|---|---|
| `ca` | *(absent)* | light | Canada, light |
| `ca` | *(absent)* | dark  | Canada, dark |
| `ca` | `light` | either | Canada, light |
| `ca` | `dark`  | either | Canada, dark |
| `ke` | *(absent)* | light | **Kenya, light** ← this state must work |
| `ke` | *(absent)* | dark  | Kenya, dark |
| `ke` | `light` | either | **Kenya, light** ← and this one |
| `ke` | `dark`  | either | Kenya, dark |

The two rows marked are the ones every previous attempt has got wrong. Kenya in
light mode is a cream page with a dark green hero on it. It is not a dark page.

---

## 3. What each axis controls — exhaustively

### `market` controls

| Token | `ca` | `ke` |
|---|---|---|
| `--hero` | indigo bloom over midnight-violet → deep-ink | meadow bloom over deep forest → deep-ink |

That is the complete list. One token.

The active chip in the market switcher also reads as selected, but it does that
with `--selected-bg` / `--selected-fg`, which are **theme** tokens, not market
tokens. The market does not colour its own chip.

### `market` does NOT control

- the page ground
- any card, panel, field or modal surface
- any text colour
- any button
- any band colour (auto / ping / unsure / near-miss)
- any border, hairline or shadow
- the theme

If a market attribute is changing any of the above, that is the bug.

### `theme` controls

Everything else. `--canvas`, `--surface`, `--sunken`, `--text`, `--text-2`,
`--action`, `--action-on`, `--brand`, `--link`, the four band label/fill pairs,
the evidence-card colours, `--hairline`, `--shadow-card`, `--card-border`.

### `theme` does NOT control

- `--hero`. **The hero is always dark, in both themes.** Its text is always
  cream. A cream page in light mode has a dark hero block sitting on it. This
  is deliberate and it is not a bug to "fix".

---

## 4. Where you are now — measured, not guessed

Sampled from the live pages on 2026-09-19.

### Already correct — do not touch

| Region | Canada | Kenya | |
|---|---|---|---|
| page ground | `#0a0524` | `#0a0524` | shared ✓ |
| card / field surface | `#16103a` | `#16103a` | shared ✓ (lifting to `#1c1544` — §10) |
| submit button | `#f8f3eb` | `#f8f3eb` | shared ✓ |
| hero centre | `#131244` | `#0b1e15` | differs ✓ |

**The market axis is done.** Both markets share every surface and differ only in
the hero. The green submit button is gone. Do not refactor this part.

### The one thing left

The light theme never renders. `--canvas` is `#0a0524` in every screenshot; the
light value `#f8f3eb` never appears.

**Diagnose before you change anything.** The browser chrome in those screenshots
is dark, so the OS is in dark mode. Two very different causes:

1. **The CSS is correct and there is simply no toggle.** The site follows the OS,
   the OS says dark, so it renders dark — correctly. Light is unreachable, not
   broken. **Fix: build the toggle (§6). Change no CSS.**
2. **Something forces dark.** A hardcoded `data-theme="dark"`, a `color-scheme:
   dark` on `:root`, or an old dark-only stylesheet loading after the tokens.

Check cause 1 first. In DevTools, set `<html data-theme="light">` by hand.

* Page turns cream → **cause 1.** The CSS is fine. Build the toggle.
* Page stays dark → **cause 2.** Find what is overriding, then build the toggle.

---

## 5. Implementation

### 5.1 The attributes

```html
<html lang="en" data-market="ke">                    <!-- follows the OS -->
<html lang="en" data-market="ke" data-theme="light"> <!-- forced light -->
<html lang="en" data-market="ke" data-theme="dark">  <!-- forced dark -->
```

Both attributes live on `<html>`. Never on `<body>`, never on a wrapper div —
the head script has to set the theme before `<body>` exists.

### 5.2 The tokens

Use `theme-resolution.css`. Every colour is `light-dark(light, dark)`, defined
once, so the two themes cannot drift apart. It requires `color-scheme: light
dark` on `:root` — without that, `light-dark()` silently returns the light value
and dark mode dies.

```css
:root { color-scheme: light dark; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark;  }
```

Market is separate and additive:

```css
[data-market]      { --hero: /* the brand hero, the default for all markets */ }
[data-market="ke"] { --hero: /* the Kenya hero */ }
```

Note `[data-market]` with no value — every market inherits the brand hero, and
only Kenya overrides it. Adding `us` or `uk` needs no CSS at all.

### 5.3 The head script

Inline in `<head>`, **before any stylesheet**. Without it, a reader who forced
light gets a dark flash on every page load.

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('jobscout.theme');
      if (t === 'light' || t === 'dark') {
        document.documentElement.setAttribute('data-theme', t);
      }
    } catch (e) {}
  })();
</script>
```

Note what it does **not** do: it does not read the OS, and it does not set
`data-theme` when there is no stored choice. CSS handles the system case. If
this script ever writes `'dark'` because the OS is dark, the reader can never
get back to "follow the system".

### 5.4 Setting each axis

```js
function setTheme(choice) {          // 'system' | 'light' | 'dark'
  var el = document.documentElement;
  if (choice === 'system') {
    el.removeAttribute('data-theme');                        // absence = system
    try { localStorage.removeItem('jobscout.theme'); } catch (e) {}
  } else {
    el.setAttribute('data-theme', choice);
    try { localStorage.setItem('jobscout.theme', choice); } catch (e) {}
  }
}

function setMarket(m) {              // 'ca' | 'ke' | 'us' | 'uk'
  document.documentElement.setAttribute('data-market', m);
  // Deliberately does NOT touch data-theme. Ever.
}
```

`setMarket` containing any reference to theme is the bug returning.

---

## 6. The toggle is a required feature

Three states, not a switch. A two-state switch cannot express "follow the
system", and that is the default, so a switch makes the default unreachable.

```
  ( ) System     ( ) Light     ( ) Dark
```

Put it in the header next to the market switcher, or in a settings menu. Until
it exists, nobody on a dark-mode OS can ever see the light theme, which is what
made this look broken.

---

## 7. Adding US and UK

```css
/* nothing to write — they inherit [data-market]'s brand hero */
```

Add the name and flag to the switcher, the region rule to `publish_feed.py`, and
the source roster. No colour work. A market gets its own hero only when it has
its own domain and its own pitch — today that is Kenya, and only Kenya.

Past three markets the segmented pill stops working; make it a menu.

---

## 8. Test cases

Run all eight. Read the computed background of `<body>` in DevTools.

| # | `data-market` | `data-theme` | OS | Expected `--canvas` | Expected hero |
|---|---|---|---|---|---|
| 1 | `ca` | absent | light | `#f8f3eb` | indigo |
| 2 | `ca` | absent | dark  | `#0a0524` | indigo |
| 3 | `ca` | `light` | dark | `#f8f3eb` | indigo |
| 4 | `ca` | `dark`  | light | `#0a0524` | indigo |
| 5 | `ke` | absent | light | `#f8f3eb` | green |
| 6 | `ke` | absent | dark  | `#0a0524` | green |
| 7 | `ke` | `light` | dark | `#f8f3eb` | green |
| 8 | `ke` | `dark`  | light | `#0a0524` | green |

Plus three behavioural checks:

9. Switch market `ca` → `ke` while in light. **The page stays light.** Only the
   hero changes colour. If the page darkens, `setMarket` is touching theme.
10. Choose Light, reload. Still light, with no dark flash on first paint.
11. Choose System while the OS is dark → dark. Change the OS to light with the
    tab open → the page turns light live, no reload. If it does not, something
    is caching the resolved theme instead of letting CSS decide.

Toggle the OS theme in macOS System Settings ▸ Appearance, or in DevTools ▸
Rendering ▸ *Emulate CSS prefers-color-scheme*.

---

## 9. Anti-patterns — each of these has already happened

| Anti-pattern | Symptom |
|---|---|
| `if (market === 'ke') theme = 'dark'` | Kenya can never be light. |
| Market tints the page ground | The two markets look like two apps. |
| Market colours a button or pill | Green on a control reads as the AUTO band. |
| Hardcoded `data-theme="dark"` on `<html>` | Light is unreachable; looks "broken". |
| Head script writes `'dark'` when the OS is dark | "Follow the system" is lost forever after one load. |
| Two-state toggle | No way back to System, which is the default. |
| Theme tokens duplicated in two CSS blocks | The two themes drift; one gets updated, the other does not. |
| A second dark-only stylesheet after the tokens | Overrides everything; light dies silently. |
| Theming the hero | The hero is always dark. Leave it. |
| `color-scheme` missing from `:root` | `light-dark()` returns light always; dark mode dies. |

---

## 10. Dark, on a page that is mostly text

A long dark page was reading as one flat field. The instinct is to brighten the
cards. That is the wrong fix, and the measurements say why.

### It was never brightness

```
Dark, as shipped                     Light, which reads fine
  page  -> card    1.05:1              canvas  -> surface    1.10:1
  page  -> panel   1.16:1              surface -> strongest  1.15:1
  panel -> tint    1.05:1              surface -> answer     1.17:1
```

The steps are the same size. Light separates its surfaces by **hue**:

```
LIGHT                                 DARK, as shipped
  surface    #ffffff  hue   0°          page   #0a0524  hue 250°
  strongest  #e8f2e6  hue 110°          panel  #16103a  hue 249°
  answer     #fdeadf  hue  22°          tint   #100b2f  hue 248°
  ping       #dce4fb  hue 225°
```

Four hues became one. That is the whole bug.

**This spec's own dark values were part of it.** `--auto-fill: #1f2940` measures
hue 222° — that is blue, not green. `--unsure-fill: #36223e` is 283°, a purple
where ember should be. They were derived by compositing a low-alpha tint over
the purple surface, and the surface dragged every hue back to itself. Corrected
values are in `jobscout-theme.css` and `theme-resolution.css`:

| Token | was | now | hue | label | body |
|---|---|---|---|---|---|
| `--auto-fill` / `--strongest-bg` | `#1f2940` | `#1d3521` | 130° | 6.81:1 | 9.16:1 |
| `--unsure-fill` / `--answer-bg` | `#36223e` | `#3d2b1f` | 24° | 6.50:1 | 8.93:1 |
| `--ping-fill` / `--selected-bg` | `#2c2a56` | `#2a2c41` | 235° | 7.17:1 | 9.90:1 |
| `--nearmiss-fill` | `#1e1a44` | `#211d3d` | neutral | 11.40:1 | — |
| `--surface` | `#16103a` | `#1c1544` | 249° | — | — |

Everything still passes AA by the same margin it did before. Nothing traded
contrast for looks. **Set the hue first, then check the contrast** — never
generate a dark fill by compositing a light one over the surface.

### Two smaller things on the same page

**Halation.** Display and lead text measured 16.26–17.93:1 against the ground.
That is fine for a heading and tiring for four paragraphs: at that ratio white
text on near-black bleeds at the edges. Runs of prose use `--text-long`
(`#ded9e8`, 14.33:1 — still far above AA). Headings, emphasis and single-line
labels keep `--text`.

**Nothing breaks the run.** A wall of paragraphs at one size needs anchors. On
the apply page: the fit number set large in Newsreader beside the lead, a
hairline rule plus a small-caps label before the evidence cards, and the cards
themselves carrying their band hue. These are the light theme's devices; dark
just stopped using them.

### The rule, generalised

> Dark separates by **hue and hairline**. Light separates by **hue and shadow**.
> Neither separates by brightness — there is not enough room at either end.

---

## 11. The band ramp — where every band colour comes from

The four band colours are **not picked one at a time.** They are one ramp.
Each rung below fixes an OKLCH lightness and chroma; the bands differ only in
hue, and light and dark are the same hue seen from opposite ends.

```
  rung          L      C          rung          L      C
  light-fill  0.955  0.022        dark-fill   0.305  0.038
  light-label 0.420  0.096        dark-label  0.800  0.101
  light-body  0.430  0.020        dark-body   0.865  0.016
  solid-l     0.600  0.136        solid-d     0.760  0.122

  hue:  auto 147°   ping 270°   unsure 63°   near-miss 285° @ 28% chroma
```

| Band | hue | light fill | light label | AA | dark fill | dark label | AA |
|---|---|---|---|---|---|---|---|
| AUTO | 147° | `#e7f4e8` | `#225b2c` | 7.11 | `#223424` | `#92d098` | 7.38 |
| PING | 270° | `#eaf0ff` | `#394981` | 7.53 | `#272e42` | `#a4bbff` | 7.15 |
| UNSURE | 63° | `#fbede1` | `#713f00` | 7.58 | `#3d2b1a` | `#ecaf78` | 7.04 |
| NEAR-MISS | 285° | `#eff0f4` | `#4b4b5c` | 7.50 | `#2e2e34` | `#bbbcd0` | 7.21 |

Everything lands between 7.04 and 7.58:1. **That evenness is the point.** The
previous set was not a set: the UNSURE label sat at lightness 0.53 while PING
sat at 0.27 — twice as bright, and more saturated with it — so ember read as
the loud one and near-miss read as an afterthought.

**Ember moved from hue 39° to 63°.** Hue 39 falls in the gap between Apple's
red (29°) and orange (63°): near enough to red to read as an *error*, which
UNSURE is not, and it is the hue that turns to mud when darkened — that is
where the old `#3d2b1f` came from. At 63° it darkens to a clean amber.

Dark chroma is 0.038, chosen against 0.028 / 0.048 / 0.058 / 0.070 rendered
side by side. Below it the four hues stop being tellable apart and §10's
flatness returns; above it the cards become heavy blocks of colour.

### Adding or changing a band colour

Pick a **hue**. Read the lightness and chroma off the table. Do not pick a
hex, do not tint an existing colour, do not composite. If a band needs to be
more visible, that is a size or a weight or a border change — never a brighter
colour, because brightening one band is what breaks the set.

`--link` is deliberately **not** `--ping-label`. A band pill is sized to sit
quietly at 7.5:1; a body link is read at length and takes `#1b1463` at 14.3:1.
Different jobs, different colours.

> **Note for the brand kit:** the mark's lit UNSURE bearings use `--unsure`,
> which moved from `#ff6d39` to `#b86b03` / `#e89f59`. The kit PDFs and the
> exported assets still carry the old ember and need regenerating.

---

## 12. Three structural fixes on the browse page

Sampled from the live light page, 2026-09-20. The ramp in §11 fixes the band
colours. These three are not colour-token problems and the ramp will not touch
them — but they are doing more visible damage than the colours were.

### 12.1 A grey panel is covering the cream

The right-hand gutter samples `#f8f3eb` — the real cream, hue 37°. Behind the
cards it samples `#e8e7ed`, hue 250°, a cool grey. The warm ground exists; a
grey panel sits on top of it exactly where the content is.

**Fix:** the card region uses `--canvas`. There is no second ground. Warm cream
under warm-brown shadows is the whole reason the light theme looks like
JobScout, and right now it is only visible at the edges.

### 12.2 The loudest thing on the card is metadata

| Element | chroma |
|---|---|
| **Remote pill `#4865ff`** | **0.230** |
| ping fill | 0.032 |
| what-to-answer fill | 0.025 |
| strongest fill | 0.019 |
| near-miss fill | 0.011 |

The location tag is **seven times** more saturated than the fit band sitting
directly above it, and it fails AA at 4.58:1 besides. "On site" is a plain
outline, so one field is drawn two entirely different ways.

**Fix:** both become the same neutral chip — `--sunken` with `--text-2`,
5.78:1, no hue. Location is metadata. Only the fit band gets hue.

This is the same error as the Kenya submit button and the market-tinted page:
**a hue at control scale that is not a band.**

### 12.3 The hierarchy is upside down

| Element | contrast | should be |
|---|---|---|
| job title | 19.67:1 | ✓ |
| "posted yesterday" — Newsreader, underlined | **19.67:1** | 7.23:1, small sans |
| "what to answer" — a signal | **4.91:1** | 7.58:1 |

The date is set in the display serif, underlined, at the same weight as the
title it sits under. The evidence chip — which is the product — is the faintest
thing on the card.

**Fix:** the date drops to `--text-2` at 11px sans. Newsreader is for titles,
the fit number, and display headings. Nothing else. The evidence chips come up
to the ramp's 7.5:1 automatically.

---

## 13. What landed, and what the tokens never reached

Sampled from the live pages, 2026-09-20. **The ramp landed exactly** — in the
job-card grid, both themes, every pill matches §11 to two decimals:

| | light | dark |
|---|---|---|
| strongest | `#e7f4e8` / `#225b2c` · **7.11** | `#223424` / `#92d098` · **7.38** |
| what to answer | `#fbede1` / `#713f00` · **7.58** | `#3d2b1a` / `#ecaf78` · **7.04** |
| near-miss | `#eff0f4` / `#4b4b5c` · **7.50** | `#2e2e34` / `#bbbcd0` · **7.21** |
| ground / card | `#f8f3eb` / `#ffffff` | `#0a0524` / `#1c1544` |

The cream is back, the grey panel is gone, and the Remote chip is neutral in
both themes. §12.1 and §12.2 are done.

### The summary panel never got the tokens

The block at the top of `#browse` — "Today's postings are a stretch…" and the
what-to-answer cards under it — is still on the old values in **both** themes:

| | measured | should be |
|---|---|---|
| dark ground | `#0f0a2a` | `#0a0524` |
| dark panel | `#100b2f` | `#1c1544` |
| dark answer card | `#100b2f`, grey text | `#3d2b1a` / `#ecaf78` |
| light panel | `#ffffff` ✓ | ✓ |
| light answer card | `#fffdf9`, `#6e6973` · 5.26 | `#fbede1` / `#713f00` · 7.58 |

Dark page→panel there measures **1.05:1** with zero hue difference — which is
exactly §10's flatness, on the one block where it was first noticed. It is a
separate component and the tokens were never wired into it.

### Four smaller misses

1. **Search placeholder** is `#757575`: **4.61:1** on light, **3.68:1** on
   dark. Both fail AA. Use `--text-2`.
2. **"Apply anyway"** wears `--unsure-label` on a NEAR-MISS card — a band hue
   on a control, and the wrong band. It is a button: `--action`.
3. **"Saved" filter, active** is `#4865ff` with white, **4.58:1**. Same error
   as the old Remote pill. Use `--selected-bg` / `--selected-fg`.
4. **Market chip, active** is `#e7ebff` light / `#24215c` dark. Neither is a
   token; `--selected-bg` is `#eaf0ff` / `#272e42`.

---

## 14. The halo

One fixed layer behind the whole site. The CSS is at the foot of
`theme-resolution.css`; this is why it is built that way.

### A halo adds light

`--blob` was `rgba(72,101,255,.05)` — brand indigo painted over the ground.
Indigo is far darker than cream, so every bloom came out a grey smudge:

```
  #4865ff at 5% over #f8f3eb  ->  #efecec
  cream    L 0.966  C 0.012  hue 37°
  haloed   L 0.945  C 0.003  hue  0°
  it DARKENS 1.06:1 and kills the hue
```

That is the `#f8f3eb` / `#f2eeec` patchwork on the live light page — the
ground reads blotchy because the glow is a shadow.

**The rule: every bloom is lighter than the canvas, and in the canvas's own
hue family.** Warm on cream, indigo on ink. Cool blooms on cream turn it grey
even when they are lighter — a light-but-cool halo swings the hue to 180°.

### One layer, fixed

```css
html { background: var(--canvas); }
body { background: transparent; }

body::before {
  content: ""; position: fixed; inset: 0;
  z-index: -1; pointer-events: none;
  background:
    radial-gradient(62% 48% at 88%  2%, var(--halo-1) 0%, transparent 64%),
    radial-gradient(54% 42% at  2% 30%, var(--halo-2) 0%, transparent 62%),
    radial-gradient(70% 52% at 74% 92%, var(--halo-3) 0%, transparent 66%);
}
```

The ground moves to `<html>` so `body::before` can sit behind body's own box.

| Do | Don't |
|---|---|
| One fixed layer for the site | A gradient per section — they seam where sections meet |
| `position: fixed` | `background-attachment: fixed` — repaints on scroll |
| `radial-gradient` | `filter: blur()` on a big element — expensive every frame |
| `z-index: -1`, `pointer-events: none` | Positive z-index — it will cover the header |
| Let cards paint their own ground | Making cards translucent so the halo shows through |

Nothing else needs a z-index. The halo is at -1; everything in normal flow is
above it. The hero, cards, modals and header all paint over it normally.

### Verifying it is actually on

Measured per page, per theme, 2026-09-20. **`/browse` has it; `/saved` does not.**

| | top-L | top-R | mid-L | mid-R | bot-L | bot-R |
|---|---|---|---|---|---|---|
| browse · light | 1.000 | **1.051** | 1.017 | 1.000 | 1.000 | 1.034 |
| browse · dark | 1.007 | **1.174** | 1.042 | 1.000 | 1.000 | 1.064 |
| saved · light | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| saved · dark | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |

Median of each corner against the flat canvas; spec peak is 1.053 light and
1.258 dark. Browse light lands on spec, browse dark at about 70% of it. Saved
is 1.000 at every corner in both themes — the layer is not there at all.

**This is the failure §14 is written to prevent.** `body::before` is one rule
on one element; if it reaches one route and not another, the halo is being
applied per page or per layout component rather than once, globally.

### Saved has a different background instead

A **30×30px dot grid**, `#e7e2dd` on cream — **1.165:1**. Light theme only;
the dark saved margin has four unique colours in the entire left gutter.

It is not in this spec, and it is **louder than the halo it stands in for**
(1.053:1 at peak). Two routes, two background systems, and the noisier one is
winning. Pick one: the halo, site-wide, on `body::before`. If the dot grid is
wanted as well it becomes a fourth layer in that same rule, at an amplitude
below the halo's — not a per-page background.

---

### 14b. The page mark, pinned with the halo

The eight-dot rose behind the browse view is part of the ground, not of the
page: `position:fixed` at the viewport's centre, `z-index:-1` inside the
page's stacking context, above the halo and below every card, on every
route including `/saved` and the landing. It wanders on a 48s figure — a
few percent each way with a breath and a lean — and holds still under
`prefers-reduced-motion`. One rule in `base.css`; a page carries only the
markup, at body level. Android draws the same ground (blooms, texture, mark)
in `Modifier.ground()` and steps the wander every 12s so the window idles
between moves. Measured: 0px of drift across 600px of scroll, cards hit-test
above it, no horizontal scroll.

## 15. Modals and sheets

No — the cover-letter popup is a desktop dialog dropped onto a phone. Seven
things, measured from `mockups/mobile.html`.

### 15.1 The scrim is too weak

It is the right colour — deep-ink `#080331`, not neutral black, which is
correct. It is at **0.55**, and at that alpha the page behind still reads at
**4.08:1**. That passes AA. **A scrim is supposed to fail.** Because the
content behind stays legible *and* the dialog's top edge slices the "Cloud
Engineer" heading in half, it reads as a rendering fault rather than as
something deliberately pushed back.

```
  deep-ink over cream     0.55 -> 4.08:1     0.66 -> 2.78:1
  black over ink          0.55 -> 4.00:1     0.66 -> 2.68:1
```

`--scrim` is 0.66 in both themes — one value, and both land near 2.7:1.

### 15.2 It is a dialog, not a sheet

Inset on all four sides with gaps above and below, so you get a ~600px
reading window *plus* a second scrollbar, inside a phone that already
scrolls. On a phone a long document is a **bottom sheet**: full width, rising
to ~90% height, `--radius-sheet` on the top corners only, flat to the bottom
edge. The strip of page left showing at the top is what says "this is on top
of something", and it is the thing to tap to dismiss.

### 15.3 A raw OS scrollbar inside a branded surface

`#8b8b8b` track, `#fcfcfc` thumb, with arrow buttons — sitting inside a
rounded sheet and clipping its corner. Style it to `--hairline` at 4px, or
let the sheet's own overflow carry it.

### 15.4 No elevation

A white sheet on a dimmed page with no shadow and no border reads as pasted
on. A sheet is the one surface that casts **upward**: `--shadow-sheet`. On
dark there is no shadow at all, so `--sheet-edge` carries it.

### 15.5 The letter has no letterhead

"Ken Kariuki kenmwara@gmail.com +1 778 847 3965" runs as body text at the
same size and weight as the letter itself. It is a letterhead: name at
`--text` 500, contact at `--text-2` 11px, then a `--hairline` rule, then the
body. This is the same inverted-hierarchy error as §12.3.

### 15.6 Two button shapes for two different jobs

"Close" is a wide outlined pill at top-right, competing with the title; the
real action, "Copy", is a small pill at bottom-left. Invert it: Close is a
30px circular `--sunken` icon button, and Copy is a **full-width**
`--action` button in a footer with a `--hairline` above it.

### 15.7 The title is sans

`--font-serif` at 20px. Newsreader is for titles, and a sheet header is a
title. Add a 34×4 grab handle above it in `--hairline` — the affordance that
says the sheet scrolls and can be dragged away.

### The tokens

```css
--scrim:        light-dark(rgba(8,3,49,.66), rgba(0,0,0,.66));
--sheet-edge:   light-dark(1px solid transparent,
                           1px solid rgba(248,243,235,.13));
--radius-sheet: 22px;   /* top corners only */

/* NOT light-dark(): two shadows means a top-level comma, so light-dark()
   would see three arguments and silently drop the whole declaration.
   Multi-part values take a real override. */
--shadow-sheet: 0 -2px 8px rgba(75,68,57,.06),
                0 -18px 48px rgba(75,68,57,.16);
```
```css
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --shadow-sheet: none; } }
:root[data-theme="dark"] { --shadow-sheet: none; }
```

**This applies to every multi-part value**, and it fails silently — the
declaration simply vanishes, so the first symptom is a missing shadow rather
than an error. `--shadow-card` and `--shadow-cta` are already handled this
way for the same reason.

A centred dialog is still right on desktop, at a max-width — but it takes the
same scrim, the same elevation and the same footer.

---

---

## 16. DECIDED: colour intensity is a budget spent over area

**Decided 2026-09-20: option C, in both themes.** The tokens ship it. This
section keeps the reasoning and the two rejected options, because the rule it
produces is the one most likely to be re-broken.

### The mistake

§11 sets one fill per band and says nothing about **size**. The same
`--answer-fill` is used for a 70×22px pill and a 440×230px evidence card —
the same tint over **66× the area** on dark, 23× on light. At pill scale it is
a hint. At card scale it is a field of brown.

**My "that is how Apple builds it" claim in §11 was wrong.** Remeasured:

```
  Apple system colours    lightness spread 0.529 -> 0.865   range 0.336
                          chroma    spread 0.111 -> 0.232   range 0.121
```

Apple holds *chroma* roughly constant near 0.20 and lets lightness vary by a
third. I claimed they hold both. My fills sit at 0.022–0.038, a tenth of
Apple's chroma — what §11 builds is muted and tonally even, where Apple's is
saturated and tonally uneven. Close to opposite characters.

What Apple does do, and §11 missed: **tinted fills stay small.** Badges,
toggles, selection. A block of body text sits on `secondarySystemBackground`,
a neutral grey at chroma **0.004–0.007**. Colour lives in the accent, never in
the field.

### The three options

| | dark card | light card | chroma | the band colour lives in |
|---|---|---|---|---|
| **A** *(was shipping)* | `#3d2b1a` | `#fbede1` | .038 / .022 | the fill |
| **B** | `#332c27` | `#f6f1ec` | .014 / .009 | a trace in the fill |
| **C** *(shipping)* | `#2b284f` | `#f1f1fa` | at the **surface's** hue | a 2px rule + the label |

All three pass AA identically, so this is purely a question of how much colour
a large surface should carry. On dark, A is a brown slab — it is lighter than
the ground *and* in a different hue family from the surface. On light, A reads
as a recessed panel because the tint is *darker* than its white surface, which
is why light survives the same mistake.

### Option C in full

```css
/* The evidence card is a neutral at the SURFACE's own hue. Both bands share
   it; the band colour becomes a 2px left rule plus the label. */
--evidence-bg:   light-dark(#f1f1fa, #2b284f);
--evidence-rule-answer:    light-dark(#b86b03, #e89f59);   /* = --unsure */
--evidence-rule-strongest: light-dark(#3e954d, #7ac683);   /* = --auto   */
```

| | label | AA | body | AA |
|---|---|---|---|---|
| answer · dark | `#ecaf78` | 7.22 | `#dbd1c8` | 9.19 |
| strongest · dark | `#92d098` | 7.70 | `#ccd6cd` | 9.26 |
| answer · light | `#713f00` | 7.75 | `#584e45` | 7.22 |
| strongest · light | `#225b2c` | 7.19 | `#495349` | 7.15 |

`--auto-fill` / `--unsure-fill` are unchanged and keep serving pills.

### The rule this produces — the one to keep

> A tinted fill is for elements at **pill scale**. Above roughly 4,000px² a
> surface is neutral — the canvas's or the surface's own hue — and the band
> colour moves to a rule, a label, or a small mark. Colour intensity is not a
> constant; it is a budget spent over area.

### Why C rather than A on light

A is not broken on light — it is the nicer of the two there, because the tint
is *darker* than its white surface and so reads as a recessed panel. The rule
above is what decided it: it holds at any size in either theme and survives the
next component nobody has thought about yet. A theme-specific exception is the
kind of thing that rots quietly.

`boards/Tint-At-Scale.png` and `boards/Tint-Light.png` show all three.

---

## 18. Time — see the motion spec

Colour has three axes; the fourth is time, and it lives in its own spec:
`docs/references/motion-2026-09-20/docs/MOTION.md`, with the build order and
what shipped recorded in `docs/ARCHITECTURE.md` ("Time is the fourth axis").
Two of its numbers are laws here: entries 340–520ms, exits 160ms and never
overshooting; and reduced motion means no motion, not less information.

## 17. One-line summary to keep in your head

> **Market is the hero. Theme is everything else. They never touch.**
