#!/usr/bin/env python3
"""Drive the emulator by visible label: python tools/_probe_phone.py text | tap LABEL [wait] | shot NAME"""
import os, re, subprocess, sys, time
ADB = os.path.expanduser("~/android-sdk/platform-tools/adb.exe")
ENV = dict(os.environ, MSYS_NO_PATHCONV="1")
def sh(*a, t=60): return subprocess.run([ADB, *a], env=ENV, capture_output=True, timeout=t)
def dump():
    for _ in range(5):
        sh("shell", "rm", "-f", "/sdcard/u.xml")
        out = sh("shell", "uiautomator", "dump", "/sdcard/u.xml").stdout.decode("utf-8", "replace")
        xml = sh("shell", "cat", "/sdcard/u.xml").stdout.decode("utf-8", "replace")
        if "dumped to" in out and xml.count('text="') - xml.count('text=""') >= 8: return xml
        time.sleep(1.0)
    return xml
def nodes():
    out = []
    for tag in re.findall(r"<node[^>]*/?>", dump()):
        g = dict(re.findall(r'(\w+)="([^"]*)"', tag))
        b = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", g.get("bounds", ""))
        if not b: continue
        x1, y1, x2, y2 = map(int, b.groups())
        out.append({"t": g.get("text", ""), "cx": (x1 + x2) // 2, "cy": (y1 + y2) // 2, "clk": g.get("clickable")})
    return out
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ALIAS = {"menu": "⋯", "arrow": "→", "x": "×"}
cmd = sys.argv[1]
if cmd == "text":
    print(" | ".join(n["t"] for n in nodes() if n["t"])[:int(sys.argv[2]) if len(sys.argv) > 2 else 600])
elif cmd == "tap":
    label = ALIAS.get(sys.argv[2], sys.argv[2]); wait = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
    for n in nodes():
        if label.lower() in n["t"].lower():
            sh("shell", "input", "tap", str(n["cx"]), str(n["cy"])); time.sleep(wait); print("tapped", repr(n["t"]), n["cx"], n["cy"], "clickable", n["clk"]); break
    else: print("NOT FOUND", label)
elif cmd == "shot":
    p = os.path.join(os.path.dirname(__file__), "..", "docs", "img", "native", "probe", sys.argv[2] + ".png")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f: f.write(sh("exec-out", "screencap", "-p").stdout)
    print(p)
elif cmd == "type":
    # the remote shell splits on spaces: escape them, and send a chunk at a time
    # `input text` also chokes on punctuation; letters, digits and spaces only
    words = re.sub(r"[^A-Za-z0-9 ]+", " ", sys.argv[2]).split()
    for i in range(0, len(words), 8):
        sh("shell", "input", "text", r"\ ".join(words[i:i + 8]) + (r"\ " if i + 8 < len(words) else ""))
    print("typed", len(words), "words")
elif cmd == "key":
    sh("shell", "input", "keyevent", sys.argv[2]); print("key", sys.argv[2])
elif cmd == "swipe":
    sh("shell", "input", "swipe", "540", "600", "540", "1800", "300"); print("swiped up")
