# JobScout — working rules

## The spec ledger comes first

`docs/specs.json` is every requirement Ken has given, **in his own words**, with what
proves it is live. `docs/SPECS.md` is the rendered view. Before changing anything, and
before reporting anything as done, run:

```bash
python tools/specs.py --new
```

It reads what Ken actually typed in the session transcripts and lists what the ledger has
not caught up with. Add each as a row, or decide it is not a requirement — but decide.

### Why this file exists

On 2026-09-22 three releases in a row came back with the same complaint and nothing
reproduced. The cause was not a hard bug. It was that the requirements only ever lived in
the chat transcript. Once that scrolled past, the surviving record was my own session
summary — and the summary had written down the **implementation** ("drafts behind Read it
/ Redo") as though it were the **requirement**. Ken had asked for "straight to popup" two
days earlier and the mockup had obeyed. Every check after that compared the build to
itself, stayed green, and the product stayed wrong for three releases.

### The four rules that follow from it

1. **Quote him, never paraphrase.** A paraphrase is how a requirement turns into whatever
   was built. `said` is verbatim, including the typos.
2. **Never record your own design decision as his specification.** If you answer a
   requirement differently from how he asked — for a real reason — the row is `changed`,
   not `live`, and it needs his ruling. Three rows are sitting at `changed` right now
   because of decisions taken without telling him.
3. **A row is `live` only when something was RUN.** Reading the code is `unverified`.
   Say `unverified` out loud; it is worth more than a confident wrong `live`.
4. **Every row names the check that proves it, and `none` is a finding, not a blank.**

### When he says "this is still the same"

Do not re-read your code and do not conclude you cannot reproduce it. Grep **his own
messages** out of the transcripts first, and diff them against what shipped:

```bash
python tools/specs.py --new
```

Three separate times, the check that should have caught a defect was green because it
measured the thing it was written for and was blind to the thing that broke:

- `check_gaps` measured a footer link's **height** while adjacent links shared a line
  ("CanadaKenya", "PrivacyWhat we count").
- `check_rose` measured the **dots and the band** while the numeral did not scale with
  the ring.
- `check_popups`'s first clip assertion measured **order** ("clip before go") while the
  clip sat adrift in mid-row, because the hint sits between them.

A green check is evidence about one assertion, never about the product.

## Verifying

- Mutation-test every check: break the code, confirm the check goes red, put it back.
  Judge by the VERDICT line, never by counting FAIL lines — a crash while reporting exits
  1 with nothing printed, which looks exactly like a finding.
- `node tools/sanity.mjs` is the web suite, `python tools/specs.py --check` runs every
  check the ledger names.
- **The two suites are different doors, and the ledger is one of them.** `specs.py --check`
  runs each row's `check` field AS A COMMAND, so a row must carry its runner:
  `node tools/check_x.mjs`, not `tools/check_x.mjs`. On 2026-09-23 five new rows named the
  file without `node`; sanity.mjs was 26/26 green and the deploy gate went red on four of
  the same checks, for the only reason a green check can be red — **nothing ran it**, and
  the web did not ship. A ledger row is not proof a check ran; it is a command, and a
  command missing its interpreter is a typo that reads like a citation. **Run
  `python tools/specs.py --check --skip-device` before claiming a push is deployed.**
- Measure a tap target by `offsetHeight`, not by rect: anything below the fold is still
  on its reveal spring and a 44px box reads 42.
- The emulator's keyboard delivers about one character in two hundred. Seed the résumé
  with the debug extra instead: `am start -n trade.tbot.jobscout/.MainActivity --es resume '<text>'`.

## Shipping

- A push touching `site/**` auto-deploys the web. A push touching `android/**` queues a
  paid Codemagic build. **A `v*` tag builds AND PUBLISHES to the Alpha closed track** — since
  2026-09-23 there is no human step between the tag and the testers, so a tag is a release
  decision rather than a build. **Never tag without being asked.**
- **A green Codemagic build is a claim; Play Console's Submission activity is the record.**
  0.9.7 was reported as live on the strength of a step named *Publishing* — which publishes
  artefacts to the build page — while Play had never heard of it, and the API had said so:
  empty `publish`, nothing for Google Play. Do not call a release published without a
  submission ID. 0.9.8 is #18.
- After a web push, re-measure on the live hosts, both markets:
  `SITE=https://jobscout.page node tools/check_field_phone.mjs`
