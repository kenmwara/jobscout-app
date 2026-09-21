# Status — applied 2026-09-21 to mockups/mobile.html + mockups/card.css

| § | verdict | what changed |
|---|---|---|
| 1 hero | **kept** | it is market-driven (`html[data-market]` → `--hero`); Ken 09-21: "Green is ok for KE". check_halo_ext rule A flags the landing wash by design. |
| 2 tiers | done | `.jcard__chip` 5px radius, 4/7px padding, line-height 1 (18.5px vs the band's 20.5px pill); tier 1 untouched. Dark `--sunken` measures 1.225:1 off surface (the guide's 1.030 predates 2e5d8ab). |
| 3 date | done | `whenOf(p)` from `posted_at` (today / yesterday / N days ago / last week / N weeks ago); nothing when the source publishes none. |
| 4 heading | done | full title, `-webkit-line-clamp:3`; the "Management" fragment was never a split — the source title is the fragment-looking "… - SLC Management". |
| 5 detail | done | `.jcard--detail`: no shell, org once, rose + three tiers, STRONGEST, what to answer, one primary, "Open the posting", heart (replaces "Save this match"). |
| 6 CA CA | done earlier | SVG flags + the code once. |
| 7 small | done | title is not a link on detail; "N swept this morning" only. |
| 9 checks | green | check_rose ALL GREEN · check_motion ALL GREEN · check_card 128 titles / 16 cells ✓ (run with `--url ".../mobile.html?r="`, its routes are site routes) · check_halo_ext: only the §1 wash. |

The guide, verbatim, follows.

---

# Correction guide — the 2026-09-21 mobile mockup

Measured from three screenshots of `jobscout-mockup-2026-09-21/index.html`:
browse (Kenya / light / Android), the menu sheet, and job detail (Canada /
light / Android). Every number below was sampled from those pixels. Where a
thing cannot be judged from a still, this guide says so instead of guessing —
see §9.

Read §0 first. Most of what shipped is correct; the damage is concentrated in
one element.

---

## §0 The shape of it

**One thing is badly wrong, three things are wrong in a small way, and the
colour system is fine.**

The hero is a painted green panel. That single element breaks three laws at
once and is what makes the screen feel like somebody else's site. Delete it.

Under it, the card's metadata tiers are inverted — the *fact* has a heavier
container than the *verdict* — and tier 3 is missing entirely. The detail
screen repeats itself and its heading is a fragment. The market pill prints
the country code twice.

The tokens, the evidence cards, the band ramp and the rose are all correct and
must not be touched. §8 lists them so they do not get "fixed" by accident.

**Priority order:** §1 alone changes how the product feels. §2–§5 are the
craft. §6–§7 are small.

---

## §1 Delete the hero panel · the only urgent one

**What shipped.** A filled panel behind the headline and the resume input,
running a gradient from `#103c19` down to `#0a1820`.

**Measured:**

| | value |
|---|---|
| panel fill at the top | `#103c19` — OKLCH **L 0.316 · C 0.077 · H 147** |
| panel size on screen | 418 × ~300 px in a 460 px-wide screen |
| in device points (390pt) | ≈ **354 × 254 pt ≈ 90,000 pt²** |
| §16's neutral-surface threshold | 4,000 px² — the panel is **22× over** |
| step against the real ground `#f8f3eb` | **11.3 : 1** |
| law 7's light-ground ceiling | **1.105 : 1** |

**Three laws, one element:**

1. **Law 7 — one ground, and only `<html>` paints it.** This panel is a second
   ground with an 11.3:1 edge against the first. The halo's entire permitted
   range on light is 1.105:1. This is the `y=364` seam from the last audit
   returned at ten times the size.
2. **§16 — colour intensity is a budget spent over area.** A tinted fill is
   for pill scale. Above ~4,000px² the surface goes neutral and the colour
   moves to a rule. This is 22× that, at chroma 0.077 — roughly **double** the
   chroma of any band fill in the ramp.
3. **Law 1 — three signals, three channels.** Hue **147 is AUTO's hue**,
   exactly. The page's decoration is wearing the verdict channel's colour, so
   the whole screen reads as a soft AUTO before a single job is scored.

**The fix is removal, not replacement.** The ground already exists and is
already right. Take the panel out and let the headline and the resume input
sit on `--canvas` with the halo behind them, the way every other surface does.

- **The 150px hero padding stays.** It is not the problem and it captures the
  landing correctly. Nothing about this correction touches it.
- Nothing replaces the panel. No band, no image, no card, no border.
- The chips (`Remote / Hybrid / On site / Any of those`) become ordinary chips
  on the ground: `--sunken` fill, `--text-2`, no hue. They are filters, which
  is tier-2 information.
- The headline stays in Newsreader on `--text`.

**One decision this guide cannot make for you.** These stills are the Kenya
market. If that green is the **market** colour rather than fixed decoration,
then Kenya's market channel and AUTO's band channel are the same hue, and law
1 is broken at the token level rather than at the panel. Check by switching to
Canada: if the panel turns blue, it is market-driven and the market hues need
separating from the band hues before anything else. If it stays green, it is
decoration and deleting it closes the issue.

**Accept:** `node tools/check_halo_ext.mjs` passes on every route — it fails
rule A the moment any element paints more than 50% of the viewport, which this
panel does.

---

## §2 The metadata tiers are inverted

Stage 1.4 says container weight **is** importance: tier 1 the verdict, filled;
tier 2 a fact, `--sunken` and no hue; tier 3 context, no container.

**What shipped, measured on the white card `#ffffff`:**

| tier | element | fill | step off the surface |
|---|---|---|---|
| 1 — the verdict | `PING` pill | `#eaf0ff` | **1.141 : 1** |
| 2 — a fact | `On site` chip | `#ece5d8` | **1.253 : 1** |
| 3 — context | *(absent)* | — | — |

Two problems, both arithmetic:

- **Tier 2 is the louder container.** 1.253 against 1.141 — the fact has
  *more* presence than the verdict. The hierarchy is upside down.
- **They read as peers.** Only **1.098:1** apart from each other, the same
  pill radius, and the same height (43 px and 45 px on screen). Fill alone
  cannot carry a hierarchy at that size.

**The fix:**

- Tier 1 keeps `--ping-fill` but gains the weight the verdict deserves: the
  band label in `--ping-label` at `500 8.5px` with `.14em` tracking, which is
  what `stage1/card.css` already specifies. Small, tight, coloured.
- Tier 2 loses its pill shape. Keep `--sunken`, drop to `10.5px`, and let it
  be a quieter container, not a matching one.
- Do **not** raise tier 1's chroma to win the contest. The answer is that
  tier 2 gets quieter, not that tier 1 gets louder — §16 again.

**Note for dark:** `--sunken` is **1.030:1** from `--surface` on dark, against
1.253:1 on light. It is invisible there. `stage1/card.css` works around it with
`light-dark(var(--sunken), var(--evidence-bg))`, but the real fix belongs in
the token file. Do not ship the tier-2 change on dark without checking it.

---

## §3 Tier 3 is missing

No posted date appears on any card, on browse or on detail. Three tiers are
rendering as two, so Stage 1.4's whole point — that there are *three* weights —
is not demonstrated anywhere in the product.

**The fix:** add the date as tier 3, `--text-2` at `10.5px`, **no container at
all**. Markup and CSS are written: `stage1/card.html`, `.jcard__when`.

**Accept:** `node tools/check_card.mjs` — it asserts three distinct computed
`background-color` values across the three tiers, and fails on two.

---

## §4 The detail screen's heading is a fragment

The job is **"Senior Associate, SLC Accounting and Controls - SLC
Management"**. The screen's `<h1>` reads **"Management"** — the last word after
the hyphen.

Something is splitting on `-` and keeping the tail, or taking the last segment
of a truncation. Whatever the cause, the page is titled with a word that means
nothing on its own.

**The fix:** the heading is the full title, wrapped, in Newsreader at 400. If
it needs a cap, clamp to 3 lines with `-webkit-line-clamp` — never split on a
character that appears inside real job titles.

**Accept:** a detail-screen assertion that the `<h1>`'s text is a prefix-match
of the posting's full title, not a suffix.

---

## §5 The detail screen repeats itself

Three duplications on one screen:

1. **"Sun Life · Toronto, Ontario"** appears as the page subtitle *and* again
   inside the card below it.
2. **The job title** appears as the heading *and* again as the card's title.
3. **"Prepare application →"** appears as a button inside the card *and* as
   the first of three stacked full-width buttons below it.

The detail screen is showing a browse card inside a page that already says
everything the card says.

**The fix:** the detail screen is the card *expanded*, not a page containing a
card. Drop the card shell. The screen is:

```
← Back                                    CA Canada   ⋯
<full job title, Newsreader 400>
<rose + numeral>  <band pill> <chip> <date>
STRONGEST  ————————————————
↓ WHAT TO ANSWER  ——————————
[ Prepare application → ]  [ Open the employer's posting ↗ ]  ♡
```

One primary action, once. `Save this match` becomes the heart, which is where
Stage 1.5 put it and where it already is on the browse card.

---

## §6 The market pill prints the code twice

The phone header renders **"CA CA"** in Canada and **"KE KE"** in Kenya. The
small-caps prefix and the label are both resolving to the country code; the
country name is being dropped. The harness chrome above it gets this right
("CA Canada", "KE Kenya"), so the bug is in the phone header only.

This is the "market pill drops labels" finding from the previous audit, still
open.

**The fix:** prefix is the code, label is the country name. If the header is
too tight for the name at 390pt, show the code **once** — never the code
twice.

---

## §7 Two small ones

- **The card title is underlined** on the detail screen. `stage1/card.css`
  sets `.jcard__link { text-decoration: none }`; an underlined two-line serif
  title at 18px is heavy and reads as a raw link, not a heading.
- **"318 swept this morning · tap the arrow to score them."** The count is
  true and useful — it tells you what list you are looking at, so keep it. The
  second half is instructional copy for an affordance that should not need
  instructions: the swept card's eight empty bearings already say there is a
  score to be had. Cut everything after the `·`.

---

## §8 What is already right — do not "fix" these

Sampled and correct to the exact token. If a change alters any of these, the
change is wrong.

| thing | measured | verdict |
|---|---|---|
| `--ping-fill` | `#eaf0ff` | exact |
| `--ping-label` | `#394981` | exact |
| `--unsure-label` | `#713f00` | exact |
| `--sunken` | `#ece5d8` | exact |
| `--evidence-bg` | `#f1f1fa` | exact |
| evidence rules | green on STRONGEST, ember on WHAT TO ANSWER | §16 option C, landed |
| what-to-answer placement | behind the tap, not on the browse card | law 12, correct |
| card titles | Newsreader | law 13, correct |
| rose on the PING card | 8 dots, **6 lit** | the law holds |

Two more things that are right and easy to lose:

- **Contrast inside the hero passes.** Chip text on the chip fill is
  **9.63:1**; the headline on the panel is **12.48:1**. The hero is being
  deleted for §1's reasons — area, ground and channel — **not** for
  legibility. Do not report an AA failure here; there isn't one.
- The three-state theme control (Light / Device / Dark) is present in the
  phone menu. Law 2, satisfied.

---

## §9 What a screenshot cannot tell you

These four are unverified — not passing, not failing. Run them before calling
anything done.

```
node tools/check_rose.mjs         # geometry, the display cut, lit-vs-unlit fills
node tools/check_motion.mjs       # three material states, exits faster than entries
node tools/check_card.mjs         # Newsreader everywhere, three tiers three treatments
node tools/check_halo_ext.mjs     # one ground, warm on light, halo on every route
```

The lit count reading 6 for PING is consistent with the law, but a still
cannot confirm the canonical geometry or the display cut — `check_rose.mjs`
asserts both to 0.01. Nothing in these stills shows a hover or a press, so the
material ladder is entirely unknown. And every measurement here is from the
**light** theme; dark is unexamined, and §2's note about `--sunken` means dark
is where the tier fix is most likely to go wrong.

---

## Not in scope — decided, do not re-propose

Carried forward unchanged:

- **The hero rebuild** — real-number headline, pre-scored proof card, live-dot
  kicker, stat row. Rejected as marketing. §1 removes a panel; it does not add
  anything in its place.
- **Reducing the hero padding from 150px.** It stays at 150px.

The site is free and public-facing. It does not need to prove anything, and
nothing in this guide adds persuasion copy, social proof, or a number whose job
is to impress. Every correction above either deletes something or makes an
existing element honest about its own importance.
