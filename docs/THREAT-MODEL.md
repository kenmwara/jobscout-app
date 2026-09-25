# JobScout — the threat model

*One page. Written 2026-09-22, alongside S-Ryder's, because neither build had one and the asymmetry
that let a rider read a whole business is the kind of thing this catches.*

This is not a security policy. It is who can reach what, what the product assumes, and which check
would notice if an assumption stopped being true.

---

## Who there is

| Actor | How they get in | What they should reach |
|---|---|---|
| **Anyone on the internet** | Opens the site | The sweep, the scoring demo, and the drafting — all of it, with no account |
| **A tester** | Installs from the Play Alpha track | The same product, on a phone |
| **Ken** | The repository and the Cloudflare account | Everything |
| **Cloudflare and Anthropic** | Run the worker and the model | Whatever is sent to them, which is the point below |

**There are no accounts and no sign-in anywhere in this product.** That is the single most important
line on this page. It removes an entire category of risk — no credentials to steal, no sessions to
hijack, no password reset to abuse — and it creates exactly one in its place: everything is open to
everyone, so the only lever is *what the product is willing to do for a stranger*.

## What the product assumes

1. **A résumé is the most sensitive thing here, and it is not kept.** It is read for one run,
   scored, and never written to storage. **This page claimed that before it was true.** The browser
   kept one, which was found and fixed on 2026-09-21 — and the claim was then written here for the
   PRODUCT, while the Android app went on writing the whole résumé into SharedPreferences in plain
   text on every run and reading it back into the box at launch. Found on 2026-09-23, when the
   operator asked why his own résumé was in the upload bar when he opened the app. Both surfaces
   now store a fingerprint and never the text, a record written before the fix is scrubbed on the
   next launch, and `check_resume_privacy.mjs` asserts it on BOTH — because covering only the web,
   which is what `check_gaps --only privacy` did, is exactly what made the gap invisible.
2. **Telemetry must not become a profile.** `demo_runs` holds a hashed address for rate limiting.
   `ev`, the counted product events, deliberately has no address column, so the two cannot be
   joined and a counted step cannot be tied back to a network address. That is a schema decision,
   written in the schema, for this reason.
3. **The model is a cost, and a stranger can spend it.** Every scoring run is paid Anthropic calls.
   Without a limit, one script is an unbounded bill.
4. **Nothing is ever submitted on anyone's behalf.** The product prepares an application and stops
   at Submit. That is a deliberate ceiling, not a missing feature — see `apply-from-our-page` in
   `docs/specs.json` — and it is why no employer credential is ever held.

## What can go wrong, and what catches it

| Risk | Standing | What catches it |
|---|---|---|
| The demo is used to run up a model bill | Closed. An hourly cap per address, enforced server side | the worker's own tests |
| A résumé is retained | Closed. Never written on either surface; a legacy record is scrubbed on load | `check_resume_privacy.mjs`, `check_gaps --only privacy` |
| A résumé arrives through the one box that IS kept | **Named and capped 2026-09-23.** Naming a saved sweep writes the reader's own words to storage — the only text field on either surface whose contents persist. It is capped at 60 characters on both, because a box beside a résumé is a box someone pastes a résumé into. A cap is a mitigation, not a closure: 60 characters of a résumé is still 60 characters of a résumé | `check_sweeps.mjs` (`web-uncapped`, `android-uncapped`) |
| A kept sweep is attributed to the wrong résumé | Closed. Sweeps group on the fingerprint, never the name, so two résumés a reader gave one name stay two histories | `check_sweeps.mjs` (`web-merge-by-name`, `android-nogroup`) |
| Telemetry re-identifies a reader | Closed by construction: no address column on `ev` | the schema |
| The usage numbers count machines as people | **Closed 2026-09-25.** From 09-20 our own Playwright checks were ~2,000 "visitors" a day (the page posts to the live worker wherever it is served). The page is silent under `navigator.webdriver`, the worker refuses bot user agents (read, never stored), the apps skip the emulator/simulator, and 12,278 machine rows were moved to `ev_machine` by `worker/tools/ev_quarantine.py` | `check_ev_shape.mjs` (five mutations); `--live` nightly flags any bot-shaped day |
| The product claims something it did not measure | Closed. A gap may not lead a card, a line may not persuade | `check_honesty.mjs` |
| A deploy ships behind a red suite | **Closed 2026-09-22.** Both deploy jobs need the checks | the gate itself |
| A check quietly stops testing anything | Closed. Mutations run nightly, and "asleep" is its own verdict | `sanity.mjs --mutations` |
| The database is lost | **Partly closed.** A daily backup, restored and compared, kept off Cloudflare | `backup_check.py` |
| CORS is a wildcard | **Closed 2026-09-22.** An allowlist, and a request with no Origin is still answered | `check_cors.mjs` |
| A phone requirement is unproven because CI has no emulator | **Named, not closed.** `--skip-device` prints the seven that rest on it, every run | `specs.py --check` |

## A correction to this page, and why it is left visible

The first version of this table carried two rows marked open "from the July audit": a wildcard
CORS, and feed tokens that never expire. **Both belonged to the tbot dashboard, not to JobScout.**
The July audit was of `dashboard/api.py` and `subscribers.json`, and the rows were copied here as
though they described this product.

One of them was true by coincidence: this worker really did answer every origin on the internet,
and that is now closed. **The other does not exist.** JobScout issues no tokens of any kind — the
only things called tokens in this repository are CSS design tokens, the model's token counts, and
the public board identifiers in a Greenhouse URL. There was nothing to expire.

This is the same failure the spec ledger was built to stop, one document over: a finding was
restated from memory instead of read from its source, and the restatement became the record. It is
corrected rather than quietly deleted, because a threat model that has been wrong once should say
so — the next reader deserves to know which rows were checked against the code and which were
inherited from a summary.

The tbot items remain genuinely open, in tbot. They are deferred judgment calls there, with a
warning attached that a naive https-only allowlist would break the Capacitor app. That warning is
why the allowlist here answers a request with **no** Origin at all rather than refusing it.

## The lesson this model was written after

It was written after S-Ryder's, where **every write was guarded and every read was open**, from the
first commit, invisibly, because each write looked correct when read on its own.

JobScout has no sign-in, so it has no equivalent — but it has the same *shape* of risk in a
different place: **the things it is willing to do for a stranger are the whole attack surface.**
The hourly cap is the only thing standing between an open demo and an unbounded bill, and it is one
server-side check. That is the line on this page most worth re-reading in six months.

## What would change this page

Accounts, of any kind. Saved résumés on a server. Money, from a subscription or otherwise. Actually
submitting an application, which would mean holding an employer credential. Any one of those and
this is re-read rather than assumed.
