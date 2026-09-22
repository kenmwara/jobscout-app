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
   scored, and never written to storage. The earlier version DID keep it in the browser, where a
   hard reset would not clear it; that was found and closed, and `check_gaps --only privacy` fails
   the build if it comes back.
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
| A résumé is retained | Closed. Never written; a legacy record is scrubbed on load | `check_gaps --only privacy` |
| Telemetry re-identifies a reader | Closed by construction: no address column on `ev` | the schema |
| The product claims something it did not measure | Closed. A gap may not lead a card, a line may not persuade | `check_honesty.mjs` |
| A deploy ships behind a red suite | **Closed 2026-09-22.** Both deploy jobs need the checks | the gate itself |
| A check quietly stops testing anything | Closed. Mutations run nightly, and "asleep" is its own verdict | `sanity.mjs --mutations` |
| The database is lost | **Partly closed.** A daily backup, restored and compared, kept off Cloudflare | `backup_check.py` |
| **CORS is a wildcard** | **Open**, carried over from the July audit | nothing |
| **Feed tokens do not expire** | **Open**, same audit | nothing |
| A phone requirement is unproven because CI has no emulator | **Named, not closed.** `--skip-device` prints the seven that rest on it, every run | `specs.py --check` |

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
