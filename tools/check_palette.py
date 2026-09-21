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
MARKET_MAY_SET = {"hero-a", "hero-b", "hero", "mkt-wash"}

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


# Design system v3: site/tokens.css is GENERATED from tokens/tokens.json and
# loaded ahead of base.css, whose legacy names are var() aliases onto it. The
# two are read as one sheet so an alias resolves to the generated hex.
CSS = (io.open(os.path.join(ROOT, "site", "tokens.css"), encoding="utf-8").read() + "\n"
       + io.open(os.path.join(ROOT, "site", "base.css"), encoding="utf-8").read())
RULES = re.findall(r"([^{}]+)\{([^{}]*)\}", CSS)


def decls(body):
    return {n: v.strip() for n, v in re.findall(r"--([\w-]+)\s*:\s*([^;]+)", body)}


def blocks(selector):
    out = {}
    for sel, body in RULES:
        if sel.strip().split("*/")[-1].strip() == selector:
            out.update(decls(body))
    return out


LD = re.compile(r"light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)\s*$")


def resolve(raw, side):
    """Both themes come from ONE declaration: light-dark(light, dark).

    `side` is 0 for light, 1 for dark. A `var(--x)` alias is followed to
    whatever it ends at on the SAME side, so `--btn: var(--ink)` is deep-ink
    in light and cream in dark without being written twice anywhere.
    """
    out = {}
    for k in raw:
        v, hops = raw[k], 0
        while hops < 8:
            m = LD.match(v)
            if m:
                v = m.group(1 + side).strip()
                continue
            if v.startswith("var(--"):
                v = raw.get(v[6:v.index(")")], "")
                hops += 1
                continue
            break
        if re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            out[k] = v.lower()
    return out


RAW = blocks(":root")
# Nothing may define a COLOUR under [data-theme]: that is what light-dark() is
# for, and a second block is exactly the drift it replaced. Non-colour
# declarations - shadows, opacities, color-scheme - still belong there.
themed = {k: v for k, v in blocks(':root[data-theme="dark"]').items()
          if re.search(r"#[0-9a-fA-F]{6}", v)}
LIGHT, DARK = resolve(RAW, 0), resolve(RAW, 1)
LIGHT_RAW = DARK_RAW = RAW

# ── 1. the market may not touch the palette ─────────────────────────────
print("\n-- theme resolution --")
if themed:
    bad("a colour is defined under [data-theme]: %s - use light-dark(), so "
        "there is one place per colour" % ", ".join("--" + k for k in sorted(themed)))
else:
    ok("every colour is defined once, with light-dark()")

n_ld = sum(1 for v in RAW.values() if LD.match(v))
if n_ld < 10:
    bad("only %d light-dark() tokens - this is not measuring the palette" % n_ld)
else:
    ok("%d tokens carry both themes, %d more alias them" % (n_ld, len(LIGHT) - n_ld))

# Absence of the attribute must mean "follow the OS", which needs BOTH the
# declaration and the two forcing rules. Without color-scheme, light-dark()
# has nothing to switch on and every colour silently resolves light.
need = ("color-scheme: light dark", '[data-theme="light"]{ color-scheme: light; }',
        '[data-theme="dark"]{ color-scheme: dark; }')
missing = [n for n in need if n not in CSS]
if missing:
    bad("theme resolution incomplete, missing: %s" % "; ".join(missing))
else:
    ok("three states: absent follows the OS, light and dark force it")

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

# -- 6b. --accent is the brand mark, not a text colour ------------------
# Same rule as --live one section up, for the same reason: a token tuned for
# one job was being read at another. --accent measured 4.15:1 on cream at
# 13.5px - under AA - while the same token resolved to #a2baff in dark and
# measured 10.38:1, so it passed in one theme only. The exemptions are the
# places where the brand is a MARK rather than a sentence: the display
# period, the coach glyph, the saved heart, and a chip that sits on
# --accent-ink rather than on the canvas. Anything else wanting indigo text
# wants --link.
BRAND_AS_MARK = ("h1.display .dot", ".coach .hand", ".savebtn", ".secrow button:hover .n")
painted = []
for f in ("site/base.css", "site/index.html", "site/apply.html", "site/saved.html",
          "site/privacy.html"):
    path = os.path.join(ROOT, f)
    if not os.path.exists(path):
        continue
    src = io.open(path, encoding="utf-8").read()
    # The lookbehind matters: `border-color:var(--accent)` contains
    # `color:var(--accent)`, and a border IS allowed to be the brand.
    for m in re.finditer(r"(?<![-\w])color\s*:\s*var\(--accent\)", src):
        line = src[:m.start()].count(chr(10)) + 1
        head = src.rfind("}", 0, m.start())
        rule = src[head + 1:m.start()]
        if any(sel in rule for sel in BRAND_AS_MARK):
            continue
        painted.append("%s:%d" % (os.path.basename(f), line))
if painted:
    bad("--accent is the brand, used as text at %s - a link takes --link"
        % ", ".join(painted))
else:
    ok("--accent is only ever the mark; text links take --link")

# -- 6c. the retired palette, banned from shipped source --------------
# The v3.1 changelog moves ember from hue 39 to 63 and the whole band ramp
# with it. Two copies survived the move: dead definitions at the top of
# base.css, and bandFor()/bandFill() in Rose.kt and RoseView.swift - the fit
# dial, carrying its own band colours, so the dial beside a score disagreed
# with the pill under it and with itself in dark, since those were light
# values only. Section 6b's comparison only sees the token SETS; a hex
# written anywhere else is invisible to it. This sees those.
print("\n-- the retired palette --")
RETIRED = {
    "ff6d39": "ember, hue 39", "cc3600": "ember-deep, hue 39",
    "328a3b": "forest, pre-ramp", "114e0b": "meadow, pre-ramp",
    "5fd07a": "auto label, pre-ramp", "ff9b6f": "unsure label, pre-ramp",
    "2fbd6a": "the Kenya green that was on a control",
    "144d2b": "the 1.94:1 letter link", "bf3200": "unsure, pre-ramp",
}
SHIPPED = ["site/base.css", "site/index.html", "site/apply.html",
           "site/saved.html", "site/privacy.html", "mockups/mobile.html",
           "android/app/src/main/java/trade/tbot/jobscout/",
           "ios/Sources/", "worker/src/"]


def _decomment(src):
    """Prose explaining a removal is not a use. Both files now carry that
    prose, and a guard that fires on its own documentation gets muted."""
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)      # css, kotlin, swift
    src = re.sub(r"<!--.*?-->", " ", src, flags=re.S)      # html
    src = re.sub(r"(?m)//.*$", " ", src)                   # kotlin, swift, js
    src = re.sub(r"(?m)^\s*#.*$", " ", src)                # python
    return src


def _files():
    for entry in SHIPPED:
        full = os.path.join(ROOT, entry)
        if os.path.isdir(full):
            for base, _, names in os.walk(full):
                for n in names:
                    if n.rsplit(".", 1)[-1] in ("kt", "swift", "js", "css", "html"):
                        yield os.path.join(base, n)
        elif os.path.exists(full):
            yield full


found = []
for path in _files():
    try:
        src = _decomment(io.open(path, encoding="utf-8").read())
    except OSError:
        continue
    low = src.lower()
    for hexv, what in RETIRED.items():
        if hexv in low:
            found.append("%s (%s) in %s" % (hexv, what, os.path.basename(path)))
if found:
    bad("the retired palette is still shipped: " + "; ".join(sorted(set(found))[:4]))
else:
    ok("no retired band colour survives in any shipped file")

# 7. NO page carries its own copy of the band tokens any more (design system
#    v3): tokens.css is generated and loaded first, so a hex in a page's
#    :root is a second place for a colour to drift from.
for page in ("index.html", "saved.html", "apply.html", "privacy.html"):
    P = io.open(os.path.join(ROOT, "site", page), encoding="utf-8").read()
    strays = re.findall(r"--b-[\w-]+\s*:\s*light-dark\(#", P)
    if strays:
        bad("%s carries %d inline band hexes - the generator is the one place" % (page, len(strays)))
    else:
        ok("%s carries no inline band copy" % page)

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
# 8. TIME drifts like colour. Design system v3: tokens/tokens.json is the one
#    source; the generator solves Compose's stiffness from the same period
#    (k = (2pi/T)^2) into design/Tokens.kt and SwiftUI's response into
#    Tokens.swift. Hold all three to tokens.json within 1ms and 0.01, so a
#    hand edit on any platform cannot quietly put it on a different clock.
import json, math
TOK = json.load(io.open(os.path.join(ROOT, "tokens", "tokens.json"), encoding="utf-8"))
KT = io.open(os.path.join(ROOT, "android", "app", "src", "main", "java",
                          "trade", "tbot", "jobscout", "design", "Tokens.kt"), encoding="utf-8").read()
SW = io.open(os.path.join(ROOT, "ios", "Sources", "Tokens.swift"), encoding="utf-8").read()
CSS = io.open(os.path.join(ROOT, "site", "tokens.css"), encoding="utf-8").read()
tdrift = []
for name in ("snap", "settle", "arrive"):
    sp = TOK["motion"]["springs"][name]; t_j, z_j = float(sp["durationMs"]), float(sp["zeta"])
    mt = re.search(r"--t-%s:\s*([\d.]+)ms" % name, CSS)
    mk = re.search(r"val %s = spring<Float>\(dampingRatio = ([\d.]+)f, stiffness = ([\d.]+)f\)" % name, KT)
    ms = re.search(r"static let %s = Animation\.spring\(response: ([\d.]+), dampingFraction: ([\d.]+)\)" % name, SW)
    if not (mt and mk and ms):
        tdrift.append("%s: missing on one side" % name); continue
    t_css = float(mt.group(1))
    z_kt, k_kt = float(mk.group(1)), float(mk.group(2)); t_kt = 2 * math.pi / math.sqrt(k_kt) * 1000
    t_sw, z_sw = float(ms.group(1)) * 1000, float(ms.group(2))
    for tag, t, z in (("css", t_css, z_j), ("kotlin", t_kt, z_kt), ("swift", t_sw, z_sw)):
        if abs(t - t_j) > 1.0 or abs(z - z_j) > 0.01:
            tdrift.append("%s/%s: %.1fms z=%g vs tokens.json %gms z=%g" % (name, tag, t, z, t_j, z_j))
ex = float(TOK["motion"]["springs"]["exit"]["durationMs"])
mx = re.search(r"--t-exit:\s*([\d.]+)ms", CSS); mk = re.search(r"val exit = tween<Float>\((\d+)", KT); ms = re.search(r"static let exit = Animation\.easeIn\(duration: ([\d.]+)\)", SW)
for tag, v in (("css", mx and float(mx.group(1))), ("kotlin", mk and float(mk.group(1))), ("swift", ms and float(ms.group(1)) * 1000)):
    if v is None or abs(v - ex) > 1.0:
        tdrift.append("exit/%s: %s vs tokens.json %g" % (tag, v, ex))
if tdrift:
    bad("the springs drift from tokens.json: " + "; ".join(tdrift))
else:
    ok("the four springs match tokens.json on web, Android and iOS within 1ms / 0.01 damping")



# 9. THE ROSE'S LIT TABLE and the BAND THRESHOLDS are one table on three
#    clients, generated from tokens.json. band.js carries the web's (AUTO 8,
#    PING 6, UNSURE 5, NEAR-MISS 3 at 80/70/55); design/Tokens.kt and
#    Tokens.swift are generated; Rose.kt and RoseView.swift must READ them
#    rather than carry a copy.
LITJ = [TOK["rose"]["litByBand"][k] for k in ("auto", "ping", "unsure", "nearmiss")]
THJ = [TOK["band"]["threshold"][k] for k in ("auto", "ping", "unsure")]
def _lit(path, pat):
    try:
        src = _decomment(io.open(os.path.join(ROOT, *path), encoding="utf-8").read())
    except OSError:
        return None
    m = re.search(pat, src, re.S)
    return [int(x) for x in m.groups()] if m else None
DKT = ("android", "app", "src", "main", "java", "trade", "tbot", "jobscout", "design", "Tokens.kt")
_web = _lit(("site", "band.js"), r"auto:\s*(\d+),\s*ping:\s*(\d+),\s*unsure:\s*(\d+),\s*\"near-miss\":\s*(\d+)")
_webt = _lit(("site", "band.js"), r"FALLBACK = Object\.freeze\(\{\s*auto:\s*(\d+),\s*ping:\s*(\d+),\s*unsure:\s*(\d+)")
_kt = _lit(DKT, r"litByBand = mapOf\(\"auto\" to (\d+), \"ping\" to (\d+), \"unsure\" to (\d+), \"nearmiss\" to (\d+)\)")
_ktt = _lit(DKT, r"const val AUTO = (\d+)\s*const val PING = (\d+)\s*const val UNSURE = (\d+)")
_sw = _lit(("ios", "Sources", "Tokens.swift"), r"litByBand: \[String: Int\] = \[\"auto\": (\d+), \"ping\": (\d+), \"unsure\": (\d+), \"nearmiss\": (\d+)\]")
_swt = _lit(("ios", "Sources", "Tokens.swift"), r"static let auto = (\d+)\s*static let ping = (\d+)\s*static let unsure = (\d+)")
_reads_kt = "design.Bands.litByBand" in io.open(os.path.join(ROOT, "android", "app", "src", "main", "java", "trade", "tbot", "jobscout", "Rose.kt"), encoding="utf-8").read()
_reads_sw = "JSBands.litByBand" in io.open(os.path.join(ROOT, "ios", "Sources", "RoseView.swift"), encoding="utf-8").read()
if not (_web and _kt and _sw and _webt and _ktt and _swt):
    bad("the lit table / thresholds are missing on a client (web %s %s / kotlin %s %s / swift %s %s)" % (_web, _webt, _kt, _ktt, _sw, _swt))
elif not (_web == _kt == _sw == LITJ and _webt == _ktt == _swt == THJ):
    bad("the lit table or thresholds drift: tokens %s %s / web %s %s / kotlin %s %s / swift %s %s" % (LITJ, THJ, _web, _webt, _kt, _ktt, _sw, _swt))
elif not (_reads_kt and _reads_sw):
    bad("a client carries its own lit table instead of reading the generated one (Rose.kt %s, RoseView.swift %s)" % (_reads_kt, _reads_sw))
else:
    ok("the rose lights the same bearings per band at the same thresholds on web, Android and iOS %s @ %s" % (LITJ, THJ))

print("%d FAILED" % len(fails) if fails else "ALL GREEN")
sys.exit(1 if fails else 0)
