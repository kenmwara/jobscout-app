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

## 13. One-line summary to keep in your head

> **Market is the hero. Theme is everything else. They never touch.**
