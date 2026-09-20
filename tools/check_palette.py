#!/usr/bin/env python3
"""The two things that decide whether a dark UI looks cheap, measured.

Read from the real sources — site/base.css and Android's Tokens.kt — so the
two clients cannot drift apart without this saying so.

    python tools/check_palette.py

What it asserts, and why each one earned its place:

  1. **The chrome must not wear the accent's hue.** The Kenya ramp used to be
     green at 140-144deg against a green accent at 142deg. When the greys are
     the same colour as the accent, the accent has nothing to be brighter
     than and the whole screen is one olive wash. This is the thing that
     reads as cheap, and no amount of tuning the accent fixes it.
  2. **AA on every ground a colour actually lands on** — canvas, surface and
     chip, not just one of them.
  3. **A band against its OWN tint**, composited at 14% over a card, because
     that is where a band lives. Measuring it against the raw surface flatters
     it by about a point.
  4. **No two roles may be the same colour.** `b-near` was byte-identical to
     `text2`, so a near-miss band was indistinguishable from body copy.
  5. **Both clients agree**, value for value.

Not a taste check. A palette can pass all of this and still be ugly; what it
catches is the structural faults that are ugly for a reason.
"""
import colorsys
import io
import os
import re
import sys

# The box-drawing rule in the market header is not in Windows' default console
# codepage, and an unhandled UnicodeEncodeError while REPORTING is a check that
# looks like a failure it did not find.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
AA = 4.5
AA_LARGE = 3.0        # the bar for a fill, a dot or large type
HUE_GAP = 60          # degrees the chrome must keep from the accent
CHROMA_FREE = 6       # below this saturation a grey is neutral enough to ignore

fails = []
def bad(m): fails.append(m); print(f"  FAIL  {m}")
def ok(m): print(f"  ok    {m}")


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


def hsl(h):
    r, g, b = [c / 255 for c in rgb(h)]
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    return round(hh * 360), round(ss * 100), round(ll * 100)


def gap(a, b):
    d = abs(hsl(a)[0] - hsl(b)[0]) % 360
    return min(d, 360 - d)


def over(fg, bg, a=0.14):
    f, b = rgb(fg), rgb(bg)
    return "#%02X%02X%02X" % tuple(round(f[i] * a + b[i] * (1 - a)) for i in range(3))


def web_market(market):
    css = io.open(os.path.join(ROOT, "site", "base.css"), encoding="utf-8").read()
    out = {}
    for block in re.findall(r'html\[data-market="%s"\]\{([^}]*)\}' % market, css):
        for name, val in re.findall(r"--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})", block):
            out[name] = val.lower()
    return out


def android_market(market):
    kt = io.open(os.path.join(ROOT, "android", "app", "src", "main", "java",
                              "trade", "tbot", "jobscout", "Tokens.kt"), encoding="utf-8").read()
    tag = "KE_TOKENS" if market == "ke" else "CA_TOKENS"
    i = kt.index(tag)
    block = kt[i:kt.index("\n)", i)]
    out = {}
    for name, hexv in re.findall(r"(\w+)\s*=\s*Color\(0xFF([0-9A-Fa-f]{6})\)", block):
        out[name] = "#" + hexv.lower()
    return out


# `--live` may drive `color:` only where the thing it paints is a MARK, not
# words: an SVG reading currentColor, or the single display full stop that is
# a logo-mark in disguise. Everything else writing with it is the bug.
ALLOWED_FILLS = (
    "h1.display .dot",                      # the full stop, 34-48px, a mark
    '.savebtn[aria-pressed="true"]',        # an SVG heart via currentColor
)

CAMEL = {"canvas-2": "canvas2", "b-auto": "bAuto", "b-ping": "bPing",
         "b-unsure": "bUnsure", "b-near": "bNear"}

for market in ("ke", "ca"):
    print(f"\n── {market.upper()} ──")
    w = web_market(market)
    if not w:
        bad(f"{market}: no tokens parsed from base.css — this check cannot fire")
        continue

    accent = w["accent"]
    grounds = [k for k in ("canvas", "canvas-2", "surface", "chip") if k in w]

    # 1. the GROUNDS keep their distance from the accent. Not the text: the
    #    olive-wash mechanism is a ground that shares the accent's hue, and
    #    Canada's greys are deliberately biased toward its indigo while
    #    sitting on cream, which is nowhere near it.
    shares = [k for k in grounds
              if hsl(w[k])[1] >= CHROMA_FREE and gap(w[k], accent) < HUE_GAP]
    if shares:
        bad(f"{market}: the ground wears the accent's hue — {', '.join(shares)}")
    else:
        ok(f"{market}: every ground is >={HUE_GAP}deg off the accent (or neutral)")

    # 2. Each colour against the bar that applies to IT. `ink`, `text` and
    #     `text2` carry body copy and keep AA 4.5. `accent`, `live` and `text3`
    #     are fills, dots and captions — this language has said so since v2.2
    #     ("indigo and forest are fill / large-text only, never body copy") —
    #     and keep AA-large 3.0. Judging a 6px dot by the body-copy threshold
    #     is judging it as something it is not.
    dim = []
    # `live` is absent on purpose: it is a FILL — a progress bar, a filled
    # heart, the full stop in the display line — and a decorative fill has no
    # text bar to clear. Rule 6 is what keeps that true.
    for k, bar in (("ink", AA), ("text", AA), ("text2", AA),
                   ("text3", AA_LARGE), ("accent", AA_LARGE)):
        if k not in w:
            continue
        for g in grounds:
            r = ratio(w[k], w[g])
            if r < bar:
                dim.append(f"{k} on {g} {r:.2f} (needs {bar})")
    if dim:
        bad(f"{market}: below its bar — {'; '.join(dim)}")
    else:
        ok(f"{market}: body copy clears AA, fills and dots clear AA-large, on every ground")

    # 3. a band against its own tint over a card
    thin = []
    for k in ("b-auto", "b-ping", "b-unsure", "b-near"):
        if k not in w:
            continue
        r = ratio(w[k], over(w[k], w["surface"]))
        if r < AA:
            thin.append(f"{k} {r:.2f}")
    if thin:
        bad(f"{market}: band below AA on its own tint — {'; '.join(thin)}")
    else:
        ok(f"{market}: every band clears AA on its own 14% tint over a card")

    # 4. No two FOREGROUND roles share a colour. Grounds may: on a light
    #     theme a card and a chip are both white, which is two roles agreeing
    #     rather than colliding. What this is for is `b-near` having been
    #     byte-identical to `text2`, so a near-miss band was indistinguishable
    #     from body copy.
    FG = ("ink", "text", "text2", "text3", "accent", "live",
          "b-auto", "b-ping", "b-unsure", "b-near")
    seen = {}
    dupes = []
    for k, v in w.items():
        if k not in FG:
            continue
        if v in seen:
            dupes.append(f"{seen[v]} and {k} are both {v}")
        seen[v] = k
    if dupes:
        bad(f"{market}: two roles, one colour — {'; '.join(dupes)}")
    else:
        ok(f"{market}: {len(seen)} roles, {len(seen)} distinct colours")

    # 6. Nothing paints WORDS with a fill colour. This is the rule that found
    #    the real fault: `--live` (#ff6d39, 2.48:1 on cream) was the colour of
    #    "posted today" on every fresh card and of the `required` marker beside
    #    a screening question. The answer was never to dull the orange — it is
    #    the one place this brand is loud — but to stop writing with it.
    if market == "ca":
        painted = []
        for f in ("site/base.css", "site/index.html", "site/apply.html", "site/saved.html"):
            path = os.path.join(ROOT, f)
            if not os.path.exists(path):
                continue
            css = io.open(path, encoding="utf-8").read()
            for m in re.finditer(r"color\s*:\s*var\(--live\)", css):
                line = css[:m.start()].count(chr(10)) + 1
                rule = css[max(0, css.rfind(chr(10), 0, m.start())) : m.start()].strip()
                # `color:` is also how you drive an SVG's currentColor, so a MARK
                # may legitimately use it. Each exemption is named, with what it
                # paints — anything new fails, which is the point.
                if any(sel in rule for sel in ALLOWED_FILLS):
                    continue
                painted.append(f"{os.path.basename(f)}:{line}  ({rule[:40]})")
        if painted:
            bad(f"--live is a fill, used as text at {', '.join(painted)}")
        else:
            ok("--live is only ever a fill, never a text colour")

    # 5. Android agrees with the web
    a = android_market(market)
    drift = []
    for k, v in w.items():
        ak = CAMEL.get(k, k)
        if ak in a and a[ak] != v:
            drift.append(f"{k}: web {v} / android {a[ak]}")
    if drift:
        bad(f"{market}: the clients disagree — {'; '.join(drift)}")
    else:
        ok(f"{market}: Android matches the web on every shared token")

print("")
print(f"{len(fails)} FAILED" if fails else "ALL GREEN")
sys.exit(1 if fails else 0)
