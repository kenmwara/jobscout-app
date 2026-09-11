# JobScout — AI job-search copilot

**Live demo: [www.jobscout.tbot.trade](https://www.jobscout.tbot.trade)** — real job
postings, scored live by an LLM against a real candidate profile, with the reasoning
shown.

Built from the private pipeline that has run the author's own job search in
production since July 2026. The demo is not a mock: the postings are that
pipeline's actual daily sweep, the eligibility verdicts are its production
prefilter's own reasons, and every score and cover letter is a live Claude call.

## The 90-second tour

1. **Pick a candidate** (three personas) or paste your own resume text —
   processed in-memory for one run, never stored or logged.
2. **Live scoring.** The gate survivors go to Claude (Haiku-class) with an
   honest rubric — most postings are a poor fit and the model says so. Each
   result renders on the brand's **bearing rose** — the mark itself, carrying
   the data: fit 0–100 lights the eight bearings clockwise, and the band it
   lands in selects the route:
   `auto ≥80 · ping 70–79 · unsure 55–69 · near-miss <55`.
3. **Why those, and not the rest.** Underneath the results, the deterministic
   verdicts on every posting the sweep looked at: region-eligibility,
   fake-remote detection, title scope. Six stream and the rest sit behind a
   click. No tokens are spent saying no.
4. **Grounded cover letter** for the top match — drafted only from the profile
   shown, never inventing experience.
5. **Save what's worth keeping.** A posting enters your saved list only when
   you say so, and only on your own device.

The results come first on purpose. The gate list is the receipts, not the
opening act — and prices are not quoted at the reader on any surface.

## Architecture

```
visitor ── Cloudflare Pages (site/)
              │  /api/feed · /api/score · /api/letter
         Cloudflare Worker (worker/)
              ├─ guard 1 · per-IP sliding-window rate limit (D1)
              ├─ guard 2 · global daily budget breaker (D1) — over cap,
              │            the demo says so and serves a cached real run
              ├─ Claude (Haiku-class) — scoring + letters, prompts server-side
              └─ D1 — feed, telemetry, cached showcase
              ▲
   droplet cron (tools/publish_feed.py) — sanitizes the private pipeline's
   daily sweep into a public-safe feed (titles/companies/locations/reasons;
   no scraped bodies, no scores, nothing profile-derived)
```

Design decisions in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the plain-English
walkthrough for non-readers-of-code in [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).

## Why the guards are features

A public AI endpoint with no auth is an invitation. The demo's answer is layered
and visible: Haiku-class model only, tight token caps, server-side prompts, a
per-visitor rate limit, and a global daily budget breaker that **degrades
honestly** — when the budget is spent it says so and serves a cached (real,
labeled) run rather than pretending.

The two guards are not the same guard, and it is worth being precise: the
per-IP window is **pacing** (anti-abuse), while `DAILY_BUDGET_USD` is the
**spend** ceiling. Raising the first cannot cost a cent more than leaving it
alone; only the second bounds money.

## Principles inherited from the parent pipeline

- **Honest scoring** — the rubric anchors a clean match near 70 and treats
  niches as bonuses, never requirements; bad fits get called bad fits.
- **Eligibility first, tokens second** — deterministic gates run before any
  paid call.
- **No auto-submission, anywhere** — in the private pipeline a human clicks
  every Submit, because applications carry legal attestations. The demo keeps
  that boundary as a design principle.

## Native apps (Kotlin + Swift)

The same demo, built fully native — no webview, no cross-platform wrapper.
Both apps speak to the same guarded worker API and now carry the **full web
design language**, not just its palette — the bearing rose, results before
gates, collapsed lists, one hue per candidate:

- **`android/`** — Kotlin + Jetpack Compose (Material 3, ViewModel/StateFlow,
  kotlinx-serialization, OkHttp; the rose is a Compose `Canvas` in
  [`Rose.kt`](android/app/src/main/java/trade/tbot/jobscout/Rose.kt)).
  Built in CI as a debug APK.
- **`ios/`** — Swift + SwiftUI (async/await, `ObservableObject`, Codable; the
  rose is composed `Circle`s in [`RoseView.swift`](ios/Sources/RoseView.swift)).
  The `.xcodeproj` is generated in CI from [`project.yml`](ios/project.yml)
  (XcodeGen) — only sources are committed.

All three surfaces draw the rose from the **same geometry** — a 104-unit box,
eight dots on a ring of r=38 at 45° steps from bearing 000 — so the glyph is
identical on the web, on Android and on iOS. Nothing rotates in it, which is
deliberate: the dial it replaced turned a needle, and a rotation is the one
thing that can land off-canvas when its pivot is wrong.

**Try it on Android:** [download the APK](https://github.com/kenmwara/jobscout-app/releases/latest/download/JobScout-debug.apk) (debug build, Android 8+, sideload; SHA-256 in the release notes) — the link always serves the newest build.

Both apps carry the full feature set: upload a resume (PDF/DOCX/TXT) instead of typing it, open the original posting from any score card, and keep the ones worth keeping — **Save** puts a posting in your list, and only then does it get a stage to move through (applied → pending → responded → interviewed → callback). Nothing is sent anywhere and the app never submits an application.

CI is [`codemagic.yaml`](codemagic.yaml), and both workflows build green:
`android-debug` produces an installable APK; `ios-simulator` proves the
SwiftUI app compiles and links (device distribution waits on an Apple
Developer account).

Current native captures come from CI rather than a drawer of stale PNGs: every
`ios-simulator` build takes a simulator screenshot, and the manual
`android-screens` workflow boots an emulator and drives the whole pipeline.
(The previously committed native shots were removed here — they predated the
parity rewrite and showed a UI the apps no longer have.)

## Deploying

Both halves deploy from a push to `main`, and neither needs a command run by hand.

| what | trigger | mechanism |
|---|---|---|
| `site/**` | push | GitHub Action → `wrangler pages deploy` |
| `android/**`, `ios/**` | push | GitHub webhook → Codemagic |
| `worker/**` | manual | `cd worker && wrangler deploy` |

The site's Pages project is **direct upload**, and Cloudflare cannot convert one
to a Git-connected project — *"If you choose Direct Upload, you cannot switch to
Git integration later."* Converting would mean a new project, a new
`.pages.dev` subdomain and re-pointing the custom domain, so
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the same
wrangler command instead. It needs one repository secret, `CLOUDFLARE_API_TOKEN`.

Codemagic triggering lives in [`codemagic.yaml`](codemagic.yaml): `triggering:`
picks the event and `when.changeset` decides whether it actually runs, so an
Android commit does not spend an iOS build. The two are **parallel**
workflow-level keys — `when` is not nested inside `triggering`. It also needs a
repository webhook pointing at `https://api.codemagic.io/hooks/<appId>`; without
one the YAML is correct and simply never fires.

## Stack

Cloudflare Pages + Workers + D1 · Anthropic Claude (Haiku) · Python (feed
publisher) · vanilla JS, one self-contained page · Kotlin/Jetpack Compose
(Android) · Swift/SwiftUI (iOS) · Codemagic CI · JobScout Brand Kit v2.1
(the bearing rose, the cream/indigo system, Newsreader + Inter embedded).

---
*Author: Ken Kariuki — [tbot.trade/portfolio](https://tbot.trade/portfolio) · ken@tbot.trade*
