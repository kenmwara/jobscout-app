# JobScout - the spec ledger

Generated from `docs/specs.json` by `python tools/specs.py --render`. Do not hand-edit.

Every requirement Ken has given, **in his own words**, with what proves it is live.

> WHY THIS FILE EXISTS. On 2026-09-22 three releases in a row came back with the same
> complaint and nothing reproduced, because the requirements only ever existed in the
> chat transcript. Once that scrolled past, the only surviving record was Claude's own
> summary - and the summary had recorded the IMPLEMENTATION ('drafts behind Read it /
> Redo') as though it were the REQUIREMENT. Ken had asked for 'straight to popup' two
> days earlier. Every check after that verified the build against itself, stayed green,
> and the product stayed wrong.

Audited **2026-09-22**. Source: every message Ken sent, pulled from the session transcripts under ~/.claude/projects/C--Workspaces-tbot-platform/*.jsonl, from the redesign brief of 2026-09-18T23:42 onward. Everything before that brief was superseded by it: 'Back to JobScout and we have a new re-design of the entire page.'

| | Requirement | Said | Surface | Proven by |
|---|---|---|---|---|
| **OPEN** | `drafts-editable-phone`<br><sub>2026-09-23</sub> | There should be an edit capability on the popups in mobile at cover letter writing, re-write resume and screening questions. Currently, they're all write-protected (which doesn't makesense) | android | `node tools/check_drafts_editable.mjs` |
| **OPEN** | `design-language-is-chats`<br><sub>2026-09-23</sub> | For any and all upgrades, ensure that you strictly stick to the design architecture & language provided by chat. Do not deviate as that just costs us a whole other build!! | both | **none** |
| **RULING** | `ev-bot-ingest`<br><sub>2026-09-25</sub> | if it is bots, filter at ingest (e.g. require a real interaction before counting 'open', drop known bot UAs, rate-limit per IP), without storing anything new that the privacy page does not allow | web | `node worker/tools/check_ev_shape.mjs` |
| _?_ | `ev-bot-shaped-day`<br><sub>2026-09-25</sub> | add a check to the existing harnesses so a bot-shaped day (opens >> runs, pastes without runs) is flagged | web | `node worker/tools/check_ev_shape.mjs` |
| _?_ | `soar-events`<br><sub>2026-09-25</sub> | maybe we should add JobScout to our soar | api | `node worker/tools/check_security.mjs` |
| _?_ | `soar-ip-security-only`<br><sub>2026-09-25</sub> | IP in security events only | api | `node worker/tools/check_security.mjs` |
| _?_ | `stats-gated`<br><sub>2026-09-25</sub> | gate /api/stats | api | `node worker/tools/check_security.mjs --live` |
| OK | `hero-box`<br><sub>2026-09-18</sub> | The large hero title with a text box/resume upload box on the landing page | web | `node tools/check_field_chrome.mjs` |
| OK | `market-switch`<br><sub>2026-09-18</sub> | CA/KE flip switch at the top with 2 completely different design languages - light/dark | web | `node tools/check_lightdark.mjs` |
| OK | `hero-tabs`<br><sub>2026-09-18</sub> | Useful tabs with relevant options - Full time, Contract, AI training, Remote... | web | **none** |
| OK | `newsreader`<br><sub>2026-09-18</sub> | Use Newsreader | web | **none** |
| OK | `drop-personas`<br><sub>2026-09-19</sub> | Remove "No resume to hand? Score a sample: Maya · Riley · Priya 309 postings swept this morning · 17 sectors" | web | **none** |
| OK | `one-box-two-jobs`<br><sub>2026-09-19</sub> | How about enabling the same upload bar for job title search text box in the same handler | web | **none** |
| OK | `title-placeholder`<br><sub>2026-09-19</sub> | Include type your job title... in the text box as well | web | **none** |
| OK | `page-order`<br><sub>2026-09-19</sub> | Move Browse by what the feed actually knows to be page 2 directly under the landing page, then How JobScout works can come after that - priorities! | web | **none** |
| OK | `feed-then-sweep`<br><sub>2026-09-19</sub> | Have the feed first, then the sweep following in both web & mobile | web+phone | **none** |
| OK | `posted-date`<br><sub>2026-09-19</sub> | Include posting date - that's super important! | web | **none** |
| OK | `claude-icon-running`<br><sub>2026-09-19</sub> | Keep the claude icon when generating results | web+phone | **none** |
| OK | `halo-everywhere`<br><sub>2026-09-19</sub> | Keep the background hero glow on subsequent pages as in image uploaded | web+phone | `node tools/check_halo_ext.mjs` |
| OK | `card-bloom-direction`<br><sub>2026-09-19</sub> | my idea was to have each card's bloom targeting a different direction from the rest - NW, NE, SE, SW | web | `node tools/check_motion.mjs` |
| OK | `filters-filter-the-run`<br><sub>2026-09-19</sub> | I can't filter results to remote only: instead, clicking on the remote button, gives me all the remote jobs available for all sectors, not as per my resume. | web | **none** |
| OK | `no-links-on-cards`<br><sub>2026-09-19</sub> | remove the cover letter and tailor resume links on the results card as they are still reflected in the application step | web | **none** |
| OK | `back-keeps-searches`<br><sub>2026-09-19</sub> | When I click back from any part of these pages, instead of being directed to the previous page I'm being taken straight back to the landing page - losing all my previous searches. | web | **none** |
| OK | `apply-from-our-page`<br><sub>2026-09-19</sub> | I should be able to apply from our apply page without necessarily having to go to the posting itself | web | `python tools/check_popups.py` |
| OK | `phone-market-button`<br><sub>2026-09-19</sub> | There's no KE button | phone | **none** |
| OK | `upload-stretches-the-bar`<br><sub>2026-09-19</sub> | Upload is fitting the whole resume text into the text bar and stretching it all the way down | web+phone | `python node tools/check_field_phone.mjs && python tools/check_popups.py` |
| OK | `prepare-button`<br><sub>2026-09-19</sub> | There is no prepare application button | phone | `python tools/check_popups.py` |
| OK | `how-it-works-in-app`<br><sub>2026-09-19</sub> | How it works is currently pointing to my GH, while there's a page strip with that information right at the bottom of the landing page | phone | **none** |
| OK | `copy-per-answer`<br><sub>2026-09-19</sub> | the answers to those questions should each come with their own copy mechanism and icon so it's easier for the candidate to drop in answers one by one | web+phone | **none** |
| OK | `reload-lands-on-matches`<br><sub>2026-09-20</sub> | Bug - Refreshing on loading page takes me to matches | web+phone | **none** |
| OK | `straight-to-popup`<br><sub>2026-09-20</sub> | Resume and cover page helper should go straight to popup | web+phone | `python tools/check_popups.py` |
| OK | `centre-the-popup`<br><sub>2026-09-20</sub> | Centre the popup | web | `python tools/check_popups.py` |
| OK | `click-outside-closes`<br><sub>2026-09-20</sub> | Clicking outside the popup should exit the popup | web+phone | **none** |
| OK | `pulsing-claude-mark`<br><sub>2026-09-20</sub> | Resume builder is taking way too long - have the claude icon pulsing to let the candidate know it's working not frozen | web+phone | **none** |
| OK | `saved-built-out`<br><sub>2026-09-20</sub> | Saved sweep is great, just needs to be built out properly and in the same design language | phone | **none** |
| OK | `how-jobscout-works-legible`<br><sub>2026-09-20</sub> | How JobScout works title is illegible | web | `node tools/check_contrast.mjs` |
| OK | `privacy-foot-squashed`<br><sub>2026-09-20</sub> | when you actually go to the privacy page bottom end, then everything's squashed up | web | `node tools/check_footer.mjs` |
| OK | `save-individual-matches`<br><sub>2026-09-20</sub> | can't figure out how to save matches on mobile / I can save the sweep, but not individual matches | phone | **none** |
| OK | `footer-links-in-app`<br><sub>2026-09-20</sub> | Footer links are pointing to web | phone | **none** |
| OK | `footer-on-every-page`<br><sub>2026-09-20</sub> | Footer links are not in every page as they should | phone | **none** |
| OK | `phone-halo`<br><sub>2026-09-20</sub> | There seems to be no background hallow in both mobile market designs | phone | **none** |
| OK | `ke-titles-navy`<br><sub>2026-09-20</sub> | KE market - applications titles are not clear in the navy color | phone | **none** |
| OK | `default-light`<br><sub>2026-09-20</sub> | Default loading should be light for all 4 | web | **none** |
| OK | `theme-without-hard-reset`<br><sub>2026-09-20</sub> | For some reason, I have to do a hard reset before I can change light/dark modes... | web | **none** |
| OK | `halo-in-saved`<br><sub>2026-09-20</sub> | the same background halo in web matches should also be in saved, both dark and light | web | `node tools/check_halo_ext.mjs` |
| OK | `header-hover-highlight`<br><sub>2026-09-20</sub> | that highlight to be fixed as it should not be showing on hover across the entire title bar | web | **none** |
| OK | `discs-in-light`<br><sub>2026-09-21</sub> | Background discs are barely visible in light mode | web | **none** |
| OK | `rose-small-on-apply`<br><sub>2026-09-21</sub> | There seems to be a bug in the rose number on the applications page - it always appears small | web | `node tools/check_rose_scale.mjs` |
| OK | `dots-centred`<br><sub>2026-09-21</sub> | The three dots ... need to be centered | phone | **none** |
| OK | `menu-brand-language`<br><sub>2026-09-21</sub> | That menu is not in brand language | phone | **none** |
| OK | `resume-not-cached`<br><sub>2026-09-21</sub> | the web version seems to have saved a copy of my resume in its memory/cache - can't clear it not even with a hard reset | web | `node tools/check_gaps.mjs --only privacy` |
| OK | `clip-accessible-name`<br><sub>2026-09-22</sub> | (not reported - found while auditing) | phone | `python tools/check_popups.py` |
| OK | `picker-cannot-fail-silently`<br><sub>2026-09-22</sub> | (not reported - found while auditing) | phone | `python tools/check_popups.py` |
| OK | `footer-one-per-line`<br><sub>2026-09-22</sub> | (not reported as such - found while auditing 'everything's squashed up') | web | `node tools/check_footer.mjs` |
| OK | `save-a-sweep`<br><sub>2026-09-23</sub> | There's still no way to save a matched sweep, but I can save individual jobs through the heart | both | `node tools/check_sweeps.mjs` |
| OK | `matches-explain-themselves`<br><sub>2026-09-23</sub> | I still have the "<-your 8 matches" button on loading the landing page - not sure what those are being scored against if my resume is not persistent anymore | both | `node tools/check_resume_privacy.mjs` |
| OK | `landing-box-not-oval`<br><sub>2026-09-23</sub> | The web landing page upload box is oval in shape as opposed to being rectangular with rounded corners | web | `node tools/check_field_phone.mjs` |
| OK | `apply-anyway-both-surfaces`<br><sub>2026-09-23</sub> | Web has an "apply anyway" button for low scores, while mobile doesn't - should be standardized across both | both | `node tools/check_apply_parity.mjs` |
| OK | `drafts-editable-web`<br><sub>2026-09-23</sub> | Applications page is also write-protected in web - again, makes absolutely no sense! Should have capability to edit cover letter, resume and answer those screening questions | web | `node tools/check_drafts_editable.mjs` |
| OK | `demo-runs-retention`<br><sub>2026-09-24</sub> | Create a retention rule for demo_runs | web | `node worker/tools/check_retention.mjs` |

## What is not settled

**`drafts-editable-phone`** - Built: EditableText (the well ResumeField draws, without the paperclip and go), vm.editDraft -> patch() so an edit reaches the kept draft, and all three sheets wired. 23 source assertions pass and 5 mutations bite; compileDebugKotlin and assembleDebug are green. STILL OPEN because none of that is the app running: not yet driven on a device.

**`design-language-is-chats`** - A STANDING CONSTRAINT, not a task - it stays open on purpose. What it decided on 09-23: the design language has NO editing affordance and no saved-sweep component in it, and inventing either is the deviation this row forbids. So every control added today is built from what Chat already drew - the drafts are the RENDERED elements made editable in place (web) and the well ResumeField draws minus its two doors (phone); the keep-sweep control is the same `.allsweep` word as “show the whole sweep instead”; the name box borrows --r-chip, the hairline and the accent focus ring; the Saved page's sweeps reuse the `.group`/`.row` markup the watched searches already use. No new component on either surface. If Chat has patterns for these, they drop in over the top without moving the logic.

**`ev-bot-ingest`** - The source was not outside bots: it was our own Playwright checks (deploy gate, nightly --mutations, local sanity runs), 9,990 of 10,430 sessions in bursts that line up with GitHub Actions runs, plus the Android emulator harness. Filtered at the source instead of with the two examples: the page's ev() returns when navigator.webdriver (every Playwright/Puppeteer/Selenium browser), the worker refuses crawler/unfurler/headless/script user agents before the INSERT (read, never stored), and the apps skip counting on the emulator/simulator. NOT done: 'require a real interaction before counting open' (a person who reads and leaves is a real visit; unfurlers run no JS) and 'rate-limit per IP' (ev deliberately has no IP; no outside abuse was found). Needs Ken's ruling on both.

**`ev-bot-shaped-day`** - worker/src/counted.js botShaped(): flagged when 15+ new visits inside ten minutes, or 10+ pastes with fewer than one run per four, or 50+ visits with fewer than one run per fifty. /api/stats returns suspect per day, ops/stats.html leads with 'Do not quote these numbers yet' when any day is suspect. check_ev_shape.mjs tests the rule on the real 09-24 (flagged) and the real human remainder (not flagged), five mutations; --live runs nightly in checks-nightly.yml against the deployed /api/stats.

**`soar-events`** - worker/src/security.js audit() → ingest-worker over a [[services]] binding (project jobscout, bot_event_type security) → ops.tbot.trade/soar + ops Telegram on warning. Events: rate-limit refusal (once per IP-hash per hour), the request that trips the $3 daily budget (once per day), a wrong feed/stats/control secret (once per IP per hour), prompt-injection markers in a pasted résumé (pattern names only, never the text), and yesterday's machine-shaped day (worker cron). SOAR playbook pause-scoring/resume-scoring = POST /control/scoring (own CONTROL_SECRET) → every paid model call answers like the spent budget. check_security.mjs: 7 attacks caught, 6 honest résumés pass, 8 mutations.

**`soar-ip-security-only`** - Only audit() (security.js) reads cf-connecting-ip into an event; the counted-events table still stores no IP. privacy.html#security-events says so and states 90 days; the ops read-api deletes project=jobscout security events after 90 days (SECURITY_EVENT_KEEP_DAYS, checked against the page).

**`stats-gated`** - /api/stats needs Authorization: Bearer STATS_TOKEN (worker secret; unset = closed) and checks it before any query. A WRONG token is a SIEM event. ops/stats.html asks for the token once and keeps it in localStorage (the repo is public). api_sweep expects 401 without it; check_ev_shape --live and check_security --live read STATS_TOKEN from the nightly workflow's secret.

