# The sanity suite

```
node sanity.mjs --url http://localhost:8761/markup/browse.html
node sanity.mjs --url <pack> --site-url https://jobscout.page   # everything
node sanity.mjs ... --mutations     # also prove every check is awake
node sanity.mjs --only score,tiers
```

**Exit codes:** `0` all green · `1` a check failed · `2` a check is **asleep**
(a mutation did not break it) · `3` a check did not **run**.

Three is deliberately not zero. A check that did not run is not a check that
passed, and a suite that silently skips is worse than no suite.

## What is watched, and what it was

Every row below was a real defect in this product. That is the bar for
inclusion: a check exists because something went wrong, not because something
might.

| check | guards | the defect |
|---|---|---|
| `tokens` | the generated CSS/Kotlin/Swift still match `tokens.json` | five hand-maintained copies of the threshold table |
| `scale` | type on the 8-step scale, space on the 4px grid, no coloured surface outside the neutral family | 20 type sizes, 17 spacing values, a hero at AUTO's hue |
| `tiers` | verdict taller, wider, differently shaped than fact; context bare | the fact chip outweighed the verdict — 1.253:1 against 1.141:1 |
| `honesty` | no gap leads a card, no line persuades or claims, ember means one thing | "At 28, the resume is the gap" led a screen with a lack |
| `score` | every score is a rose; none is written as prose | "fit 28", then "fit 70" **after that was reported** |
| `deadends` | every stated block has an unblock beside it | "profile + posting required" under a button that could not run |
| `primary` | one filled primary per region; no action offered twice around itself | three identical filled buttons on prepare |
| `rose` | lit count equals the band, geometry canonical, nothing clipped | the rose was absent from every list surface |
| `motion` | three distinct material states, exits faster than entries | one elevation state in the whole product |
| `card` | titles are Newsreader 400 everywhere, three tiers three treatments | the phone shipped card titles in sans-bold |
| `parallax` | tilt tracks, reduced motion is flat, the stretched link covers the card | `translateZ` on the title shrank the click target to the title |
| `ground` | one ground, warm on light, the halo reaches every route | a section painted its own background; a 1.126:1 seam |

## Every check is mutation-tested

`--mutations` runs each check again with a deliberate defect injected. If the
check still passes, it reports **ASLEEP** and the run fails. Four assertions
in this suite were found asleep while it was being written, and each one was
asleep for an instructive reason — the notes are in the files.

**A check that only asserts presence is rejected.** Every assertion reads a
computed value off a rendered element.
