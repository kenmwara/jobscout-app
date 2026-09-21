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

### Colour: three axes, three channels

The app carries three independent signals, and each owns exactly one channel.
Getting this wrong is not a taste problem — it makes the UI state two things
at once.

| Signal | Channel | Notes |
|---|---|---|
| **market** | the hero gradient and the active market chip | That is the entire list. |
| **theme** | light or dark | The reader's device, never the market's. |
| **band** | hue, exclusively | `gate.verdict` depends on it across Telegram, ops, web and both apps. |

**What this replaced.** The market drove everything: Canada was light, Kenya
was dark with a green accent. So a fit of 72 — PING, which is indigo — sat
beside a green `Prepare application` button, and *both were correct in the
colour language while contradicting each other*. Green means auto (fit ≥ 80)
wherever it is small and saturated, so a market may not spend it on a control;
painting a whole market green also spends the strongest signal on a fact the
flag chip already tells you, and every card in it reads as a success card.
Binding dark to Kenya cost a second thing: nobody in Nairobi could have light,
and nobody in Vancouver could have dark.

**Theme resolution: three states, one attribute — and the absent state is
LIGHT.** THEME.md's zip has absence mean "follow the OS"; the shipped
contract inverts that, because light is the default on all four surfaces:
**no attribute is light, `data-theme="system"` follows the device,
`data-theme="dark"` is dark.** `base.css` carries the matching
`:root[data-theme="system"]` block inside the `prefers-color-scheme: dark`
query. Web, the phone mockup, Android (`ThemeChoice`) and iOS
(`preferredColorScheme`) all agree. A harness written to the spec instead of
the code reported two failures against a correct implementation. `data-market`
is a separate attribute and must never set `data-theme`; all combinations are
legal, and Kenya in light is not a bug.

Every colour is therefore defined **once**, as `light-dark(light, dark)`.
Only the non-colour differences — shadows, the halo opacity, the card border —
are written out in all three states, because `light-dark()` cannot carry them.

**The toggle is a three-state control** in the header — Light / Device /
Dark — because a two-state switch cannot express "follow the device" at all.
It applies live; no reload. Both native clients carry it too, as one word in
the top bar that cycles the three states: both had the whole mechanism and
no control, so Android was permanently light with no route to dark, and the
Android sweep proves the control in **pixels** — a stored value nothing
re-reads is the defect it guards (Compose does not observe
SharedPreferences).

⚠ **A correction, because it is the kind of mistake that gets written down
and believed.** An earlier version of this section claimed Chrome would not
re-resolve `light-dark()` when `color-scheme` changed at runtime, and that a
toggle therefore had to reload. That was wrong. Every one of those readings
went through `body{transition:background .45s,color .45s}` **in a hidden
browser pane, where transitions are paused at frame zero** — so
`getComputedStyle` returned the colour the page was animating *from*. With
transitions suppressed, all three states resolve synchronously and an OS flip
lands live with no reload. `tools/check_theme.mjs` suppresses transitions
before every read, and says so at the top; do not remove that.

⚠ `light-dark()` is Chrome 123+ / Safari 17.5+ / Firefox 120+, and on older
engines the declaration is invalid at computed-value time rather than merely
light. If that floor ever matters, wrap a two-block fallback in
`@supports not (color: light-dark(#000,#fff))` rather than reverting.

**The action is deep-ink, not the brand.** `--btn`/`--btn-ink` are
`var(--ink)`/`var(--canvas)`, so the button is deep-ink on cream in light and
cream on deep-ink in dark — 17.44:1 and 17.93:1, and it inverts for free.
Indigo carries white at only 4.58:1, so it stays brand, links and selected
state.

**Adding a market costs no colour.** `html[data-market]` is the default every
market inherits; a market gets its own block only when it earns its own domain
and its own pitch, which today is Kenya and only Kenya. The bands already hold
green, indigo, orange and pale blue — you can just about paint two markets
around that and you cannot paint four, and nobody remembers four market
colours anyway. US and UK are Canada with a different region gate, not a
different product: same surface, and the difference spent on the copy and the
counts. One thing that breaks before the colour does: the segmented market
pill stops working past three, and at four has to become a menu.

**The halo is one fixed layer on `<html>`** — three blooms plus the dot
texture, `background-attachment: fixed`, on every route. No page may paint
its own body ground: `/saved` and `/privacy` once did, and measured 1.000 at
every corner while `/browse` was on spec — the halo was underneath. The two
themes use two different axes: **dark is brightness** (indigo blooms on
ink, 1.258:1 at the corner, held within 12° of the canvas's 250° hue —
amplitude alone tuned it into navy once) and **light is hue** (amber and
peach at low alpha, ΔE 6.0), because white on cream caps at 1.105:1 and the
spec's white bloom was ΔE 2.9 at its peak — on spec and invisible.
`tools/check_halo.mjs` reads the pixels, dark on contrast, light on ΔE.

**The page mark rides with the halo.** The eight-dot rose sits behind every
view at 1400px, `position:fixed` at the viewport's centre, `z-index:-1`
inside the page's own stacking context — above `<html>`'s halo, below every
card — and wanders on a 48s figure (`markwander`, off under reduced motion).
One rule in `base.css`; pages carry only the markup, at body level (on
`index.html` a sibling of `<main>`, so the landing and browse share one
layer; inside `#v-browse` the landing had the halo and no discs). The mockup
paints the same ground under the phone frame. Android draws it in
`Modifier.ground()` — three radial brushes from per-theme `halo1/2/3` tokens,
the dot texture, the mark — behind the root box the list scrolls in, so it is
pinned by construction. Its wander **steps** (a 1.2s ease every 12s) rather
than animating per frame: a window that never idles breaks uiautomator and
stalls TalkBack alike. iOS does not carry the ground yet.

**The evidence card is a neutral** (THEME.md §16, decided: option C).
`--evidence-bg` at the surface's own hue, the band as a 2px left rule plus
the label; colour intensity is a budget spent over area, and a tinted fill
is for pill scale. The phone's evidence blocks measured 16,448px².

The tokens live in `site/base.css` (the header comment carries the measured
ratios), `android/…/Tokens.kt` and `ios/Sources/Theme.swift`;
`tools/check_palette.py` holds the clients to the web, bans the nine retired
pre-ember hexes from every shipped file, and refuses `--accent` as small
text. The fit dial on both phones reads the token sets — it carried its own
copy of the band colours and drifted. The artboards, the theme CSS/JSON, the
rebuilt brand kit and `MEASURED.md` (what the reference files actually
measure, including two `light-dark()` shorthands that drop the declaration)
are in `docs/references/colour-2026-09-20/`.

### Time is the fourth axis (motion v1, 2026-09-20)

The static system says what is true; the temporal system says it is alive.
`base.css` carries four real damped-spring curves as `linear()` — **snap**
180ms (controls), **settle** 340ms (anything with area, critically damped),
**arrive** 520ms (the rose and its numeral, 8.3% overshoot), **exit** 160ms
(anything leaving; it never overshoots and is always faster than an entry) —
plus stagger, travel and the press scale. Android solves the same springs
(`Motion` in `Theme.kt`, k = (2π/T)²) and iOS uses `response` = the CSS
duration; `check_palette.py` rule 8 holds Android to base.css within 1ms and
0.01 damping, because "close enough" constants are how two clients end up on
different clocks. What moves: each lit dot of the rose arrives one 46ms apart
from bearing 000 while the numeral counts on that clock and seats as the last
dot lands; settled roses breathe out of step (web/mockup only — on Android an
infinite animation would keep the window from idling, the reason the ground's
wander is stepped); only AUTO's pill pulses, once. Every actionable surface has
rest / hover / **press**, the press on exit timing; sector tiles carry a bar at
count/max; a filtered list leaves before it arrives. The lit count stays
round(fit/100·8) — the score, not the band — and the numeral stays serif on all
three clients. Spec and reasoning: `docs/references/motion-2026-09-20/`.

**Motion v2 (2026-09-20, the same night).** The rose is ONE glyph:
`site/rose.js` builds it for index, saved and the mockup, and `Rose.kt` /
`RoseView.swift` draw the identical geometry — law 9's ring inside the
display-cut viewBox — with the lit count = the band (AUTO 8 · PING 6 ·
UNSURE 5 · NEAR-MISS 3; `check_palette` rule 9 holds the three tables
together), unlit bearings at 14% of the ink scaled .55, the numeral mono and
tabular. A posting nobody scored carries the whole ring unlit and an
en-dash: the swept card is the scored card before the resume arrives. The
card: rose first, then identity, then three metadata tiers (band pill
filled, fact chip sunken, date bare), one evidence line on the card, the
heart in the action row, serif titles everywhere. The phone header is one
56px row — brand, a market chip, an ellipsis — and `site/hsheet.js` MOVES
the market switch, the full three-state theme control and the nav into a
§15 sheet and back. The empty saved page carries a seeking rose; a rate
limit is a state with a tabular countdown and two real routes; a grounded
refusal leads with what the product did and quotes each claim it could not
find, and "rewrite without those" re-runs with the claims sent as `exclude`,
which the worker folds into the instruction. Android's browse is a sticky,
count-sorted chip row where a tile grid put the first posting 81% down the
screen; the web does the same at phone width (the seventeen-tile grid
becomes one sticky sliding row: first posting 2,458px → 960px at 390pt). The
phone mockup carries the same five states as the web — header chip + menu
sheet, empty saved with the seeking rose, the rate-limit state with its
countdown, the quoted refusal with both actions — so the mockup and the
site are strictly the same design. iOS gained its ground
(`Ground.swift`: halo behind the scroll view, one cached texture tile, the
mark stepping every 12s and still under reduced motion or Low Power Mode).
Both sweeps take `--reduced` and must stay green under it.

### Run these before reading anything

Nothing here needs a CI credit. Every one of them was written after a defect that
read correctly in source and could not fire at runtime, which is the failure mode
this codebase actually has.

| Command | What it would catch |
|---|---|
| `node tools/audit_site.mjs` | Static: dead links, orphaned ids, unreferenced assets. |
| `node tools/audit_rendered.mjs` | The rendered DOM in both markets. Check 15: a class the stylesheet styles and the page never sets (this found 4.2KB of CSS painting a panel that had not existed for months). 16: a `setView` target with no view behind it. 17: a retry button whose label differs from the label it restores. |
| `node tools/cycle3.mjs [--live] [--dark]` | Playwright, both web markets, 76 behavioural assertions, in either theme. Walks the cold route (save a job, open it from `/saved` with nothing in session, upload a file) and every landing control. A 429 from the hourly scoring guard makes board checks **skip**, counted and named — a run full of skips has verified nothing and says so. Locally it rewrites `/apply` to `/apply.html`, because python's `http.server` has no clean URLs. |
| `node tools/sweep_mockup.mjs [--dark]` | Every control on the phone mockup, both markets: rail, upload, run, the fit floor (off a synthetic board, so it needs no API call), hearts, saved sweeps, tabs, drafts, the sheet's geometry, Copy. Unit-tests the letterhead extractor with no browser. A grounded refusal from the worker passes **when the reader is told why**. |
| `node tools/check_rose.mjs` | The rose in the list: lit dots = round(fit/100·8) read from the SVG's own aria-label, the 104-box geometry, no dot clipped, every numeral seated on its score, breathing offsets pairwise distinct, only AUTO's pill pulsing, and under reduced motion the same information with no CSS animation running. Serves the repo root (the mockup links `../site/base.css`). |
| `node tools/check_motion.mjs` | The tokens resolve; a tile, a chip and the mockup card have three DISTINCT states with the press on exit timing and no drop shadow on dark; nothing but `<html>` paints a ground over half the viewport; twelve light-ground samples stay in the cream's hue family in OKLCH. Found the reveal's `transform:none` pinning every hover and press. |
| `node tools/check_halo.mjs [--live]` | The halo in pixels: six regions per route per theme, content hidden. Dark on luminance contrast and hue; light on ΔE. Its first run reported green while measuring a light page against the dark constant. |
| `node tools/link_sweep.mjs [--live]` | Every link on every page fetched for real, both domains; a fragment counts as resolved when the destination routes it by script (`#browse`). |
| `node tools/api_sweep.mjs` | The worker's endpoints for contract (a bad body must be refused, not 500) and the postings' own URLs. |
| `node tools/cycle3.mjs --reduced` · `node tools/sweep_mockup.mjs --reduced` | The same sweeps under `prefers-reduced-motion: reduce`. Reduced motion means no motion, not less information: the same greens must come back. |
| `python tools/cycle3_mobile.py` | The same pass over adb, both markets. It taps by **visible label from a fresh dump every time** — the box grows as it fills, so a coordinate captured one step earlier misses. And it **removes `/sdcard/u.xml` before each dump**: a failed dump ("null root node", one in three under a busy window) leaves the previous file in place and `cat` returns it whole — a full, healthy tree of the wrong screen. The landing read as Browse for an afternoon that way. |
| `node tools/labels_audit.mjs` | Lists every control's text beside its element, for reading. "Watch this search" under a bell that emails nothing survived three audits because nothing ever printed the two together. |
| `python tools/check_palette.py` | The colour law below, asserted against `site/base.css` **and** `Tokens.kt`: the market touching anything but the hero; a role under the contrast bar that applies to it; a band that fails on its own fill, duplicates another band, or takes a text colour; a primary button filled with the brand; the action wearing the auto hue; `--live` used as text; and either client drifting from the other. |
| `node tools/check_theme.mjs [--live]` | The truth table in [THEME.md](THEME.md), executed: all 12 market x theme x OS cells, that switching market leaves the ground alone, that a stored choice survives a reload, that **no attribute is written when nothing is stored** (otherwise "follow the system" is unreachable after one load), that an OS flip lands live, and that the control offers three states rather than a switch. |
| `python tools/check_swift.py` | The file no machine here can compile: braced unicode escapes, `$0` in a nested closure, brace and paren balance. Two Codemagic failures in a row is what paid for it. |
| `python tools/check_console.py` | A tool that dies while **reporting**. Python takes stdout's encoding from the console codepage; cp1252 carries the em dash this repo writes in every message, cp437 and cp850 do not. `check_palette.py` really did exit 1 with no findings, and `check_swift.py` was proven to find two defects on cp437 and die before naming either — the same exit code as a clean report. Asserts that any tool which *can* print such a character reconfigures stdout first, detecting the guard as a **call** rather than a substring. |
| `bash tools/check_picker.sh` | 12 fixtures against `Select.kt` (see above). |
| `node tokens/generate.mjs --check` | **Design system v3.** `tokens/tokens.json` is the single source of every constant (type scale, space grid, radii, the 14 numbers behind the 24 band colours, thresholds, springs, the rose); the generator writes `site/tokens.css`, `android/.../design/Tokens.kt` and `ios/Sources/Tokens.swift`. Exit 1 if any of the three was hand-edited. Runs first in the deploy workflow. |
| `node tools/check_scale.mjs` | Every element that renders text sits on the type scale (`9 × 1.195ⁿ`, 13 steps), every padding/margin/gap on the 4px grid, and no surface above 4,000px² carries chroma outside the neutral family - the market hero is exempt by ruling, exactly once per page. Six site surfaces × two themes. Mutations: `off-scale-type`, `off-grid-space`, `band-wash`, `second-hero`. |
| `node tools/check_tiers.mjs` | The three metadata tiers as GEOMETRY: the verdict pill taller, wider and a different shape than the fact chip; the date bare. Fill never could carry it (on light the fact's fill is heavier than the verdict's). Mutations: `fat-fact`, `boxed-date`, `pill-fact`. |
| `node tools/check_honesty.mjs` | Law 12 through `site/evidence.js`: a browse card carries STRONGEST only, a saved row no prose, the apply page both; no line persuades or claims something about the reader; screen copy never leads with a lack. Mutations: `gap-on-browse`, `persuasion`, `ember-quote`, `lede-lack`. |
| `node tools/sanity.mjs [--mutations]` | **The sanity suite** (Chat, 2026-09-21): every check above and below in one verdict; `--mutations` re-runs each with a deliberate defect and reports ASLEEP if it still passes. Exit 0 green · 1 failing · 2 asleep · 3 not present. `SITE=https://jobscout.page` runs it on the live host. |
| `node tools/check_score_device.mjs` | The score is the rose, never prose ("fit 70", "70/100") - the bare numeral shipped twice on the phone; and every `data-band` owns a rose. |
| `node tools/check_dead_ends.mjs` | A stated block ("required", "unavailable", "cannot") sits in a container that declares it (`data-blocked`) and carries its own unblock; nothing asks the reader for what only the system can supply. |
| `node tools/check_one_primary.mjs` | One filled primary per region, measured by fill against `--action`; no filled action offered twice where one region contains the other. |
| `node tools/check_parallax.mjs` | The card's parallax: the transform differs at two pointer positions and is 3d; reduced motion is flat; the mockup's stretched link covers the whole card with the heart still on top; every card arrives - including ones re-rendered after the reader scrolled past them (a real stranding bug). |
| `node tools/check_halo_ext.mjs` | The three ground rules on pixels: one ground (the hero exempt by ruling), warm on light, the halo reaching every route, both markets. |
| `node tools/check_contrast.mjs` | Every text/background pair against the first painting ancestor; gradients and translucent chips sampled beside the text, never on a glyph edge. Found the hero's brand stop at 2.32:1. |
| `node tools/check_gaps.mjs` | GAPS.md as one file: headings are prefixes of their source, nothing is said twice around itself, the market chip carries one code, the first list member sits above 60% of a phone viewport, every target is 44px with a visible focus. |
| `node tools/check_lightdark.mjs` | Static: `light-dark()` with a top-level comma inside an argument is a three-argument call and the declaration is silently dropped. |

**A check that asserts presence proves nothing.** Every one of these was
mutation-tested — break the thing on purpose, watch it fail, put it back.

## Honesty rules (inherited from the fleet)

Numbers shown are measured or labeled. The demo scores REAL postings from the real daily sweep. Nothing in the UI claims capabilities the private pipeline doesn't have.
