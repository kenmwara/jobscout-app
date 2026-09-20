# The day the product stopped telling people they were not good enough

**2026-09-19 → 20.** A long QA-and-build session on JobScout, under one
standing instruction from the operator:

> Click on every single link, button, text box, page, everything you created
> yourself and ensure it's working as you envisioned it — it's not enough to
> put things together, you have to follow through and ensure they're working
> flawlessly.

What follows is what that turned up. It is written down because most of it is
the same mistake wearing different clothes, and the shape is worth keeping.

---

## The bug that mattered

A founder's résumé scores badly against every engineering posting in the
sweep. Below a fit of 55 the product refused to draft anything, which was
defensible, and then stopped, which was not — so we added an explicit
"apply anyway", and gave the worker a `stretch` flag that wrote a *candid*
letter instead of refusing.

The first one it produced opened:

> I lack the B2B SaaS analytics infrastructure experience Linear's posting
> calls for — no warehouse work, no dbt, no multi-tenant instrumentation at
> scale.

The operator's reply:

> That's an extremely negative way to approach an application. That would not
> pass any recruiter. It's an absolute waste of the candidate's time to send
> that. The entire point of this app is to get the candidate a job! Not to
> make them feel inadequate!!

He was right, and the diagnosis is precise. The rule the product needs is
narrow: **never claim experience the candidate does not have.** That had been
quietly widened into **lead with what they lack**, which is a different rule
and serves nobody — not the candidate, who is binned in three seconds, and
not the recruiter, who never sees the work.

Same posting, same profile, same 32/100, after the prompt was rewritten:

> I have built and operated a multi-product portfolio end-to-end — strategy,
> infrastructure, payments, content, analytics — shipping nine products on
> under $50/mo infrastructure. The closest parallel to analytics engineering
> at scale is the Unified Ops Dashboard: …

Nothing invented, nothing conceded. The instruction now says: the overlap is
not obvious here, so find the strongest REAL parallel and lead with it; where
the posting names something absent, write about what they HAVE done instead;
no apology, no "although", no "I lack".

The same voice had leaked into three other places and all three were turned:

- the scorer's `weakest` field is asked for as the thing to **address**, not
  a list of absences — "No SQL analytics, no dbt, no BI tooling" became
  "Bring forward specific accounting systems experience … or a clear
  narrative for why you're stepping into a structured accounting function";
- the verdict is confined to the **distance between a posting and a profile**.
  *"Ken thrives alone"* was a real verdict this shipped. A scoring rubric
  reading a résumé is in no position to say that, and the person it is about
  is the one reading it;
- the below-floor screen is a rewrite brief rather than a refusal, and the
  route it recommends first is the rewrite, because that is what actually
  moves the odds.

## Three routes, not a wall

Below the floor the screen now offers:

1. **What to answer** — the three nearest misses' own verdicts, quoted. That
   is the rewrite list, and it came from the run rather than from the screen.
2. **Rework your resume and run again** — back to the box with the text still
   in it (it was not: the box is cleared on every load by design, so the route
   handed back an empty field until it learned to restore the profile the
   stored run already carries).
3. **Apply to these anyway** — one deliberate opt-in, one way, resetting with
   the next run. Nothing drafts below the floor by accident.

## The pattern in the bugs

Nine of them, and eight share a shape: **code that reads correctly and cannot
fire.**

| what | why it was invisible |
|---|---|
| `.scores` / `.scard` styled, never in the markup | valid CSS, elements all present — the below-floor panel had been rendering as bare text in one grid cell for months |
| `setView("home")` | hid both views and left a header above an empty document; no error |
| evidence popups on `:hover` only | a phone has no hover and a tap on a `tabindex` span raises no `:focus-visible`; the receipt behind every verdict was desktop-only |
| popover animated `opacity` | an animation is **paused at frame zero** in a hidden document, so it opened positioned, `aria-expanded` and invisible |
| `radial-gradient(circle R%)` | invalid — a circle's radius must be a length — so the whole declaration was dropped and the new press motif drew nothing |
| the rose's hard-coded palette | midnight violet on Kenya's near-black: a dark rose with an unreadable number |
| Android's `T.band` cutting "auto" at 85 | the web, iOS and its own `Rose.kt` cut it at 80 — an 82 wore an auto rose beside a PING pill |
| a stored run forcing Browse | refresh the landing page, or click the logo from Saved, and you landed on the matches |
| `failed(id, msg, "Draft it")` | 350 lines from the markup, so one failure renamed the button under the reader |

Four new checks came out of it, each **mutation-tested** — a check that cannot
fire looks exactly like a check that passes, which is the whole lesson:

- **15** a class the stylesheet styles and the page never sets
- **16** a `setView` target with no view behind it
- **17** a retry label that is not the label the button started with
- plus `tools/labels_audit.mjs`, which prints every control's text beside the
  element that carries it, because "does this label say what it does" is a
  judgement and a script that pretended otherwise would be the eighth bug in
  that table.

## Labels

Swept across all three clients. The ones that described their implementation:

- **"British Columbia — 2 on site"** — the 2 counts on-site postings in that
  province: a fact about the feed, hung on a control asking a fact about the
  reader. Nobody picks where they live by job count. → "I'm in British
  Columbia", default "I can work anywhere".
- **"Watch this search"**, under a **bell** — nothing is emailed and nothing
  is watched; the search is kept on the device and listed on Saved, which is
  what the toast always said and the button never did. → "Save this search"
  under a bookmark.
- **"Open the application"** — it opens the *employer's* posting, and this
  product cannot submit anything. Saying "the application" is exactly what
  made two buttons look like two ways to apply.
- **"Run the pipeline"** — our word for it, on the one screen a lost visitor
  lands on. → "Find my matches".

## What the operator saw that the checks did not

Every one of these came from him opening the thing:

- sector tiles sized to their own labels, no two edges aligned
- the below-floor panel using half the width it spans
- verdicts absent from the mobile card entirely — the score, the strongest
  point and the thing to answer came down the wire and rendered nowhere, so
  the phone said "28 · NEAR-MISS" and left the reader to guess
- "How JobScout works" in white on cream
- the privacy footer squashing "Browse today's sweep" over three lines
- the press ripple being a generic circle rather than the brand's own mark
- the résumé builder reading as frozen (it is the slow step — the whole
  document is written, then every name and number in it is checked against
  the original, twice if the first draft trips)

## Cycle 3

Two harnesses, committed, both asserting behaviour rather than presence:

- `tools/cycle3.mjs` — Playwright over both web markets, 46 assertions.
- `tools/cycle3_mobile.py` — adb over both markets on the emulator, tapping by
  visible label from a fresh dump every time, because every miss this session
  came from a coordinate that had scrolled away.

Both green. One mobile assertion was wrong rather than the app: it looked for
"Explore today's sweep" after a sector tile, which is further down a screen
that leads with the sector grid. The "bug" it reported was mine.

## Shipped

Build **22 (0.9.0)** — Codemagic `android-release`, verified from the signed
APK with `aapt2 dump badging` before upload (`trade.tbot.jobscout`,
versionCode 22, minSdk 26, targetSdk 36) and Play's own bundle table agreed.
Submitted to Closed testing – Alpha, "Start full rollout", managed publishing
off so it auto-publishes on approval. The same two informational warnings as
build 21 (no R8 deobfuscation file, no native debug symbols); neither blocks.

Closed-testing gate is unchanged: 12 testers, 14 days.

## Left open

- **The picker concentrates on one company.** A tech-lead résumé returned 5 of
  8 matches at Linear. That is a weak shortlist, and it is the real answer to
  "what stops a candidate defecting to the board we link them to" — the answer
  being that today's sweep is 24 sources, the largest board is 14.5% of it, and
  every one of those 8 came from a company career page that no board carries.
  Fixing it means the picker's four copies and the eval harness in the other
  repo; it was not worth doing mid-cycle.
- ~~**iOS is written but not compiled.**~~ Closed below: `ios-simulator`
  build **181** is green.


---

# After the build: what the phone found

Build 22 went live on the Alpha track and Ken installed it. Everything below
came out of using the two apps and the two sites, not out of reading them.

## The popup, four times wrong

The résumé and cover-letter helpers now open **straight into the popup** —
centred, dismissed by clicking outside — and so do the screening questions, on
the first click. Getting there cost four defects, three of them invisible on a
reading of the code:

- The reading window reused the class `.doc`, which the résumé pane already
  owned. `.doc{margin:0 0 6px}` beat `.docwin{margin:auto}`, so the centred
  dialog sat against the top-left corner. **Renamed `.docwin`.** When a new
  rule "does nothing", grep the class before touching it — that is the same law
  the `.band>.wrap` collision wrote in September, on its third appearance.
- `<dialog>`'s **`close` event does not fire in this Chrome** (it fires
  `beforetoggle`/`toggle` instead), so state never cleaned up after Escape.
  `closeWin()` is now reached from the Close button, the backdrop, Escape and
  both events.
- Backdrop-close was a rectangle hit test against the click coordinates — and a
  keyboard-issued click has coordinates `0,0`, which is outside the rectangle,
  so pressing Enter on the Close button closed the window *and* the one behind
  it. It compares target identity now.
- The **copy icons were dead** because the window was built by cloning
  `innerHTML`, which does not clone listeners, and the source card's overflow
  hid 8 of the 10 rows. The window **moves the live node** and puts it back on
  close.

## When the form is gated

`Open the employer's posting` reaches an ATS that will not show its
questionnaire without an account often enough to matter. The worker now falls
back to `genericForm(posting)` and returns `generic: true` — the eight
questions every ATS asks, answered from the résumé, clearly labelled as a
prepared set rather than that employer's real form. An empty state that says
"we could not reach it" is a dead end; this is the same two minutes of work
saved.

## Mirrored to the phones

Both markets, both apps: the mark **pulses while a run is in flight** (the dead
silence after the upload arrow was the single worst moment in the mobile flow),
matches save individually and not just as a sweep, the footer is on all three
frames and points at the app's own screens rather than the website, the
backdrop halo is drawn behind every frame, and Kenya's application titles came
off the navy that swallowed them.

## The Kenya palette, measured rather than tasted

"Less uglier colours" is a taste report with a structural cause. Kenya's greys
ran 140–144° against an accent at 142°: **the ground was wearing the accent's
hue**, so the accent had nothing to be brighter than and the whole screen was
one olive wash. No amount of tuning the accent fixes that — the greys move.

`tools/check_palette.py` reads `site/base.css` and `Tokens.kt` and asserts five
things: the grounds stay ≥60° off the accent (or are neutral), every colour
clears the bar **that applies to it** (body copy AA 4.5; fills, dots and
captions AA-large 3.0), a band clears AA against **its own 14% tint over a
card** rather than the raw surface, no two foreground roles share a hex, and
the two clients agree value for value.

Its first run flagged four things on **Canada**, and three were the check being
too blunt for a light theme — rescoped rather than shipped as noise. The
fourth was real: `--live` (#ff6d39) is a **fill** — a progress bar, a filled
heart, the full stop in the display line — and three places wrote *words* with
it at **2.48:1** on cream. The fix is not to dull the one loud colour in the
brand; it is to stop painting words with it. `.age.new` and the `required`
marker take `--b-unsure`, which itself moved `#cc3600 → #b23200` because it sat
at 4.15 on its own tint. Rule 6 keeps it that way, with each legitimate
`currentColor` use named.

`tools/check_swift.py` is the same idea for the file no machine here can
compile. Its rule 3 first produced 20 false positives (it matched against the
stripped text and sliced the original), then flagged `var body: some Scene`;
both were fixed before it was allowed to pass.

## The mark: I overruled a decision that had already been made

Ken asked about promoting the uncropped full-circles mark. The decision doc
recommended keeping the crop primary and carrying the uncropped version as a
display cut — and, in a comparison table, noted that at the shipped ramp the
two largest dots sit **0.041 units apart** (0.88px at 512, i.e. merged). I
verified that independently and changed the ramp's top from 4.336 to 4.089 in
both the site and Android.

That was wrong. `tokens/brand.json` says it in plain words: *"at 270 and 315
the two largest dots touch — the sweep closing on itself. The crop hid this;
the display cut owns it, which is why it has a floor."* The touch is the
design. Both files are back on the canonical `r = 2.275 + 0.2944i` ramp, and
the Android mark is cropped again — it draws at 18dp in the lockup, which is
exactly the case the floor exists for.

**The law: a measurement that contradicts the token source is a question for
the token source, not a licence to edit the geometry.**

## Brand kit v2.3

Installed over v2.2 in `jobscout/brandkit`: 13 new files (seven
`mark-display-*.svg`, four document PDFs, two template assets), 14 changed
(including `tokens/brand.json`, `README.md`, `assets.py`, `rose.py` and both
Play feature graphics), 87 byte-identical. `site/icons/og-1280x640.png` was
refreshed from the kit; the app's Android mipmaps were already identical to the
kit's, all 23.

The two cuts, from the kit's own README: **`jobscout-mark.svg`** is the mark —
plate-less, cropped by its own square, good down to 16px.
**`jobscout-mark-display.svg`** is the display cut — nothing cut, **48px and
above with clear space**, never inside a plate and never in a lockup.
