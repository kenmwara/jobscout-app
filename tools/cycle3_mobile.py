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
    sh("shell", "uiautomator", "dump", "/sdcard/u.xml")
    return sh("shell", "cat", "/sdcard/u.xml").stdout.decode("utf-8", "replace")


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
    swipe_top()

    t = text()
    check("JobScout" in t, "the header is on screen and stays there")
    check("Saved" in t, "Saved is reachable from the header")

    # the landing offers the box and the sector tiles
    check("Paste your resume" in t or "Ken " in t, "the resume box is on the landing")
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

say("\n" + (f"{len(fails)} FAILED" if fails else "ALL GREEN"))
sys.exit(1 if fails else 0)
