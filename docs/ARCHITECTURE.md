# JobScout App — Architecture

**Purpose:** portfolio showcase of AI-app craft. A hiring manager lands on a URL and, inside 90 seconds, watches a real LLM score real job postings against a real profile — with the reasoning visible, the eligibility gates explained, and the costs controlled. Everything demonstrated is genuinely how the private pipeline has run in production since July 2026.

**Non-goals:** revenue, accounts-at-scale, auto-apply (the private pipeline's hard rule — a human clicks every Submit — is a design principle here too, and part of the story).

## System shape

```
                     visitor
                        │
        Cloudflare Pages (site/) — the demo UI
                        │  POST /api/score  · GET /api/feed
        Cloudflare Worker (worker/) — the AI edge
          ├─ guard 1: per-IP rate limit (D1 sliding window) — PACING, not spend
          ├─ guard 2: global daily budget breaker (D1 counter;
          │            over cap → serve cached showcase results)
          ├─ Claude (Haiku-class) — scoring w/ the honest rubric
          └─ D1 — demo telemetry, cached results, daily feed
                        ▲
        droplet cron (tools/publish_feed.py) — sanitizes the
        pipeline's real daily sweep into feed.json (title/company/
        location/remote-policy/source link; no scraped bodies)
```

## The demo flow (the 90 seconds)

1. Land: one sentence of what this is + a live counter of today's real sweep (n postings, n sources) — proof it's alive, not a mock.
2. **Add a resume** (upload or paste; processed in-memory, never stored — stated inline), say where you are and whether the work must be remote. The three sample candidates were removed in September 2026: they asked the visitor to do the product's work before it had done any, and the box is the whole entry point now.
3. Watch postings stream through the gates: eligibility verdicts first (deterministic, instant, explained — "US-only remote: rejected for a Canada-based candidate"), then LLM scoring on the survivors with the rubric's reasoning rendered per posting.
4. Top match: one-click grounded cover-letter draft (Claude, streaming).
5. Footer tells the truth: what model, what it cost (live cents counter), what's cached, link to the code.

## Cost + abuse model (public AI endpoint, no auth)

- Haiku-class model only; max_tokens tight; prompts server-side (never client-editable).
- Per-IP: N scoring runs per hour (D1 sliding window on hashed IP).
- Global: daily spend cap in D1; breaker flips the demo to cached precomputed results with an honest "live budget spent for today" banner — the breaker itself is a showcase feature (screenshot-worthy).
- Pasted resumes: in-memory only, size-capped, stripped to text, never logged, never stored — privacy note inline.

## Markets

One worker, one site, one app; the market is a parameter. `ca` is the default and the
pipeline's own verdicts. `ke` (the Kenya market, nairobi.jobscout.page) is the same daily
sweep re-gated by the publisher for a hire based in Kenya, published to the same D1 `feed`
table under a suffixed day key, served by `/api/feed?market=ke`, and scored with a Kenya
rubric block when `/api/score` receives `market: "ke"`. The site picks the market from the
hostname; the apps from a switch. Kenya-only sources are marked at the sweep and never reach
the operator's own pipeline. Adding a market is a gate function, a persona set and a rubric
block — nothing structural.

## Repo conventions

- `site/` — Pages app (Brand Kit v2.2: the indigo bearing rose on cream). `base.css` holds
  the design language every page shares; page-specific rules follow it in each page's own
  `<style>`. A page that redefines a token drifts, so none of them do.
- `worker/` — the API Worker (wrangler), D1-backed guards.
- `tools/` — droplet-side feed publisher (Python, runs beside the private pipeline; publishes sanitized JSON only).
- `android/`, `ios/` — the native clients. Same worker API, same picker.
- This repo goes **public** at polish time — code quality is part of the exhibit.

### Building Android without CI

Codemagic minutes run out, and a build you cannot run is a build you find out about late.
The whole toolchain fetches headlessly and the debug APK builds locally in ~2½ minutes:

```bash
# once: JDK 21 (already present), then the SDK
mkdir -p ~/android-sdk/cmdline-tools && cd ~/android-sdk
curl -sSLo cmdtools.zip https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
unzip -q cmdtools.zip -d cmdline-tools && mv cmdline-tools/cmdline-tools cmdline-tools/latest
yes | cmdline-tools/latest/bin/sdkmanager --sdk_root=$HOME/android-sdk --licenses
cmdline-tools/latest/bin/sdkmanager --sdk_root=$HOME/android-sdk \
  "platforms;android-36" "build-tools;35.0.0" "platform-tools"
```

```bash
# every build — tools/gradle.sh fetches its own pinned Gradle, so none is needed on PATH
export ANDROID_HOME=$HOME/android-sdk ANDROID_SDK_ROOT=$HOME/android-sdk
bash tools/gradle.sh :app:assembleDebug -p android --console=plain
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Do not pass `-q`: it hides the task list, so a run that did nothing looks identical to a run
that compiled. Check for `> Task :app:compileDebugKotlin` and the APK's timestamp instead.
CI is still the only path to a **signed release** build.

### The picker has four implementations, and they must agree

Which eight postings meet Claude is decided client-side, so the same logic is written four
times: `site/index.html` (`runPipeline`), `android/…/Select.kt`, `ios/Sources/Select.swift`
and `demo_eval.py` in the **jobscout** repo, which is the fixture harness. **Change all four
together.** A banker on the phone must meet the banking postings they would meet on the site.

Two checks, and between them they cover it:

- `bash tools/check_picker.sh` — 12 fixtures against `Select.kt`. It needs kotlinc and
  neither Gradle, the Android SDK nor a device, because `Select.kt` is pure logic. A check
  that needs a CI credit is a check that stops being run.
- `venv/bin/python tools/demo_eval.py` on the droplet — 66 profile fixtures against the real
  daily feed. ⚠ It carries its **own copy** of the picker: on 2026-09-18 it reported 66/66
  after a picker rewrite it had never received, so it was grading the old code. If you change
  the picker and demo_eval passes first time, check that you changed demo_eval too.

The rules the fixtures encode, each of which exists because it failed:

1. **Level distance costs, and the ends are dropped.** `levelOf` reads a title 0–4; a lead is
   not shown a 2027 internship and a graduate is not shown the VP. Only titles are read — a
   summary saying "senior engineers will thrive" is describing colleagues.
2. **Short of eight, return fewer.** Falling back to the unfiltered pool handed every
   category error straight back on a thin day.
3. **Sector is a split, not a gate.** Six from the sector the profile reads as, two from
   outside that must beat the six's median. As a gate, four in-sector postings hid the other
   three hundred; as a mere weight, a thin profile's noise words put a video editor in a new
   graduate's eight.
4. **A tail slot needs evidence, and the sector counts as evidence.** Outside the sector,
   require word overlap. Inside it, do not: a pharmacist writes "medication" where the
   posting says "Patient", so overlap is zero and the job is still right. Requiring it
   in-sector dropped four of five healthcare postings and filled the slots with every
   "Manager, …" in the feed, off the one word in "pharmacy manager".

### Run these before reading anything

Nothing here needs a CI credit. Every one of them was written after a defect that
read correctly in source and could not fire at runtime, which is the failure mode
this codebase actually has.

| Command | What it would catch |
|---|---|
| `node tools/audit_site.mjs` | Static: dead links, orphaned ids, unreferenced assets. |
| `node tools/audit_rendered.mjs` | The rendered DOM in both markets. Check 15: a class the stylesheet styles and the page never sets (this found 4.2KB of CSS painting a panel that had not existed for months). 16: a `setView` target with no view behind it. 17: a retry button whose label differs from the label it restores. |
| `node tools/cycle3.mjs [--live]` | Playwright, both web markets, 46 behavioural assertions. Locally it rewrites `/apply` to `/apply.html`, because python's `http.server` has no clean URLs. |
| `python tools/cycle3_mobile.py` | The same pass over adb, both markets. It taps by **visible label from a fresh dump every time** — the box grows as it fills, so a coordinate captured one step earlier misses. |
| `node tools/labels_audit.mjs` | Lists every control's text beside its element, for reading. "Watch this search" under a bell that emails nothing survived three audits because nothing ever printed the two together. |
| `python tools/check_palette.py` | Reads `site/base.css` **and** `Tokens.kt`: grounds ≥60&deg; off the accent, each role against the contrast bar that applies to *it*, bands against their own 14% tint over a card, no two foreground roles sharing a hex, and the two clients agreeing value for value. |
| `python tools/check_swift.py` | The file no machine here can compile: braced unicode escapes, `$0` in a nested closure, brace and paren balance. Two Codemagic failures in a row is what paid for it. |
| `python tools/check_console.py` | A tool that dies while **reporting**. Python takes stdout's encoding from the console codepage; cp1252 carries the em dash this repo writes in every message, cp437 and cp850 do not. `check_palette.py` really did exit 1 with no findings, and `check_swift.py` was proven to find two defects on cp437 and die before naming either — the same exit code as a clean report. Asserts that any tool which *can* print such a character reconfigures stdout first, detecting the guard as a **call** rather than a substring. |
| `bash tools/check_picker.sh` | 12 fixtures against `Select.kt` (see above). |

**A check that asserts presence proves nothing.** Every one of these was
mutation-tested — break the thing on purpose, watch it fail, put it back.

## Honesty rules (inherited from the fleet)

Numbers shown are measured or labeled. The demo scores REAL postings from the real daily sweep. Nothing in the UI claims capabilities the private pipeline doesn't have.
