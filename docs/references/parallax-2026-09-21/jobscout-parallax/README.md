# JobScout — parallax, and blocked actions

Two changes to the card and the prepare screen. Both drop in on top of the v3
design system; neither adds a colour, a duration or an easing.

```
css/parallax.css   the card's hover, press and arrival      ← the main change
js/parallax.js     pointer tracking + arrival observer
css/blocked.css    a blocked action carries its own unblock
js/blocked.js      opens the résumé field in place, and moves focus
css/title-hover.css  the minimal fallback: just remove the underline
tools/check_parallax.mjs   4 assertions, 4 mutations, all firing
demos/             open parallax-light.html and move the pointer
```

## What replaces the underline

The title underlined on hover — a **fourth** signal for an event the card
already reported by lifting, brightening its edge, changing surface and
lighting the rose's next dot. The underline was the only one of the four
carrying no information.

In its place: **real parallax.** The card tilts up to 7° toward the pointer
and its contents sit at genuine depths — the rose 34px nearer the eye, the
actions 40px, the metadata 12px — so they separate as it moves. Three inputs,
one per platform reality:

| | |
|---|---|
| pointer | tilt + depth, tracked live, `(hover: hover)` only |
| touch | press + depth, played backwards, `(hover: none)` |
| both | **arrival** — layers land from −60px in reading order |

On a phone the arrival is where the drama lives, because a tap has no hover.

## A correction

I claimed the phone had the title underlined **at rest**. It does not. That
was a desktop pointer hovering a phone frame in a browser, and I read one
screenshot as a resting state. There was only ever the web problem.

## Two bugs this found in its own CSS, both invisible on screen

`tools/check_parallax.mjs` assertion C tests that the stretched link covers
the whole card. It earned its place twice:

1. **`translateZ` on `.jcard__title`** — a transform on any **ancestor** of
   the anchor becomes the containing block for its absolutely-positioned
   `::after`, so the stretched link silently shrank from the whole card to the
   title's own box. The card's padding and its entire lower half stopped being
   clickable. Nothing about it was visible on screen or in a screenshot.
2. **The fix caused the same bug again.** Moving the depth to a span inside
   the anchor and running `transform-style: preserve-3d` down the chain to
   reach the card's 3D space — `preserve-3d` *also* establishes a containing
   block. Same failure, different cause.

**The constraint that falls out of it:** no ancestor of the anchor may be
transformed, and the anchor may not be `preserve-3d`, so **the title cannot be
lifted in Z at all** while the link is stretched from a pseudo on it. The link
is functional and the title's depth is decorative, so the link wins. The drama
is unaffected — it lives in the rose, the actions and the metadata.

**And reachability is settled by `pointer-events`, not 3D order.** Layering
the overlay in Z turned a simple hit-testing question into a question about
3D sorting through four levels of `preserve-3d`, and it did not work. Depth is
visual; reachability is one line.

Three mutations written to break assertion C failed before one worked, which
is how you find out what is actually holding a thing up.

## Blocked actions

The prepare screen shows **"profile + posting required"** in ember under a
button that cannot run. That line is a dead end: it names a precondition and
offers no way to meet it — the honesty law's failure mode from the other
direction, leading with what the reader lacks and then stopping. It is also
the only ember on the screen, so the eye goes to the one thing that cannot be
acted on.

**A control that cannot run does not explain why. It becomes the action that
makes it runnable.** "profile required" is a fact about the system; "Add your
résumé" is a thing the reader can do, and it carries the same information.
The résumé field then opens **in place** — the same component the hero uses —
and focus moves into it, so the posting is never lost.

**"posting required" is not the reader's problem.** If the posting is missing
the scorer has nothing to compare, which is a **refusal** and already has a
surface. Never ask the reader to supply something only the system can.

## Still outstanding

The prepare screen renders the score as **"Sun Life · fit 70"** — a bare
numeral in a text line. That is §10.1 of the correction guide and it is
unrelated to either change here.

## Run it

```
python3 -m http.server 8771            # from demos/
node tools/check_parallax.mjs --url http://localhost:8771/parallax-light.html
node tools/check_parallax.mjs --mutate flat | ignore-motion | shrink-link | bury-actions
```

All four assertions green; all four mutations break the check.
