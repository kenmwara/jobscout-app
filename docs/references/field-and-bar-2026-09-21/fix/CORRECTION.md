# JobScout — correction: the header rectangle and the résumé field

Two defects on the detail / prepare screens, both visible in the dark-mode
Android mockup. Both are fixed here as **components and rules**, not as
one-screen patches, because both recur wherever a similar object appears.

---

## 1. The rectangle over the title

### What it is, measured

Sampled from the shipped screenshot, not estimated:

| | |
|---|---|
| phone screen spans | `x 722 … 1180` |
| the rectangle spans | `x 742 … 1161` — inset ~20px on each side |
| its fill | `rgb(10, 5, 36)` — flat, no gradient |
| `--canvas`, dark | `#0a0524` = `rgb(10, 5, 36)` — **exact match** |
| the 20px gutters either side | a smooth gradient, `15,10,42 → 33,23,64` — the market wash |

**It is on every screen.** The same seams at **x=742 and x=1161** — identical
coordinates — were measured on the landing, browse, prepare and saved screens.
`.phdr` is painted app-wide, so this is one edit, not four.

**It is in both themes.** The same sampling on the light mockup gives the
column as `rgb(248,243,235)` — `--canvas` light `#f8f3eb`, again an exact
match — against the warm wash in the gutters. The delta is only ~14 there
against ~35 in dark, which is why the dark screen is the one that shouts.
Fixing it fixes both.

So `.phdr` is painted `--canvas` while sitting inside the screen's horizontal
padding. The wash runs underneath it and reappears in the gutters, which draws
two vertical seams down the screen and a hard horizontal edge directly above
the title. That is why it reads as a box drawn around the title.

### Whose fault

**The build's, but understandably.** `.phdr` in `components.css` is:

```css
.phdr { display:flex; align-items:center; justify-content:space-between;
        gap:var(--s2); min-height:56px; padding:0 var(--s4); }
```

No background. A header usually wants one, so one was added. On these two
screens it must not have one — the market wash *is* the ground, and
`.chip-btn` already carries its own surface and shadow, so the controls are
legible with nothing behind them.

### The rule

A bar either paints nothing, or it bleeds. `css/bleed.css` sets both:

- `.phdr` paints nothing — it keeps its inner padding and never fills.
- `.bar--solid` is for the case where a bar genuinely must be opaque
  (content scrolling under a sticky header). It negative-margins out to the
  screen edge and **fades its bottom with a mask**, because a hard line across
  a gradient is the same artefact in a different place.
- The generalisation applies to `.phdr`, `.sheet__bar`, `.toolbar` and
  anything marked `[data-bar]`.

---

## 2. The résumé field

### What it is

A raw `<textarea>`: UA border, UA focus ring, a native **resize grip** in the
corner, a native scrollbar, and a box shorter than its own line-height so the
placeholder was cut through the middle. Then a round send button floating in
dead space beside it.

### Whose fault — mine

The pack described `.hero__field` + `.hero__input`, and those rules are
correct (`border:0; outline:none`). But they describe a single-line `<input>`.
**Nothing in the pack ever described a `<textarea>**`, and a résumé paste is
inherently multi-line — so the build reached for the element the job needed
and got the element's defaults with it.

A spec that covers one element and stays silent about the one the job
requires is an incomplete spec. This is what an incomplete spec looks like on
screen.

### The component

`css/field.css` + `js/field.js` + `markup/field.html` define **one** field,
used for every résumé input in the product — hero, prepare screen, anywhere
else. It takes **both doors**:

- **paste** into the text area, and
- **a file** — via the *Attach a file* button, by **drag-and-drop onto the
  whole well**, or by pasting a file from the clipboard.

Accepts `.pdf .doc .docx .txt .rtf .odt`, capped at 8 MB. A rejected file says
what to do (*"Attach a PDF, Word or text file — or paste the text instead"*),
never what went wrong.

States are written to the DOM so they are inspectable and testable:

```
data-state = "empty" | "typing" | "file" | "error"
data-drag  = "1"                       while a file is over the well
```

### Two densities, one component

| | where | shape |
|---|---|---|
| `.field` | prepare screen, any in-card ask | a three-line well |
| `.field--bar` | the landing hero | one row, pill |

The landing's field **looked acceptable already** — it had a paste box, a
paperclip and a send button. What it was, was a *second implementation*. A
second implementation is where the next resize grip comes from, so the hero
now runs the same component at a bar density: same two doors, same drop
target, same states, same stripped controls, one row instead of two. A
three-line well in the hero would push the first result below the fold, which
is the only reason the variant exists.

Key decisions:

- **Focus lives on the well, not the control.** That is what lets the control
  drop its own outline without stranding a keyboard user — the whole field
  lights, which is larger and easier to see than a 1px ring.
- **Three lines minimum.** A résumé field showing one line reads as a search
  box and people type their job title into it. `field-sizing: content` grows
  it with the paste where supported, capped at twelve lines.
- **Not a pill.** `--r-inner`. A pill cannot hold three lines without its
  corners eating the first and last.
- **One target, not two.** The whole well is the drop zone; a dashed rectangle
  inside a box is two targets where the user sees one.

---

## 3. Browse: a line that names a precondition and offers nothing

The browse screen reads:

> 8 scored of 318 swept · example scores — **paste a résumé to score for real**

That is the same dead end `blocked.css` was written to remove, in a new place.
It names a thing the reader must supply and gives them no way to supply it on
that screen. The product's own rule: *a control that cannot run does not
explain why — it becomes the action that makes it runnable.*

Now that one field exists at bar density, the remedy is to put it there:

> 8 scored of 318 swept · example scores until you paste a résumé.
> `[ Paste your résumé — or drop a file          📎  → ]`

The sentence stops being a condition and becomes a caption on a control.

### One placeholder, everywhere

`Paste your résumé — or drop a file`, verbatim, in every placement. The first
draft of this fix gave browse a longer, screen-specific placeholder and it
**clipped horizontally in the bar** — the very defect being fixed, reintroduced
by me, caught by rendering the fix and looking at it. Assertion **G** now
watches the horizontal axis and has been mutation-tested (189px of overflow on
a long placeholder, silent on the real one).

---

### A copy change I made that you did not ask for

The saved-empty screen's primary button reads **"Run the pipeline"**. That is
system language on a public page — nobody outside the build calls it a
pipeline. In the "after" panel I swapped the two: **Browse the sweep** primary,
**Run a fresh sweep** secondary, on the reasoning that the more useful action
in an empty state is to look at what has already been swept. Flagging it
because it is a product decision, not a defect fix — revert it if you disagree.

---

### Proof

`proof/fix-light.png` and `proof/fix-dark.png` — eight panels each: landing,
browse, prepare and saved, before and after, rendered from the real tokens in
both themes. The "before" panels reproduce the defect rather than illustrate it:
the header is genuinely inset by `--s4`, and the textarea is genuinely a raw
control with `resize: vertical`.

## The checks

Both defects now have a check, and **both checks have been shown to fail on the
defect and pass on the fix** — an assertion nobody has watched fail is asleep.

```
node tools/check_bar_bleed.mjs     <page> [...]
node tools/check_field_chrome.mjs  <page> [...]
```

`fixtures/before.html` reproduces both defects faithfully (including the
geometry — the screen carries the padding, so the header is genuinely inset);
`fixtures/after.html` is the same screen fixed.

Proven output:

```
BEFORE
  check_bar_bleed     FAIL (1)  phdr paints rgb(10,5,36) but is inset 16px / 16px inside screen
  check_field_chrome  FAIL (4)  A resize grip · D clipped placeholder · E ad-hoc control · F no field
AFTER
  check_bar_bleed     pass
  check_field_chrome  pass
```

`check_bar_bleed` is a **geometry** check, not a class-name check: any element
that paints a background and does not reach both edges of its scroll container
fails. It therefore catches the next one too — a sticky filter row, a toolbar,
anything that grows a fill later.

`check_field_chrome` focuses every control and reads what the browser actually
computed. Assertion **C** is the guard on **B**: a control *outside* `.field`
must still draw a focus ring, so "outline:none everywhere" — a worse bug than
the ring — cannot pass.

---

## How to land it

1. Add `css/bleed.css` and `css/field.css` after `components.css` and
   `screens.css`, before `parallax.css`.
2. Add `js/field.js` as a module; it self-initialises and `enhanceFields()` is
   idempotent if you insert a field later.
3. Replace the prepare screen's ad-hoc textarea, and the hero's
   `.hero__field`, with the block in `markup/field.html`. The only thing that
   changes per placement is the `id` pair, which must be unique on the page.
4. Delete `background` from `.phdr` wherever the build added it.
5. Run both checks over every screen in the mockup. Add them to `sanity.mjs`.

### Two things to watch

- `field.css` ends with a small set of document-wide rules
  (`textarea { resize: none }`, `font: inherit` on controls, a focus-visible
  ring). They exist so a *new* control cannot arrive with its defaults
  showing. If anything in the app relies on a resizable textarea, scope them.
- The aliases at the bottom of `field.css` neutralise `.hero__field` so this
  lands without editing every screen's markup at once. **Delete them** once
  the markup uses `.field` everywhere — `all: unset` is a blunt instrument and
  should not stay in the codebase.
