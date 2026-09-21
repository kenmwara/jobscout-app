# The product algorithm

The design half is `DESIGN-ALGORITHM.md`. This is the other half: what the
product is allowed to say, and when.

---

## 1. Score → band

The scorer emits a band. **The design never re-derives one.** `js/band.js` is
the shared contract so web, Android and iOS cannot disagree about what a 69 is.

```
auto     fit ≥ 80
ping     70 ≤ fit < 80
unsure   55 ≤ fit < 70
nearmiss      fit < 55
```

**CONFIRMED from the code 2026-09-21**, identical on web, worker, mockup,
Android and iOS.

**The scorer emits `fit` only — every client derives the band.** So this table
is load-bearing in five places at once, and it lives in `tokens/tokens.json`,
generated into `--threshold-*`, `object Band` and `enum JSBand`. Five copies
became one source with five readers, and `generate.mjs --check` fails the
build if any reader is hand-edited.

Run `tools/derive_thresholds.mjs <feed>.json` to check the table against real
data. It reports the interval each boundary lies in and **refuses to print a
value unless the observations pin it** — a midpoint is a classifier, not a
boundary, which is how an earlier draft shipped `ping` as 69.

**The law the UI depends on:** the number of lit dots IS the band, not the
score. The score is the numeral; the band is the shape. They are two readings
of one thing and must never be computed separately.

| band | lit | label | primary action | tone |
|---|---|---|---|---|
| auto | 8 | AUTO | Prepare application | go |
| ping | 6 | PING | Prepare application | go |
| unsure | 5 | UNSURE | Prepare application | qualified |
| nearmiss | 3 | NEAR MISS | **Apply anyway** | stretch |
| *unscored* | 0 | — | Score this against me | — |

A NEAR-MISS is never offered "Prepare application" as though it were a match,
and an AUTO is never hedged. The verb is part of the verdict.

---

## 2. What a line may say

Two lines are allowed about a match, and they mean opposite things:

- **STRONGEST** — what the resume **has** that this posting wants.
- **WHAT TO ANSWER** — what the posting **asks** that the resume does not
  evidence.

`js/evidence.js` enforces both as code. `validate()` runs at render time and in
`check_honesty.mjs`; a line that fails is **not shown**, because showing a line
that overclaims is worse than showing none.

### Content rules

1. **No persuasion.** The product is free and public and has nothing to sell.
   A banned-substring list covers "perfect", "ideal candidate", "no-brainer",
   "don't miss", "guaranteed", "world-class" and the rest.
2. **No claim about the reader.** "You have led teams" is a claim the scorer
   cannot support. "The resume shows team leadership" is an observation about a
   document. Four regexes catch the common shapes.
3. **STRONGEST states what is THERE.** A gap in a STRONGEST line is a
   category error; it belongs in WHAT TO ANSWER.
4. **STRONGEST must anchor to the resume; WHAT TO ANSWER must anchor to the
   posting.** A line that anchors to neither is about the reader's worth, and
   the product does not have an opinion about that.
5. **20–240 characters.** Below 20 it says nothing; above 240 it is a
   paragraph wearing a line's clothes.

### Placement rules

| surface | STRONGEST | WHAT TO ANSWER | quoted |
|---|---|---|---|
| browse | ✅ | ❌ | ❌ |
| saved | ❌ | ❌ | ❌ |
| detail | ✅ | ✅ | ❌ |
| prepare | ❌ | ✅ | ❌ |
| matches | ❌ | ❌ | ✅ |

**A browse card carries STRONGEST only.** What-to-answer stays behind the tap,
because a card that leads with a gap leads with what the reader lacks.

### The ember rule means one thing

The ember left-rule marks **the reader's next move**. A quotation from the
posting is **their demand**, not the reader's move — those are near opposites,
and a rule colour that carries both carries neither. A quotation takes the
neutral hairline rule. `check_honesty.mjs --mutate ember-quote` proves this is
enforced and not merely intended.

---

## 3. The candidate's state machine

```
      swept ──paste resume──▶ scoring ──▶ scored(band)
        │                                    │
        │                                    ├──▶ saved
        │                                    └──▶ preparing ──▶ applied
        └──▶ (no resume yet: rose unlit, en-dash, "Score this against me")

  side states: refused · rate-limited · empty
```

**swept** — a posting that exists but has not been compared to a resume.
Eight empty bearings say *there is a score to be had here* without a word, and
when a resume arrives they fill **in place**. Browse becomes matches. This is
why the swept card is the scored card with its rose unlit and not a different
component.

**scored** — the rose fills in bearing order from 000, one dot per 46ms, and
the numeral counts on the **same clock** so the two cannot drift: the last dot
lands as the numeral seats.

**preparing** — three steps: the letter, the resume, their questions. **One
filled button on the screen at a time**, and it is always the next move. A
finished step demotes its own button and says so in its description. No tick,
no badge, no green — no new vocabulary.

**refused** — the scorer declined because the posting asks for things the
resume does not mention at all. This is a **surface, not a band**: nothing was
scored, so no hue applies. It says so plainly and offers "Rewrite without
those", because inventing the missing details is the one thing the product
must not do.

**empty** — the rose **seeks**: it animates but no dot ever reaches full
opacity, so it can never be mistaken for a score.

---

## 4. Time

`whenOf(posted_at)` → `today` · `yesterday` · `N days ago` · `last week` ·
`N weeks ago`, and **nothing at all when the posting has no date**. An
invented "today" is a claim, and law 12 forbids claims.
