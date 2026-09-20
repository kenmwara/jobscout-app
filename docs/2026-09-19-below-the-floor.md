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
- **iOS is written but not compiled.** No Xcode on this machine. Braces
  balance and the paren count matches HEAD, but it wants a Codemagic
  `ios-simulator` run before anyone calls it done.
