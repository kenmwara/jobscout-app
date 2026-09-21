# Field-and-bar pack — as built (2026-09-21)

Chat's pack: `fix/` (CORRECTION.md, css/bleed.css, css/field.css, js/field.js, markup/field.html,
tools/check_bar_bleed.mjs, tools/check_field_chrome.mjs, fixtures, proofs). Unmodified. What shipped:

| Pack item | Where it landed | Notes |
|---|---|---|
| bleed.css — a bar that paints, bleeds | `mockups/mobile.html` `.ahead` | The sticky header bleeds to the screen edge (`margin-inline:-s4`), paints `color-mix(canvas 86%)` under `backdrop-filter`, fades at its foot with a mask; `@supports not` falls back to opaque canvas. The site's header already reached its edges (bar check green on every route). |
| field.css — one field, two densities | `site/field.css` (+ `mockups/field.css`, the same file) | Pack verbatim minus its `.hero__field` alias block (this product never had one). One SITE DEVIATION: a bar in `data-state="typing"` grows to ~5 rows (pre-wrap, `field-sizing:content`) so pasted text can be reviewed before the run; empty, it stays one line and its placeholder never wraps. |
| field.js | `site/field.js` | Classic script (`window.enhanceFields`), enhances on load and via a MutationObserver for screens the mockup paints later. `.md` added to ACCEPT (the site already extracts it). |
| markup/field.html — the bar | Site hero (`index.html` `.box.field.field--bar`), mockup hero and the mockup's browse screen (`FIELD_BAR`) | The site hero keeps its typewriter placeholder (its prompts are all short) and its "what Enter will do" hint inside the foot. The mockup bar placeholder is **"Paste or drop your résumé"**: the pack's "Paste your résumé — or drop a file" is 213px at the bar's 13px and the mockup's bar area is 192px (a 360px phone is the same), so check G failed on the verbatim text; both doors in 25 characters. |
| markup/field.html — the well | `site/apply.html` (`#profileField`), mockup prepare screen (`.prep__resume .field`) | `#profileBox` lost its own CSS (grip + `outline:none` gone); `#useProfile`/`#draftGo` are the `.field__go` arrow; the attach button keeps `#upLabel` for the busy pulse. |
| The app's own file door | index/apply extraction handlers, mockup delegated `change` on `.field__file-input` | The text from `/api/extract` lands in that field's own area and the field returns to `typing` (field.js had set `file`). |
| Browse caption → control | mockup matches screen | "example scores until you paste a résumé." followed by the bar itself. |
| Saved-empty | `site/saved.html`, mockup | Browse the sweep is primary, "Run a fresh sweep" quiet. |
| check_field_chrome.mjs | `tools/check_field_chrome.mjs` | On `tools/lib/routes.mjs` (site landing/apply/browse + mockup home/matches/draft, light + dark). Mutations: resize-grip, ring-inside, no-ring-outside, long-placeholder. |
| check_bar_bleed.mjs | `tools/check_bar_bleed.mjs` | Site landing/browse/apply/saved + mockup home/matches/draft/saved. Mutation: inset-bar. |
| Token names | `site/field.css` | The pack's `--text-2` does not exist here (the site's token is `--text2`); as shipped, the disabled arrow's `var(--text-2)` was invalid and fell back to the hero's inherited light ink (1.13:1). Renamed. The visually-hidden file input carries `margin:0`, not `-1px` (4px grid). Attach chips and go buttons are 44px (the product's target law), which the pack's 30/34/36/40 were not; the bar is 52px tall. |
| The general rule | `site/base.css` | The global `:focus-visible` ring stops at the field (`:not(.field *)`), so the well lights instead; the `!important` it carried is gone. |

Both checks are in `tools/sanity.mjs` (ids `field`, `bar`). `.github/workflows/deploy.yml` stamps
`field.css` and `field.js` like the other shared assets. `tools/lib/routes.mjs` gained `openMockup(screen)`.

Side finding while running the suite: `check_parallax`'s `bury-actions` mutation only ever bit while the first mockup card sat below the fold (unlifted). With `preserve-3d` a lifted element wins by depth whatever its z-index, so the mutation now also drops the actions' transform. `check_gaps` reads visible focus on the `.field` wrapper for a control inside one (that is where field.css moves it).
