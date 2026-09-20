#!/usr/bin/env python3
"""Three axes, three channels. This is the rule, asserted.

    python tools/check_palette.py

The app carries three independent signals, and each one owns exactly one
channel:

    market  ->  the hero gradient and the active flag chip. That is the list.
    theme   ->  light or dark. The reader's device, never the market's.
    band    ->  hue, exclusively.

Until v2.3 the market drove everything: Canada was light, Kenya was dark with
a green accent. Two signals were painted in one hue, so a fit of 72 - PING,
which is indigo - sat beside a green `Prepare application` button, and both
were correct in the colour language while contradicting each other. Green
means auto (fit >= 80) at control scale, so nothing else may claim it there.

What each rule is here for:

  1. THE MARKET MAY NOT TOUCH THE PALETTE. A market block may set only the
     hero and its wash hue. This is the whole v2.3 rule in one assertion.
  2. Contrast per theme, each role against the bar that applies to IT: body
     copy AA 4.5; fills, dots and captions AA-large 3.0. Judging a 6px dot by
     the body-copy bar is judging it as something it is not.
  3. A band against ITS OWN fill, because that is the ground a band lives on.
     Measuring against the raw surface flatters it by about a point.
  4. A band may not be mistaken for body copy, and the four bands must be
     four colours. `b-near` was once byte-identical to `text2`, so a near-miss
     band was indistinguishable from body copy. Narrowed from "no two
     foreground roles share a hex", which fired on identities the kit makes on
     purpose - action-quiet IS the ping indigo, and --live IS the unsure
     solid. What it no longer covers is noted at the rule.
  5. Green is never the action colour, in either theme. Rule 1 stops the
     market painting a control green; this stops the palette doing it.
  6. Nothing paints WORDS with `--live`. It is a fill - a progress bar, a
     filled heart, the display full stop - and reads 2.48:1 as text on cream.
  7. index.html carries its own copy of the band tokens; it must agree with
     base.css value for value.
  8. Android's LIGHT_TOKENS / DARK_TOKENS must agree with the web's two
     themes, so the clients cannot drift apart silently.

Not a taste check. A palette can pass all of this and still be ugly; what it
catches is the structural faults that are ugly for a reason.
"""
import colorsys
import io
import os
import re
import sys

# The section rules below are not in Windows' default console codepage, and an
# unhandled UnicodeEncodeError while REPORTING is a check that looks like a
# failure it did not find. See tools/check_console.py.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
AA = 4.5
AA_LARGE = 3.0
MARKET_MAY_SET = {"hero-img", "mkt-wash"}

fails = []
def bad(m): fails.append(m); print("  FAIL  %s" % m)
def ok(m): print("  ok    %s" % m)


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(h):
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def hue(h):
    r, g, b = [c / 255 for c in rgb(h)]
    return round(colorsys.rgb_to_hls(r, g, b)[0] * 360)


def over(fg, bg, a=0.14):
    f, b = rgb(fg), rgb(bg)
    return "#%02X%02X%02X" % tuple(round(f[i] * a + b[i] * (1 - a)) for i in range(3))


CSS = io.open(os.path.join(ROOT, "site", "base.css"), encoding="utf-8").read()
RULES = re.findall(r"([^{}]+)\{([^{}]*)\}", CSS)


def decls(body):
    return {n: v.strip() for n, v in re.findall(r"--([\w-]+)\s*:\s*([^;]+)", body)}


def blocks(selector):
    out = {}
    for sel, body in RULES:
        if sel.strip().split("*/")[-1].strip() == selector:
            out.update(decls(body))
    return out


def resolve(raw):
    """Flatten `var(--x)` aliases down to the hex they end at."""
    out = {}
    for k, v in raw.items():
        seen = 0
        while v.startswith("var(--") and seen < 8:
            v = raw.get(v[6:v.index(")")], "")
            seen += 1
        if re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            out[k] = v.lower()
    return out


LIGHT_RAW = blocks(":root")
DARK_RAW = dict(LIGHT_RAW)
DARK_RAW.update(blocks(':root[data-theme="dark"]'))
LIGHT, DARK = resolve(LIGHT_RAW), resolve(DARK_RAW)

# ── 1. the market may not touch the palette ─────────────────────────────
print("\n-- the market axis --")
markets = {}
for sel, body in RULES:
    sel = sel.strip().split("*/")[-1].strip()
    m = re.match(r'html\[data-market(?:="(\w+)")?\]$', sel)
    if m:
        markets.setdefault(m.group(1) or "*", {}).update(decls(body))

# One default block every market inherits, plus an override for each market
# that has earned its own hue. Adding the US or the UK must cost nothing, so
# what is asserted is the DEFAULT's presence, not a block per market.
if "*" not in markets:
    bad("no default html[data-market] block - a new market would have no hero, "
        "and this check cannot fire")
elif len(markets) < 2:
    bad("nothing overrides the default - the market axis says nothing")
else:
    stray = sorted({k for mk in markets.values() for k in mk} - MARKET_MAY_SET)
    if stray:
        bad("the market sets more than the hero: --%s" % ", --".join(stray))
    else:
        ok("each market sets only --%s" % " / --".join(sorted(MARKET_MAY_SET)))
    dflt = markets["*"].get("mkt-wash")
    same = [k for k, v in markets.items() if k != "*" and v.get("mkt-wash") == dflt]
    if same:
        bad("%s overrides the default with the same hue - it says nothing"
            % ", ".join(same))
    else:
        ok("%d market(s) override the default, and only in their hue"
           % (len(markets) - 1))

# ── the two themes ──────────────────────────────────────────────────────
for name, T, RAW in (("light", LIGHT, LIGHT_RAW), ("dark", DARK, DARK_RAW)):
    print("\n-- %s --" % name)
    if "canvas" not in T:
        bad("%s: no tokens parsed from base.css - this check cannot fire" % name)
        continue

    grounds = [k for k in ("canvas", "canvas-2", "surface", "chip", "sunken") if k in T]

    # 2. each role against the bar that applies to it
    dim = []
    for k, bar in (("ink", AA), ("text", AA), ("text2", AA), ("text3", AA),
                   ("accent", AA_LARGE), ("accent-quiet", AA)):
        if k not in T:
            continue
        for g in grounds:
            r = ratio(T[k], T[g])
            if r < bar:
                dim.append("%s on %s %.2f (needs %s)" % (k, g, r, bar))
    if dim:
        bad("%s: below its bar - %s" % (name, "; ".join(dim)))
    else:
        ok("%s: body copy clears AA, fills clear AA-large, on every ground" % name)

    # The ACTION is the button fill, which is deep-ink, not the brand. Indigo
    # carries white at 4.58:1 and deep-ink carries cream at 17.44:1, so a
    # primary button filled with the brand is the weakest thing on the page.
    if "btn" in T and "btn-ink" in T:
        r = ratio(T["btn-ink"], T["btn"])
        (ok if r >= AA else bad)("%s: the action button reads at %.2f:1" % (name, r))
        if "accent" in T and T["btn"] == T["accent"]:
            bad("%s: the primary button is filled with the brand (%s)" % (name, T["btn"]))
        else:
            ok("%s: the button is the action colour, not the brand" % name)

    # 3. a band against its own fill
    thin = []
    for k in ("b-auto", "b-ping", "b-unsure", "b-near"):
        if k not in T:
            continue
        bg = T.get(k + "-bg") or over(T[k], T["surface"])
        r = ratio(T[k], bg)
        if r < AA:
            thin.append("%s %.2f" % (k, r))
    if thin:
        bad("%s: band below AA on its own fill - %s" % (name, "; ".join(thin)))
    else:
        ok("%s: every band clears AA on its own fill" % name)

    # 4. A BAND may not be mistaken for body copy, and the four bands must be
    #    four colours. Narrowed from "no two foreground roles share a hex",
    #    which fired on identities the kit creates on purpose: action-quiet IS
    #    the ping indigo, and on dark the action, the quiet action and ping are
    #    all #a2baff while --live IS the unsure solid. Those are one hue used
    #    coherently in related roles.
    #    WHAT THIS NO LONGER COVERS: two ACTION-family roles collapsing to one
    #    colour. Nothing has ever gone wrong that way, and rule 5 still stops
    #    the action taking the auto hue. The defect this was written for -
    #    b-near byte-identical to text2, so a near-miss band read as body copy
    #    - is still caught, and mutation-tested.
    BANDS = ("b-auto", "b-ping", "b-unsure", "b-near")
    TEXTS = ("ink", "text", "text2", "text3")
    dupes = []
    for bk in BANDS:
        for tk in TEXTS:
            if bk in T and tk in T and T[bk] == T[tk]:
                dupes.append("the %s band is the same colour as %s (%s)" % (bk, tk, T[bk]))
    seen = {}
    for bk in BANDS:
        if bk not in T:
            continue
        if T[bk] in seen:
            dupes.append("%s and %s are both %s" % (seen[T[bk]], bk, T[bk]))
        seen[T[bk]] = bk
    if dupes:
        bad("%s: %s" % (name, "; ".join(dupes)))
    else:
        ok("%s: 4 bands, 4 colours, none of them a text colour" % name)

    # 5. green is never the action
    if "accent" in T and "b-auto" in T:
        d = abs(hue(T["accent"]) - hue(T["b-auto"])) % 360
        d = min(d, 360 - d)
        if d < 40:
            bad("%s: the action (%s) wears the auto hue (%s), %ddeg apart"
                % (name, T["accent"], T["b-auto"], d))
        else:
            ok("%s: the action is %ddeg off the auto colour" % (name, d))

# ── 6. --live is a fill, never a text colour ────────────────────────────
print("\n-- the fill colour --")
# No exemptions. Both former ones - the display period and the saved heart -
# were moved onto the brand, because --live IS the unsure band solid and a
# saved job should not read as unsure. Rule 6 is absolute now.
ALLOWED_FILLS = ()
painted = []
for f in ("site/base.css", "site/index.html", "site/apply.html", "site/saved.html"):
    path = os.path.join(ROOT, f)
    if not os.path.exists(path):
        continue
    src = io.open(path, encoding="utf-8").read()
    for m in re.finditer(r"color\s*:\s*var\(--live\)", src):
        line = src[:m.start()].count(chr(10)) + 1
        rule = src[max(0, src.rfind(chr(10), 0, m.start())):m.start()].strip()
        if any(sel in rule for sel in ALLOWED_FILLS):
            continue
        painted.append("%s:%d" % (os.path.basename(f), line))
if painted:
    bad("--live is a fill, used as text at %s" % ", ".join(painted))
else:
    ok("--live is only ever a fill, never a text colour")

# ── 7. index.html's own copy of the bands ───────────────────────────────
IDX = io.open(os.path.join(ROOT, "site", "index.html"), encoding="utf-8").read()
for selector, T in ((":root", LIGHT), (':root[data-theme="dark"]', DARK)):
    got = {}
    for sel, body in re.findall(r"([^{}\n]+)\{([^{}]*)\}", IDX):
        if sel.strip() == selector:
            got.update({n: v.strip().lower() for n, v in
                        re.findall(r"--(b-[\w-]+)\s*:\s*([^;]+)", body)})
    if not got:
        bad("index.html has no `%s` band block - this check cannot fire" % selector)
        continue
    drift = ["%s: css %s / index %s" % (k, T.get(k), v) for k, v in got.items() if T.get(k) != v]
    if drift:
        bad("index.html disagrees with base.css - %s" % "; ".join(drift))
    else:
        ok("index.html's %d `%s` band tokens match base.css" % (len(got), selector))

# ── 8. Android agrees with the web ──────────────────────────────────────
print("\n-- the clients --")
KT = io.open(os.path.join(ROOT, "android", "app", "src", "main", "java",
                          "trade", "tbot", "jobscout", "Tokens.kt"), encoding="utf-8").read()
CAMEL = {"canvas-2": "canvas2", "accent-ink": "accentInk", "btn-ink": "btnInk",
         "chip-ink": "chipInk", "b-auto": "bAuto", "b-ping": "bPing",
         "b-unsure": "bUnsure", "b-near": "bNear", "b-auto-bg": "bAutoBg",
         "b-ping-bg": "bPingBg", "b-unsure-bg": "bUnsureBg", "b-near-bg": "bNearBg"}

for tag, T in (("LIGHT_TOKENS", LIGHT), ("DARK_TOKENS", DARK)):
    if tag not in KT:
        bad("%s not found in Tokens.kt - this check cannot fire" % tag)
        continue
    i = KT.index(tag)
    got = {n: "#" + h.lower() for n, h in re.findall(
        r"(\w+)\s*=\s*Color\(0xFF([0-9A-Fa-f]{6})\)", KT[i:KT.index("\n)", i)])}
    if not got:
        bad("%s parsed to nothing - this check cannot fire" % tag)
        continue
    drift = ["%s: web %s / android %s" % (k, v, got[CAMEL.get(k, k)])
             for k, v in T.items() if CAMEL.get(k, k) in got and got[CAMEL.get(k, k)] != v]
    if drift:
        bad("%s disagrees with the web - %s" % (tag, "; ".join(drift)))
    else:
        ok("%s matches the web on every shared token (%d compared)" % (tag, len(got)))

print("")
print("%d FAILED" % len(fails) if fails else "ALL GREEN")
sys.exit(1 if fails else 0)
