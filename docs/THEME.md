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
| card / field surface | `#16103a` | `#16103a` | shared ✓ |
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

## 10. One-line summary to keep in your head

> **Market is the hero. Theme is everything else. They never touch.**
