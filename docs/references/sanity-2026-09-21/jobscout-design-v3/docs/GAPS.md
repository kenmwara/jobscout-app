# What still needs your eyes

The suite watches twelve things. These are the ones it does **not** watch, in
the order they have actually cost time. Each has a spec precise enough to
implement; none is written yet.

Until they are, these are the only places worth a fine-tooth comb. Everything
in `SANITY.md` is machine-watched and you should stop looking at it.

---

### 1. Contrast of every foreground/background pair · **write this first**

**Cost so far:** the hero's ink was `--canvas`, which inverts to near-black on
the market wash in dark mode and loses the headline entirely. Found by
rendering and looking. Nothing would have caught it.

**Spec.** For every element with text, walk up to the first ancestor with a
non-transparent background, compute the ratio, and fail below 4.5:1 for text
under 18.66px or 3:1 above. Sample on **glyph cores**, not the element's
declared colour — an antialiasing edge is not the text colour, and reading one
produced a false AA failure earlier in this project. Exempt `--scrim`, which
is meant to fail.

**Mutation:** set `--hero-ink` to `var(--canvas)`.

---

### 2. A heading must not be a fragment of its source

**Cost so far:** the detail screen's `<h1>` read **"Management"** — the tail of
"Senior Associate, SLC Accounting and Controls - SLC Management". Something
split on a hyphen that appears inside real job titles.

**Spec.** The rendered heading must be a **prefix** of the source string, not a
suffix or an interior slice. Needs the source alongside the render, so it runs
against a fixture feed rather than a static page: render each row, compare
`h1.textContent` to `row.title`, allow a trailing ellipsis from a line clamp,
fail anything else.

**Mutation:** `title.split('-').pop()`.

---

### 3. The same fact stated twice on one screen

**Cost so far:** the detail screen showed the org line, the title and the
primary action each twice. `primary` now catches the action. The text does not.

**Spec.** Collect every text node over 8 characters, normalise whitespace, and
fail when the same string appears in two elements where one's region contains
the other's — the same containment rule `check_one_primary` uses, which is
what stops a feed of cards being flagged.

---

### 4. The market pill

**Cost so far:** rendered **"CA CA"** and **"KE KE"** in both markets. Fixed;
nothing guards it.

**Spec.** The pill's visible text contains the country **name**, and the
two-letter code appears at most once. Fail `/\b([A-Z]{2})\b.*\b\1\b/`.

---

### 5. Content below the fold

**Cost so far:** twice. Android's first posting sat at 81% of the page. "Your
matches" said "8 scored" and showed none of them above the fold — measured at
65% of the visible screen given to explanation.

**Spec.** On any route whose heading names a collection, the first member of
that collection must begin above 60% of the viewport at 390×844. Assert on the
first `[data-band]` or `.saved__row`.

---

### 6. Selected is not primary

**Cost so far:** the menu painted "Kenya is selected" and "Copy all" in the
same `--action` fill — a state and an action rendered identically.

**Spec.** On any open sheet, the computed `background-color` of every
`[aria-pressed="true"]` differs from that of the region's filled primary.
Already written as an accept block in `BUILD-ORDER.md` §6; never turned into a
tool.

---

### 7. `light-dark()` with a multi-part value

**Cost so far:** `--shadow-sheet` was silently dropped because two shadows
contain a top-level comma, making it a three-argument call. `check_motion`
then found four more of the same in the demos written to document the trap.

**Spec.** Static — parse the CSS, not the page. Fail any `light-dark(` whose
argument list, after balancing brackets, has more than two top-level commas.
Fast, no browser, belongs in the pre-commit hook rather than the suite.

---

### 8. Touch targets and focus

**Never caused a visible bug here, which is exactly why it is worth adding
before it does.**

**Spec.** Every interactive element ≥44×44 at 390pt; every one has a
`:focus-visible` style whose computed outline or box-shadow differs from rest.

---

## The honest limit

A check can only assert what someone thought to assert. Everything in this
file exists because a human looked first — several of them because **you**
looked first. The suite shortens the list; it does not end it.

What it should end is looking at the **same** thing twice. `score` exists
because the bare numeral shipped, got reported, got fixed, and shipped again
one screen later. Nothing was watching, so it came back.
