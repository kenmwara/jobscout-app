#!/usr/bin/env python3
"""Cycle 3, the phone half: press every control and assert what happened.

Each step taps by VISIBLE LABEL from a fresh dump (a stale coordinate is how
every miss in this session happened) and then asserts something about the
screen that follows — not that a node exists, but that the screen changed the
way the label promised.

    python tools/cycle3_mobile.py            # both markets
"""
import html
import re
import subprocess
import sys
import time

ADB = __import__("os").path.expanduser("~/android-sdk/platform-tools/adb.exe")
ENV = dict(__import__("os").environ, MSYS_NO_PATHCONV="1")
PKG = "trade.tbot.jobscout"

fails = []


def sh(*a, t=60):
    return subprocess.run([ADB, *a], env=ENV, capture_output=True, timeout=t)


def dump():
    # The bridge waits for an idle window and answers "null root node" when
    # it does not get one in time - one dump in three under the ground's
    # wander, before it was made to step. A transient bridge error is not a
    # finding about the app; try again before believing an empty tree.
    # AND REMOVE THE OLD FILE FIRST. A failed dump leaves the previous one in
    # place, and cat returned it - a full, healthy tree of whatever screen the
    # last good dump saw. That is how "the landing" read as Browse: it was the
    # sector-tile step's dump from a minute earlier, not the screen.
    xml = ""
    for _ in range(4):
        sh("shell", "rm", "-f", "/sdcard/u.xml")
        out = sh("shell", "uiautomator", "dump", "/sdcard/u.xml").stdout.decode("utf-8", "replace")
        xml = sh("shell", "cat", "/sdcard/u.xml").stdout.decode("utf-8", "replace")
        # A tree with a handful of text nodes is the bridge answering before
        # the app has laid out - "<node" alone let those through. The landing
        # carries 35; anything under 20 is not the app yet.
        if "dumped to" in out and xml.count('text="') - xml.count('text=""') >= 20:
            return xml
        time.sleep(1.0)
    return xml


def nodes():
    out = []
    for tag in re.findall(r"<node[^>]*/?>", dump()):
        g = dict(re.findall(r'(\w+)="([^"]*)"', tag))
        t = html.unescape(g.get("text", "")).replace("\n", " ").strip() or html.unescape(g.get("content-desc", "")).strip()
        b = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", g.get("bounds", ""))
        if not b:
            continue
        x1, y1, x2, y2 = map(int, b.groups())
        out.append({"t": t, "cx": (x1 + x2) // 2, "cy": (y1 + y2) // 2, "w": x2 - x1, "h": y2 - y1})
    return out


def text():
    return " | ".join(n["t"] for n in nodes() if n["t"])


def tap(label, wait=2.5):
    for n in nodes():
        if label.lower() in n["t"].lower():
            sh("shell", "input", "tap", str(n["cx"]), str(n["cy"]))
            time.sleep(wait)
            return True
    return False


def swipe_top(times=8):
    for _ in range(times):
        sh("shell", "input", "swipe", "540", "700", "540", "1900", "150")
    time.sleep(1.2)


def say(m):
    print(m.encode("ascii", "replace").decode("ascii"))


def check(cond, msg):
    say(("  ok    " if cond else "  FAIL  ") + msg)
    if not cond:
        fails.append(msg)


def step(label, expect, msg, wait=2.5):
    """Tap `label`, then assert `expect` (a substring) is on the screen after."""
    if not tap(label, wait):
        check(False, f"{msg} — control '{label}' not found")
        return ""
    t = text()
    check(expect.lower() in t.lower(), msg)
    return t


sh("shell", "am", "force-stop", PKG)
sh("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
time.sleep(10)

for market in ("Canada", "Kenya"):
    say(f"\n-- {market} --")
    swipe_top()
    step(market, market, f"the {market} pill switches market", wait=9)
    # HOME FIRST. The app RESTORES the screen you were last on when a
    # previous run is stored, which is deliberate - come back to where you
    # were - so a launch does not necessarily land on the landing frame.
    # This harness asserted the resume box straight after launch and failed
    # against correct behaviour, but only once there was state to restore:
    # with the app's data cleared it passed, which is exactly the kind of
    # green that means nothing. Press the wordmark, the way a reader would.
    tap("JobScout", wait=2.0)
    swipe_top()
    # Press the wordmark again if the landing is not up: twice in three runs
    # the read after a market switch was Browse, narrowed to a sector no tap
    # of ours had chosen, and by hand the wordmark went home every time. A
    # reader who does not see home taps the logo again; so does this.
    for _ in range(2):
        if "Find the work" in text(): break
        say("        (home again)")
        tap("JobScout", wait=2.5); swipe_top(3)

    # A market switch refetches the feed and re-lays the landing; the hero
    # can be a second or two behind the header. Kenya failed this on a single
    # read while three manual dumps in a row showed it whole. Poll, briefly.
    # And swipe to the top on EVERY read: the market's feed reload re-lays
    # the list under the reader, and one swipe before the poll left the hero
    # above the viewport on a read that was otherwise fresh and whole.
    t = text()
    for _ in range(6):
        if "Upload" in t and ("Paste your resume" in t or "Find the work" in t):
            break
        time.sleep(1.0)
        swipe_top(3)
        t = text()
    check("JobScout" in t, "the header is on screen and stays there")
    check("Saved" in t, "Saved is reachable from the header")

    # the landing offers the box and the sector tiles
    # WHAT THE LANDING OWES THE READER is a way to hand over a resume, not a
    # particular string in the box. Keying on the placeholder made the check
    # depend on the box being EMPTY, so it failed the moment a previous run
    # left text in it - a red line about leftover state, not about the app.
    if not ("Upload" in t and ("Paste your resume" in t or "Find the work" in t)):
        say("        screen read: " + t[:260])
    check("Upload" in t and ("Paste your resume" in t or "Find the work" in t),
          "the landing offers a way to hand over a resume")
    check("open" in t, "the sector tiles carry their counts")

    # a sector tile opens Browse, narrowed
    # Browse leads with the sector grid, not with the sweep title — the tile
    # marks itself selected and the list below narrows to it. (The first cut of
    # this check looked for "Explore", which is further down the screen, and
    # reported a bug the app did not have.)
    tap("Finance & banking", 3.0)
    t = text()
    check(chr(0x00d7) in t or "Browse by what" in t, "a sector tile selects and opens Browse")
    check("Finance" in t, "and the chosen slice is named on screen")

    # the logo goes home
    step("JobScout", "Find the work", "the wordmark goes home from Browse")

    # Saved opens and closes
    step("Saved", "SAVED", "Saved opens the kept list")
    if not tap("Close", 2.0):
        sh("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(2)
    check("Find the work" in text() or "Your matches" in text(), "and closes back to where it was")

# ── the theme control, proved in PIXELS ─────────────────────────────────
# THEME.md section 6 calls the toggle a required feature. ThemeChoice
# carried all three states from the day it was written and nothing ever
# called set(), so the app was permanently light with no route to dark.
#
# The label is not the proof. The defect was a stored value nothing
# re-read - Compose does not observe SharedPreferences - so a control that
# changed its own word and nothing else would have looked exactly like a
# working one. What has to change is the ground.
say("\n-- the theme control --")


def ground():
    """The app's own background, median across a band down the left edge."""
    from PIL import Image
    sh("shell", "screencap", "-p", "/sdcard/t.png")
    shot = __import__("os").path.join(
        __import__("tempfile").gettempdir(), "jobscout_theme.png")
    sh("pull", "/sdcard/t.png", shot, t=120)
    im = Image.open(shot).convert("RGB")
    w, h = im.size
    px = sorted(im.getpixel((x, int(h * 0.60)))
                for x in range(int(w * 0.02), int(w * 0.10), 2))
    return px[len(px) // 2]


def lum(c):
    def f(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


tap("JobScout", wait=2.0)
swipe_top()
seen = [l for l in ("Light", "Device", "Dark") if l in text()]
check(bool(seen), "the control is on screen (%s)" % (seen or "NOT FOUND"))

if seen:
    order, grounds = [seen[0]], [ground()]
    for _ in range(3):
        if not tap(order[-1], wait=1.4):
            check(False, "could not press %s" % order[-1])
            break
        now = [l for l in ("Light", "Device", "Dark") if l in text()]
        if not now:
            check(False, "the control vanished after a tap")
            break
        order.append(now[0])
        grounds.append(ground())
        say("        %-7s ground %s  luminance %.4f" % (now[0], grounds[-1], lum(grounds[-1])))

    check(len(order) == 4 and order[0] == order[3] and len(set(order[:3])) == 3,
          "it cycles all three and returns: " + " -> ".join(order))

    if "Dark" in order and "Light" in order:
        d, l = grounds[order.index("Dark")], grounds[order.index("Light")]
        # A THIRD, not a hair: the dark canvas is #0a0524 against a cream
        # #f8f3eb, so anything close to parity means nothing repainted.
        check(lum(d) < lum(l) / 3,
              "Dark actually darkens the app (%.4f vs %.4f)" % (lum(d), lum(l)))
    # leave it as the reader found it
    while [l for l in ("Device", "Dark") if l in text()]:
        tap([l for l in ("Device", "Dark") if l in text()][0], wait=1.2)

say("\n" + (f"{len(fails)} FAILED" if fails else "ALL GREEN"))
sys.exit(1 if fails else 0)
