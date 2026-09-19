# JobScout redesign — probe against useparallel.com

**2026-09-18 · probe only, nothing changed.** Measured off the live site in the browser, not from
the screenshots. Reference batch and the extracted design system are in
`docs/references/parallel-2026-09-18/`.

---

## The one finding that decides the rest

**Three of Parallel's four hero tabs cannot be built honestly on today's feed.**

| Their tab | Our data | Verdict |
|---|---|---|
| Full time | — | **no field exists** |
| Contract | — | **no field exists** |
| AI training | — | their own gig vertical; we have no equivalent |
| Remote | `remote_policy` — CA: remote 184 / onsite 97 / hybrid 28 | ✅ real |

A posting in our feed carries exactly: `id, sector, title, company, location, remote_policy,
places, salary, url, summary, source, gate`. There is no employment type anywhere in the sweep,
and **`salary` is filled on 10 of 309 rows (3%)** — a Parallel-style Salary filter would be empty
on 97% of the feed.

This is the Kenya-cities lesson again: the shape is copyable, the data behind it is not. Shipping a
"Contract" tab that silently returns the same 309 rows is the exact failure we removed from the
cards this morning.

**What we do have, already in the payload and already scored against:** `sectors` — 17 of them,
with human `labels` shipped in the same response (`engineering` → "Software & IT", `data` → "Data &
AI", `security` → "Cybersecurity", …). That is a better tab row than Parallel's, because every one
of those tabs returns a genuinely different set.

**Proposed tab row:** `Remote · Hybrid · On site` (the real axis) with the 17 sector labels as the
second, scrollable row — or one row of the six biggest sectors plus "All sectors". Employment type
returns the day a source publishes it; the tab appears on its own, the way the province picker
already does.

---

## What Parallel actually is, structurally

Two surfaces, not one page.

**1 · Marketing site** (`/`, `#f4f3f1` cream, 2961px tall, five bands)
- full-bleed photographic hero, h1 over it
- "How Parallel Works" — 3 cards on `#f9f9f9`
- manifesto band — one sentence at display size
- photographic CTA band
- footer: 4 link columns

**2 · App** (`/app/candidate/search`, `#fbfaf9` near-white)
- `Explore Jobs` / `Explore Companies` title + a Jobs|Companies pill toggle
- the same search input, persisted
- filter row: Remote Only switch · Location · Salary · Job Type · All Filters, and a Most Recent sort
- result count (`86 jobs`), then a 3-column card grid
- an SEO taxonomy block at the bottom: Jobs By Industry / Remote Jobs / Jobs by Location / Jobs by
  Department, each a grid of ~15 category cards

**Every hero chip is a plain link into surface 2:**

```
Full time    → /app/candidate/search?jobType=Full+Time
AI training  → /app/candidate/search?q=AI+training
Remote       → /app/candidate/search?location=Remote
```

All filter state lives in the URL. Nothing about the hero is a client-side filter — it is a
launcher.

### Measured, not guessed

| Thing | Live value | Note |
|---|---|---|
| h1 | **72px / weight 400 / -2.16px**, white | token sheet says 69/500 — trust the live read |
| display face | `Advercase Demo` | not licensable to us; substitute below |
| marketing canvas | `#f4f3f1` | the sheet's `#e4dfd9` is the hero overlay, not the page |
| app canvas | `#fbfaf9` | second, lighter canvas for the product |
| job card | `bg-white · radius 20px · padding 20px · 1px border rgba(22,22,22,.08)` | |
| card shadow | **none at rest**; 4-layer stack on hover | the sheet's single shadow is the hover state |
| card layout | `h-full` + `justify-between`, gap 16px→30px | rows match heights regardless of title length |
| hero input | placeholder **types itself out** and rotates | "Contract design" → "Marketing in New York" → … |

---

## Mapping onto JobScout

Current `site/index.html` is 1371 lines, one page: header → hero (3 setup cards) → ticker →
`#scoreStage` → `#gatesStage` → metrics → carousel → `#getapp`.

### 1 · Hero: one big title, one box

Replace the three-card chooser with Parallel's shape — display headline, then **one** surface that
takes the resume. The resume is the input, so the box is a drop zone *and* a paste field *and* the
run button, not a search field:

```
                        Find the work
                        made for you.

   ┌──────────────────────────────────────────── ⟶ ┐
   │  Drop your resume, or paste it                │   ← rotating placeholder
   └───────────────────────────────────────────────┘
        Remote · Hybrid · On site · all 17 sectors      ← links into /browse
        Or score a sample: Maya · Riley · Priya
```

Keeps: file input, paste textarea, persona chips, the run button (becomes the circular arrow).
Drops: three separate cards, the province `<select>` (moves to the results page filter row, where
Parallel puts it and where it belongs once there are results to narrow).

### 2 · CA/KE switch, two design languages

This is the one place Parallel has nothing to copy — its Talent/Employers toggle is one palette on
both sides. We already have the mechanism: `html[data-market="ke"]` re-declares `--indigo`,
`--midnight`, `--lavender`, `--info` and the header link already flips to `nairobi.jobscout.page`.

To make it light/dark it has to become a **complete second token set, authored, not inverted** — a
naive inversion is how the last four Sacred Earth reverts happened. Concretely: one `:root` block
per market covering canvas, card, ink, muted, border, accent; every component reads tokens only; no
component hard-codes a hex. Then the switch is one attribute and the whole page changes voice.

⚠ Cross-domain: `jobscout.page` and `nairobi.jobscout.page` are separate origins, so a switch that
"remembers" needs the choice in the URL (`?market=ke`), not `localStorage`.

### 3 · Results: a linked page, but only half of it can be

This is the real architectural decision, and Parallel's answer only fits one half.

- **Browse** (no resume: the feed, filtered by remote policy / sector / province) — a real linked
  page, all state in the URL, shareable, cacheable, SEO-visible. This is new capability; we have
  never had a browsable surface at all.
- **A run** (your resume → 0-100 fits, gates, the letter) — **cannot** be a URL. The resume is never
  stored, by design and by the privacy page. So a run renders into a results view from in-memory
  state: same layout, same cards, reached by transition rather than by link, and a reload returns
  you to the hero.

Recommendation: build `/browse` as the linked page in Parallel's shape, and have the pipeline render
its results into that same layout in place. One card component, two entry paths. Scroll-to-results
on the landing page stops being necessary.

### 4 · End page

Parallel's footer taxonomy is a grid of ~15 industry cards plus four column groups. Ours maps
directly: **the 17 `labels` already in the feed** become the industry grid, `places.options`
becomes "Jobs by Province", `remote_policy` becomes "Remote / Hybrid / On site". Every tile links
into `/browse?…` with the filter pre-set — the same launcher pattern as the hero chips, which is
why Parallel gets SEO out of it.

Partner/source links: we sweep **wwr, Canonical, BMO, Manulife, CIBC, Sun Life, GitLab, Jobicy** and
more; the ticker already names them. That row is honest to print as "where today's postings came
from" — it is not a partnership claim, and the wording must stay that way.

---

## Type and the licence problem

`Advercase Demo` is a demo-licensed face we cannot ship. The sheet's own substitutes are Söhne
Breit / GT America (both paid). Free faces that hold the same weight-400 editorial register at
72px: **Instrument Serif**, **Fraunces** (soft optical axis), or **Bricolage Grotesque**. Body stays
system sans, as Parallel does.

The current JobScout brand face and the Brand Kit v2.2 tokens are law; this redesign has to be
expressed *through* `tokens/brand.json`, not around it, or the apps and the site drift apart.

---

## What this costs, and the order I would do it

| Step | Touches | Risk |
|---|---|---|
| 1. Second token set + market switch | `site/index.html` `:root` blocks | low, reversible |
| 2. Hero collapse to one box | hero markup + the chooser JS | medium — the three cards' logic must survive |
| 3. `/browse` page + card component | new file, reads the same `/api/feed` | low, additive |
| 4. Run renders into the browse layout | `#scoreStage`/`#gatesStage` → cards | **high — this is the demo's whole surface** |
| 5. Taxonomy footer | new, from `labels` + `places` | low |
| 6. Android/iOS parity | `Select.kt`, `JobScoutApp.swift` | the four-implementation lockstep applies |

Steps 1, 3 and 5 are additive and safe to ship first. Step 4 is the one that can break the live
demo, and it wants `tools/demo_eval.py` green before and after.

**Not started. Say go and I will start at 1.**
