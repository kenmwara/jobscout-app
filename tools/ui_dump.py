#!/usr/bin/env python3
"""Read the emulator's current screen as text, for sweeping the app by hand.

    python tools/ui_dump.py                 # what is on screen
    python tools/ui_dump.py --tappable      # only what can be tapped, with centres

uiautomator's XML escapes everything and the Windows console is cp1252, so
both are handled here rather than in a shell one-liner that dies on an arrow.
"""
import html
import os
import re
import subprocess
import sys
import tempfile

ADB = os.path.expanduser("~/android-sdk/platform-tools/adb.exe")
ENV = dict(os.environ, MSYS_NO_PATHCONV="1")


def dump():
    subprocess.run([ADB, "shell", "uiautomator", "dump", "/sdcard/u.xml"],
                   env=ENV, capture_output=True, timeout=60)
    r = subprocess.run([ADB, "shell", "cat", "/sdcard/u.xml"],
                       env=ENV, capture_output=True, timeout=60)
    return r.stdout.decode("utf-8", "replace")


def nodes(xml):
    out = []
    for tag in re.findall(r"<node[^>]*/?>", xml):
        g = dict(re.findall(r'(\w+)="([^"]*)"', tag))
        t = html.unescape(g.get("text", "")).replace("\n", " ").strip()
        d = html.unescape(g.get("content-desc", "")).strip()
        b = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", g.get("bounds", ""))
        if not b:
            continue
        x1, y1, x2, y2 = map(int, b.groups())
        out.append({"text": t, "desc": d, "cls": g.get("class", "").split(".")[-1],
                    "click": g.get("clickable") == "true",
                    "cx": (x1 + x2) // 2, "cy": (y1 + y2) // 2,
                    "w": x2 - x1, "h": y2 - y1})
    return out


def say(msg):
    """stdout here is cp1252 and the app's labels carry arrows and flags."""
    print(msg.encode("ascii", "replace").decode("ascii"))


def tap(label):
    """Find a node by its visible text and tap its centre, from a FRESH dump.

    Every stale-coordinate miss in this session came from dumping, thinking,
    and then tapping a screen that had scrolled underneath. Dump and tap in one
    breath and that whole class of miss goes away.
    """
    for n in nodes(dump()):
        text = n["text"] or n["desc"]
        if label.lower() in text.lower():
            subprocess.run([ADB, "shell", "input", "tap", str(n["cx"]), str(n["cy"])],
                           env=ENV, capture_output=True, timeout=30)
            # The console is cp1252 and the app's own labels carry arrows.
            say("tapped %r at (%d,%d)" % (text[:44], n["cx"], n["cy"]))
            return 0
    say("NOT FOUND: %r" % label)
    return 1


def main():
    if "--tap" in sys.argv:
        return tap(sys.argv[sys.argv.index("--tap") + 1])
    ns = nodes(dump())
    only = "--tappable" in sys.argv
    for n in ns:
        label = n["text"] or n["desc"]
        if only and not (n["click"] and label):
            continue
        if not only and not label:
            continue
        mark = "TAP" if n["click"] else "   "
        line = "  %s  %-46s (%4d,%4d) %s" % (mark, label[:46], n["cx"], n["cy"], n["cls"])
        sys.stdout.write(line.encode("ascii", "replace").decode("ascii") + "\n")


if __name__ == "__main__":
    sys.exit(main() or 0)
