# JobScout — handover for Claude Chat: design re-engineering

Date: 2026-09-21 · from the build session · supersedes `docs/handover/2026-09-20/HANDOVER-design.md`
(that file still holds the product paragraph, the surfaces and the full law list — read it once; this
one is what changed since, what is decided, and where the design is still open).

Everything below is measured from the code or the running product, not remembered. Where a thing is
a ruling by Ken it says so. Where a thing is unverified it says so.

---

## 0. Where things stand, in six lines

1. Motion v2 (your build orders 1 and 2) is LIVE on the web and built into the mockup, Android and iOS.
2. Your stage-1 card component (`card.css` + `card.js`) is in the mockup verbatim and is the card.
3. Your CORRECTION-2026-09-21 guide is applied, §2–§7. §1 (the hero) is **kept** — see §3 below.
4. The phone header rule is settled: landing = two slide tabs; every other screen = flag+code chip + ⋯ menu.
5. Four checks are green: `check_rose`, `check_motion`, your `check_card`, and `check_halo_ext` fails only
   on the hero wash that §1 keeps.
6. Four commits are local and unpushed on purpose (every push queues two paid Codemagic builds). The
   web you see at jobscout.page is therefore one step behind the mockup on the header and the card.

## 1. What is live vs what is in the mockup

| thing | web (jobscout.page) | mockup (`mockups/mobile.html`) | Android | iOS |
|---|---|---|---|---|
| ground: one `<html>` ground, 3 blooms + dot texture, fixed | live | live | Theme.kt | Ground.swift |
| page mark (wandering, `z-index:-1`), light discs amber `.30` | live, every route | live | — | WanderingMark |
| rose: `rose.js` builder, display cut, lit = band (8/6/5/3), mono numeral | live | live | Rose.kt | RoseView.swift |
| motion tokens (`--spring-*`, stagger, press, `--sh-*`, `--edge-*`) | live | live | `Motion` object | `Motion` enum |
| card = your `.jcard` (rose leads, three tiers, STRONGEST, heart in the action row) | **web still uses its own `.job` card with the same anatomy** | your component verbatim | own composable, same anatomy | own view |
| phone header rule (tabs on landing, chip + ⋯ elsewhere) | local commit, unpushed | live | n/a (native header) | n/a |
| ⋯ as drawn SVG dots (the glyph sat high) | local | live | — | — |
| menu sheet in brand controls (slide tabs + serif rows) | local (`hsheet.js` moves the real controls in) | live | — | — |
| detail screen = the card expanded | n/a (apply.html is the web's detail) | live | native detail exists, NOT re-cut yet | same |
| tier 3 posted date (`whenOf`) | web shows "posted N days ago" in its own way | live | shows age | shows age |

## 2. The rulings since the last handover (do not re-open)

- **The hero stays, and Kenya stays green.** Ken, 09-21, verbatim: "Green is ok for KE". The hero gradient is
  market-driven by design (`html[data-market="ke"]` → `--hero`); law 1's hue-147/AUTO overlap was raised
  and accepted. `check_halo_ext` rule A will flag the landing wash forever — that is the ruling, not a bug.
- **Lit dots = the band**, not the score (AUTO 8 · PING 6 · UNSURE 5 · NEAR-MISS 3). Your stage-1 pack
  had score-proportional lighting; Ken's re-sent spec reversed it. `check_palette` rule 9 holds all three
  platforms to the same table.
- **The numeral is mono, tabular.** (Serif numeral was tried and reversed.)
- **The header rule** (Ken, 09-21): the landing keeps the two slide tabs (market flags; device/light/dark) at
  every width. Every other view/route gets the chip + menu at phone width. Past three markets (US/UK are on
  the roadmap) the desktop hands over to the chip + sheet too (`html.mkt-many`, counted from the buttons).
- **The mark and wordmark link to the landing** on every surface.
- **Not in scope, decided:** the hero rebuild (real-number headline, proof card, stat row) is rejected as
  marketing; the 150px hero padding stays; no persuasion copy anywhere.
- Colour law v2.3 is unchanged: market → hero + market chip ONLY; theme → the device; band → hue,
  exclusively. The ACTION is deep ink, never indigo.

## 3. The correction guide — what each section became

| § | status | note |
|---|---|---|
| 1 hero | kept | market-driven; see the ruling |
| 2 tiers | done | chip 5px radius, 4/7px padding, 18.5px tall vs the 20.5px verdict pill; tier 1 untouched |
| 3 date | done | `whenOf(posted_at)`: today / yesterday / N days ago / last week / N weeks ago; nothing when unpublished |
| 4 heading | done | full title, clamp 3. The "Management" fragment was the SOURCE title ("… - SLC Management"), never a split |
| 5 detail | done | `.jcard--detail`: no shell, org once, rose + three tiers, STRONGEST, what to answer, one primary, "Open the posting", heart |
| 6 CA CA | done | SVG flags (Windows draws emoji flags as two letters), the code once |
| 7 small | done | no link on the detail title; "N swept this morning" only |
| 9 checks | green | `check_card` on the mockup needs `--url ".../mobile.html?r="` (its routes are site routes) |

One correction to your measurements: dark `--sunken` is `#2b284f`, **1.225:1** off the dark surface
(`#1c1544`), not 1.030 — the guide measured the zip that predates commit 2e5d8ab. Light is 1.253:1.
Parity, and the stage-1 `light-dark(var(--sunken), var(--evidence-bg))` workaround can go.

## 4. What "design re-engineering" can now take on

These are the places the product is honest but not yet designed, in the order they would pay. Each one is
a candidate, not a brief. Pick, and write a build order like the last two — that format shipped clean.

1. **The web card should become your `.jcard`.** The site's `.job` card matches the anatomy by hand
   (`site/index.html` template + `site/base.css`). Porting the component is the one change that would make
   web = mockup = spec, and it lets `check_card` run on the live site. Risks: the web card carries states
   the mockup does not — the swept card (unlit rose, en-dash, "Score against my resume →"), the
   below-floor "Apply anyway", the rate-limited state, the refusal.
2. **The detail screen on native** (Android `MainActivity`/`Mobile.kt`, iOS) still is "a page holding a
   card". The mockup now defines the expanded form; the apps should follow it.
3. **The web's `apply.html`** is the web's detail + the drafting flow (three sections: resume, letter,
   answers; the refusal card with "Rewrite without those →"). It has the rose and the ground but has never
   had a design pass; it is the highest-stakes screen (the one that produces the thing you send).
4. **`saved.html` and the saved states**: the serif rows and the seek-rose empty state are in; the
   list itself is plain. Where does the band live on a saved row, and what does "applied" look like?
5. **The landing below the hero** on the web: "How it works" is a hairline section; the browse feed's
   sticky sliding sector chips at ≤620px are new and undesigned beyond function.
6. **Dark theme parity** — every guide so far measured light. Dark is where the tier fix and the discs are
   most likely to be wrong. Measure it.
7. **The menu sheet** (§15) is brand-correct now; the sheet's grab/close/section rhythm is functional
   only. Ken said he will send dropdown-menu styling — it has not arrived; design it or wait.

Things to leave alone: the rose geometry and the display cut, the band ramp, the tokens listed in the
guide's §8, the market hues, the hero.

## 5. Constraints that shape any design you hand back

- Three theme states, not two: no `data-theme` = light; `"system"` follows the device; `"dark"`.
  `light-dark()` carries colours only — never opacity, never a multi-part value.
- One ground; only `<html>` paints it. Sectional looks never edit global tokens.
- Container weight is importance: verdict filled, fact sunken, context bare. Never raise tier 1 to win.
- Honesty law: never claim what the reader has not done, never lead with what they lack. What-to-answer
  stays behind the tap.
- Motion: entries slower than exits; every card state (rest / hover / press) is a measured material
  ladder; reduced motion = zero CSSAnimation, same information.
- Fonts: Newsreader 400 for titles, the sans for the rest, JetBrains Mono tabular for numerals.
- Phone width is 390 with 360 and 320 checked; the header is one 56px row off the landing.
- Windows renders emoji flags as letters — flags are SVG.
- Every deliverable is a zip with a `BUILD-ORDER.md`; CSS + markup + a check that asserts BEHAVIOUR (a
  presence check proves nothing). The last two build orders are the reference format.

## 6. Files

| what | where |
|---|---|
| mockup (the spec surface) | `mockups/mobile.html`, `mockups/card.css`, `mockups/card.js`, `mockups/feed-sample.json` |
| self-contained mockup build | `C:\Workspaces\jobscout-mockup-2026-09-21\` and `.zip` (open `index.html`; `README.txt` has the pass log) |
| the site | `site/index.html`, `site/base.css`, `site/rose.js`, `site/hsheet.js`, `site/saved.html`, `site/apply.html`, `site/privacy.html` |
| the laws | `docs/THEME.md` (§14b motion, §15 the sheet, §18), `docs/ARCHITECTURE.md` ("Time is the fourth axis") |
| the checks | `tools/check_rose.mjs`, `tools/check_motion.mjs`, `tools/check_theme.mjs`, `tools/check_palette.py`; yours under `docs/references/stage1-2026-09-20/…/tools/` |
| your prior packs, filed | `docs/references/motion-2026-09-20/`, `docs/references/stage1-2026-09-20/`, `docs/references/correction-2026-09-21/` (with a status table) |
| native | Android `app/src/main/java/.../Theme.kt`, `Rose.kt`, `Mobile.kt`, `MainActivity.kt`; iOS `Ground.swift`, `Theme.swift`, `RoseView.swift` |
| live | https://jobscout.page · https://nairobi.jobscout.page (one step behind the mockup until the push) |

Stills of the current mockup (detail, browse, menu) were sent with the correction pass and are attached
alongside this file; the 09-20 folder holds the web/Android stills, still accurate for everything but the
phone header and the card tiers.
