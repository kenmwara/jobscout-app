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
| **RULING** | `card-bloom-direction`<br><sub>2026-09-19</sub> | my idea was to have each card's bloom targeting a different direction from the rest - NW, NE, SE, SW | web | **none** |
| **RULING** | `apply-from-our-page`<br><sub>2026-09-19</sub> | I should be able to apply from our apply page without necessarily having to go to the posting itself | web | **none** |
| **RULING** | `centre-the-popup`<br><sub>2026-09-20</sub> | Centre the popup | web | **none** |
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
| OK | `filters-filter-the-run`<br><sub>2026-09-19</sub> | I can't filter results to remote only: instead, clicking on the remote button, gives me all the remote jobs available for all sectors, not as per my resume. | web | **none** |
| OK | `no-links-on-cards`<br><sub>2026-09-19</sub> | remove the cover letter and tailor resume links on the results card as they are still reflected in the application step | web | **none** |
| OK | `back-keeps-searches`<br><sub>2026-09-19</sub> | When I click back from any part of these pages, instead of being directed to the previous page I'm being taken straight back to the landing page - losing all my previous searches. | web | **none** |
| OK | `phone-market-button`<br><sub>2026-09-19</sub> | There's no KE button | phone | **none** |
| OK | `upload-stretches-the-bar`<br><sub>2026-09-19</sub> | Upload is fitting the whole resume text into the text bar and stretching it all the way down | web+phone | `node tools/check_field_phone.mjs && python tools/check_popups.py` |
| OK | `prepare-button`<br><sub>2026-09-19</sub> | There is no prepare application button | phone | `python tools/check_popups.py` |
| OK | `how-it-works-in-app`<br><sub>2026-09-19</sub> | How it works is currently pointing to my GH, while there's a page strip with that information right at the bottom of the landing page | phone | **none** |
| OK | `copy-per-answer`<br><sub>2026-09-19</sub> | the answers to those questions should each come with their own copy mechanism and icon so it's easier for the candidate to drop in answers one by one | web+phone | **none** |
| OK | `reload-lands-on-matches`<br><sub>2026-09-20</sub> | Bug - Refreshing on loading page takes me to matches | web+phone | **none** |
| OK | `straight-to-popup`<br><sub>2026-09-20</sub> | Resume and cover page helper should go straight to popup | web+phone | `python tools/check_popups.py` |
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

## What is not settled

**`card-bloom-direction`** - NEEDS KEN'S RULING. The directional bloom exists and is documented in site/index.html, but press feedback was REMOVED FROM THE CARDS on 2026-09-20 and kept on the chips only: the motif is laid out at 150% of its host, which on a chip is a press and on a card is large circles sweeping through the title for over a second. That was a judgement made without telling him, on a thing he had asked for twice.

**`apply-from-our-page`** - NEEDS KEN'S RULING, and he was told at the time: Greenhouse and Ashby need the EMPLOYER's key to post an application and Workday needs an account per tenant, so the ceiling is having every answer ready before the form is opened. That ceiling has not moved.

**`centre-the-popup`** - NEEDS KEN'S RULING. Centred on the web. On the phone it is a bottom sheet, deliberately and with the reason written into the mockup: an inset-on-four-sides window gave a ~600px reading pane inside a phone that already scrolls, and its top edge sliced the heading behind it in half. He has seen and used the bottom sheet since.

