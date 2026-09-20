# JobScout — design handover for Claude Chat

Date: 2026-09-20. Prepared by Claude Code for a design pass over the **whole
product**: the website (4 routes), the phone mockup, and the two native apps.
Everything below is measured from what is live today, not from intentions.

> **Market is the hero. Theme is everything else. They never touch.**
> Read `docs/THEME.md` §0 and §17 before anything else; if a design disagrees
> with THEME.md, the design is wrong until THEME.md is changed first.

---

## 1. What JobScout is, in one paragraph

An honest job-fit reader. A private pipeline sweeps ~340 Canadian (and, on
`nairobi.jobscout.page`, Kenyan) postings a day; the reader pastes or uploads a
resume, Claude scores eight real postings against it, and the product shows the
score as a **rose** (eight graduated dots) with the verdict **band** — AUTO ·
PING · UNSURE · NEAR-MISS — plus the evidence: the strongest line and what to
answer. From the top card it drafts a grounded cover letter, then a resume,
and refuses to invent anything the resume does not contain. It is a public
portfolio exhibit for an AI-app-developer role, so **every number shown is
real or labelled**, nothing claims a capability the pipeline lacks, and the UI
never leads with what the reader is missing.

## 2. The surfaces, and where each one lives

| Surface | Live | Source | Stills in this folder |
|---|---|---|---|
| Web — landing, browse, saved, apply, privacy | jobscout.page · nairobi.jobscout.page | `site/index.html` (landing + browse are two views of one page), `site/saved.html`, `site/apply.html`, `site/privacy.html`; one stylesheet `site/base.css` | `web-*` — 3 routes × CA/KE × light/dark × desktop 1440 / phone 390 |
| Phone mockup (the native spec, driven for real against the API) | not served | `mockups/mobile.html` | `mockup-{ca,ke}-{light,dark}` |
| Android (Kotlin, Jetpack Compose) | Play closed testing, 0.9.1 tagged | `android/app/src/main/java/trade/tbot/jobscout/` — `Tokens.kt`, `Theme.kt`, `Rose.kt`, `MainActivity.kt`, `Apply.kt` | `android-*` from the emulator |
| iOS (SwiftUI) | simulator CI build only | `ios/Sources/` | none — no simulator here; the mockup's iPhone frame stands in |

The worker (`worker/src/index.js`, Cloudflare) is shared by all four; design
never touches it.

## 3. The laws — each one already cost something

1. **Three signals, three channels.** `market` → the hero gradient and the
   active market chip, *nothing else*. `theme` → light or dark, the reader's
   device, never the market's. `band` → hue, exclusively (green = AUTO wherever
   it is small and saturated, so no control may ever be green). Kenya in light
   and Canada in dark are normal states. (ARCHITECTURE.md "Colour: three axes")
2. **Theme contract:** no `data-theme` attribute = **light**; `"system"` follows
   the device; `"dark"` is dark. Web, mockup, Android and iOS all agree. The
   control is three-state (Light / Device / Dark), not a switch.
3. **Every colour is defined once** as `light-dark(light, dark)` in
   `base.css`; only non-colour differences (shadows, halo opacity, card border)
   are written out per theme. `light-dark()` returns a `<color>` only — a
   shorthand like `light-dark(1px solid a, 1px solid b)` silently fails.
4. **The action is deep-ink** (`--link` #1b1463, 14.33:1 on cream), never
   indigo (4.58:1). Indigo (`--accent` #4865ff / #a2baff dark) is brand, links,
   selection.
5. **Small text meets AA on both grounds.** Bands are tuned pairs: 7.0–7.6:1
   on their own fill in both themes (`--b-auto/ping/unsure/near` + `-bg`).
   Metadata chips take `--sunken` + `--text-2`, no hue.
6. **§16, decided — option C:** colour intensity is a budget spent over area.
   Evidence blocks sit on a near-neutral tint (`--evidence-bg`
   `light-dark(#f1f1fa,#2b284f)`) with a 2px left rule in the band colour;
   anything over ~4,000px² goes neutral.
7. **One ground, on `<html>`:** three radial blooms + a 24px dot texture,
   `background-attachment:fixed`, every route. No page paints its own body
   ground (saved and privacy once did and buried the halo). **Dark halo =
   brightness** (peak 1.26:1 at the canvas hue 250°); **light halo = hue**
   (amber/peach/gold at low alpha, ΔE 6 at the corner) because white on cream
   caps at 1.105:1 and is invisible. Subtle in light is *by design*.
8. **The page mark** (eight-dot rose at 1400px, 6% accent) is pinned with the
   halo — `position:fixed`, `z-index:-1` in the page's stacking context — on
   landing, browse and saved, wandering on a 48s figure, still under
   `prefers-reduced-motion`. Android draws the same ground in
   `Modifier.ground()` and steps the wander (1.2s every 12s) so the window
   idles. iOS does not carry the ground yet.
9. **The mark's geometry is canonical:** ring r=11 in a 24 box, eight bearings,
   radii 2.275→4.336 clockwise from 000; the two largest dots *touch* at 270/315
   on purpose. Display cut ≥48px with clear space; cropped cut in lockups and
   below the floor. Never "fix" the touching dots.
10. **Retired palette** — must not appear in shipped source: `ff6d39 cc3600
    328a3b 114e0b 5fd07a ff9b6f 2fbd6a 144d2b bf3200`. The ember is
    `--b-unsure` (3.70:1 as a rule/large, 7.0+ as text on its fill).
11. **Sheets under 620px:** full width, 90dvh, rounded top only, grab handle,
    30px icon Close, full-width action above the home bar, scrim .66, themed
    thin scrollbar; over 620px a centred dialog. (THEME.md §15)
12. **Honesty:** never claim what the reader has not done; never lead with
    what they lack; a refusal is shown with its reason, never silently.
13. **Type:** Newsreader (display/serif), Inter (UI), JetBrains Mono (data).
    All embedded (`site/fonts-embedded.css`); no new families without a
    licence note.

## 4. What is live today (so you design from the real thing)

- Landing: hero (the market's only channel) with the resume box that lights
  the hero's own mark on hover/focus; four policy chips (anchors into browse);
  sector tiles with live counts; "Browse the whole feed →"; "How JobScout works"
  strip; sources line. Browse: sector grid → filtered list, Jobs/Companies
  toggle, search. Saved: kept jobs and saved sweeps (also on the phone). Apply:
  cover letter → resume, with upload, the cold route from a saved job.
- Theme control (three-state) in the header on all four surfaces; the market
  switch is a translucent trough with a selected pill (selection is a theme
  token, never a market colour).
- Fit floor (55): when nothing clears it the product leads with *why*, the
  nearest score and an "apply anyway" route — web, mockup, Android, iOS.
- Evidence option C on all four clients; band ramp shared web ↔ Android via
  `check_palette.py`.
- Android 0.9.1 (ground, evidence C, theme control) is tagged; the signed
  build is waiting on Codemagic (support #20160). Play listing is closed
  testing; store graphics live in `docs/img/native/play-store/`.

## 5. Where design attention would pay — candidates, not a brief

- **iOS has no ground** (halo, texture, mark). Spec it as SwiftUI-drawable.
- **The landing below the fold** (`web-landing-2-*`): the tile grid → whole-feed
  button → "How JobScout works" strip reads as three unrelated blocks.
- **Card anatomy** on browse and on the phone: rose, band pill, metadata chip,
  heart; the rose is the score device (needle-is-the-score law) and must read
  at 52px.
- **The header on a phone** wraps (brand / market pill / theme control / nav)
  — see `web-*-phone.png`; the market pill breaks past three markets.
- **Android's browse** is a two-column tile grid that pushes the sweep list
  far down (`android-browse-ca-light.png`).
- **Empty and refused states**: saved page with nothing saved, a rate-limited
  run (the hourly guard), a grounded refusal ("the draft used 2 things your
  resume does not contain").
- **The Play/App Store presentation**: feature graphic, screenshots, icon in
  context (maskable safe zone 68%).
- Light halo visibility if a stronger presence is wanted — but the axis is
  hue, and any change must keep ΔE ≥ 5 and never exceed the dark peak's
  contrast; measure, do not eyeball.

## 6. How to hand work back so it ships

The 2026-09-20 colour pass is the template — `docs/references/colour-2026-09-20/`:

- **`THEME.md`-style spec**, numbered sections, every value with the number
  that justifies it (contrast ratio, ΔE, hue, px).
- **`CHANGELOG.md`**: a numbered, ordered list of *actionable* items, highest
  value first, each naming the token or component and the measured before →
  should-be.
- **Tokens** as `light-dark()` CSS (`css/theme-resolution.css` shape) and JSON;
  Claude Code never hand-edits hexes into components.
- **Demos** as single-file HTML (`halo-demo.html`, `sheet-demo.html` shape) —
  real content, both themes, both markets.
- **Stills** annotated where words are ambiguous.

Claude Code then implements, **measures** (pixels, DOM rects, contrast) and
**mutation-tests** every rule — a check that only asserts presence is
rejected. These will run on the result: `check_theme.mjs` (the truth table,
12 cells), `check_palette.py` (colour law, web + Android drift),
`check_halo.mjs` (the ground in pixels), `cycle3.mjs` / `sweep_mockup.mjs` /
`cycle3_mobile.py` (every control, both markets, both themes),
`check_console.py`, `link_sweep.mjs`, `audit_rendered.mjs`.

Things that have already been tried and reverted, so the argument is not
re-run: an oryzo-style restyle (rejected as hideous); market-coloured
controls and a green Kenya; a market that tints the page ground; a blob that
darkens instead of a halo that adds light; a 227° "navy" dark bloom; global
token edits to get a sectional look.

## 7. Assets

- Stills: this folder — `web-*`, `mockup-*`, `android-*` (regenerate with
  `node tools/handover_shots.mjs` + adb).
- Brand kit v2.3 (generated, `tokens/brand.json` is truth): `C:\Workspaces\jobscout\brandkit\` — mark cuts, lockups, wordmark, icons, band-state marks, PNG exports, Android/web bundles. Retired-ember set also rebuilt at `docs/references/colour-2026-09-20/brand/`.
- Reference measurements and demos: `docs/references/colour-2026-09-20/` (`MEASURED.md`, `Halo-*.png`, `Band-Ramp.png`, `Sheet.png`, `Tokens.png`, contact sheet).
- The approved redesign study the site was built from: `mockups/redesign.html` + `docs/REDESIGN-parallel.md`.
- Phone-specific checklist (touch, OLED, density, motion): `docs/PHONE-CHECKLIST.md`.
- Product logic for copy: `docs/HOW-IT-WORKS.md`; system and laws: `docs/ARCHITECTURE.md`.
