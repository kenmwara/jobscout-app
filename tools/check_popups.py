# -*- coding: utf-8 -*-
"""
check_popups.py - the four things Ken reported on the phone, asserted against
a running emulator or device.

  A  the EMPTY hero bar is one line and its clip is icon-only (the bar density)
  B  the hero bar WITH CONTENT stacks: the resume takes the full width, the
     clip leads a row of its own beneath it, and it carries its label
  C  the clip opens the document picker
  D  a finished draft OPENS ITSELF, with no "Read it" tap
  D' the guard on D: with the sheet closed and nothing tapped, the same watch
     reports no popup. A watch that cannot say NO has not said YES.

      python tools/check_popups.py

Sources, all Ken's own words. 2026-09-20: "the design language is off - both
the oval text box, and the clip"; "Resume and cover page helper should go
straight to popup"; "Centre the popup"; "Clicking outside the popup should
exit the popup"; "Mirror above upgrades from web to mobile"; "Popups pls".
2026-09-22, of the shipped app: "Landing page upload bar is still the same
old oval one, cover letter, resume... won't popup at all".
"""
import io
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ADB = os.path.expanduser("~/android-sdk/platform-tools/adb.exe")
ENV = dict(os.environ, MSYS_NO_PATHCONV="1")
PKG = "trade.tbot.jobscout"
RESUME = ("Kenneth Kariuki, Vancouver BC. Cybersecurity, vulnerability management, threat "
          "hunting, OT and ICS security. Python, SIEM, incident response, Linux, cloud "
          "security. Risk assessment and penetration testing.")

fails = []
checks = 0


def sh(*a, t=60):
    try:
        return subprocess.run([ADB, *a], env=ENV, capture_output=True, timeout=t)
    except subprocess.TimeoutExpired:
        return None


def nodes():
    """Every node carrying text, a name, or an edit cursor - with its bounds."""
    sh("shell", "uiautomator", "dump", "/sdcard/u.xml", t=45)
    r = sh("shell", "cat", "/sdcard/u.xml", t=45)
    if not r:
        return []
    try:
        root = ET.fromstring(r.stdout.decode("utf-8", "replace"))
    except ET.ParseError:
        return []
    out = []
    for n in root.iter("node"):
        b = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.get("bounds") or "")
        if not b:
            continue
        x1, y1, x2, y2 = map(int, b.groups())
        txt = (n.get("text") or "").strip()
        desc = (n.get("content-desc") or "").strip()
        cls = (n.get("class") or "").split(".")[-1]
        if txt or desc or cls == "EditText":
            out.append(dict(cls=cls, text=txt, desc=desc, x1=x1, y1=y1, x2=x2, y2=y2,
                            w=x2 - x1, h=y2 - y1, cx=(x1 + x2) // 2, cy=(y1 + y2) // 2))
    return out


def tap(x, y):
    sh("shell", "input", "tap", str(x), str(y), t=30)


def labels(ns):
    return {n["text"] for n in ns} | {n["desc"] for n in ns}


def first(ns, pat):
    rx = re.compile(pat, re.I)
    return next((n for n in ns if rx.search(n["text"]) or rx.search(n["desc"])), None)


def edit(ns):
    return next((n for n in ns if n["cls"] == "EditText"), None)


def ck(name, ok, saw=""):
    global checks
    checks += 1
    if not ok:
        fails.append(name + (("  (" + saw + ")") if saw else ""))


def say(s):
    # A console without the codepage for an em dash must not die mid-report:
    # a crash while printing exits 1 with nothing said, which reads exactly
    # like a finding.
    try:
        sys.stdout.write(s + "\n")
    except Exception:
        sys.stdout.write(re.sub(r"[^\x00-\x7F]", "-", s) + "\n")


def watch(seconds):
    """Poll for the reading sheet. Returns how long it took, or None."""
    t0 = time.time()
    while time.time() - t0 < seconds:
        if "Copy all" in labels(nodes()):
            return round(time.time() - t0, 1)
        time.sleep(2)
    return None


# --- a first run, so the landing is the landing ------------------------------
sh("shell", "pm", "clear", PKG)
sh("shell", "am", "start", "-n", PKG + "/.MainActivity")
time.sleep(12)

ns = nodes()
ed = edit(ns)
ck("A the hero field exists", ed is not None)
empty_w = ed["w"] if ed else 0
empty_h = ed["h"] if ed else 0

if ed:
    # --- A. the empty bar keeps the density the landing exists for -----------
    ck("A the empty bar is one line", ed["h"] < 160, "%dpx tall" % ed["h"])
    ck("A the empty bar's clip is icon-only", "Attach a file" not in labels(ns))

    # --- C. the file door opens ----------------------------------------------
    clip = first(ns, "Attach your")
    ck("C the clip has a name", clip is not None)
    if clip:
        tap(clip["cx"], clip["cy"])
        time.sleep(5)
        seen = " ".join(labels(nodes()))
        ck("C the clip opens the document picker",
           any(k in seen for k in ("Recent", "Show roots", "Browse")), seen[:70])
        sh("shell", "input", "keyevent", "4")
        time.sleep(3)

    # --- B. a bar with content is a well -------------------------------------
    # SEEDED, NOT TYPED. This emulator's keyboard will not take injected keys
    # - one `input text` of 205 characters delivered exactly one - so the
    # resume arrives by the debug-only intent extra the app already carries
    # for this reason. Typing it landed a two-line fragment, which the app
    # rightly read as a job-title search, and the check then blamed the app
    # for the matches its own broken typing had prevented.
    sh("shell", "am force-stop " + PKG)
    time.sleep(2)
    sh("shell", "am start -n %s/.MainActivity --es resume '%s'" % (PKG, RESUME), t=60)
    time.sleep(8)

    ns = nodes()
    ed2, go, clip2 = edit(ns), first(ns, r"^→$"), first(ns, "Attach your")
    got = len(ed2["text"]) if ed2 else 0
    ck("B the whole resume reached the field", got >= len(RESUME) - 5,
       "%d of %d characters landed" % (got, len(RESUME)))
    ck("B the field grew for the text", ed2 is not None and ed2["h"] > empty_h + 40,
       "%spx against %dpx empty" % (ed2["h"] if ed2 else "-", empty_h))
    ck("B the text takes the full width", ed2 is not None and ed2["w"] > empty_w + 100,
       "%s wide against %s empty" % (ed2["w"] if ed2 else "-", empty_w))
    ck("B the clip carries its label", "Attach a file" in labels(ns))
    if ed2 and clip2:
        ck("B the clip sits BENEATH the text, not beside it", clip2["y1"] >= ed2["y2"] - 8,
           "clip y%d, text ends y%d" % (clip2["y1"], ed2["y2"]))
        ck("B the clip LEADS its row", clip2["x1"] <= ed2["x1"] + 30,
           "clip x%d, text x%d" % (clip2["x1"], ed2["x1"]))
    if go and clip2:
        ck("B the go ends that same row", abs(go["cy"] - clip2["cy"]) < 40 and go["x1"] > clip2["x1"],
           "go (%d,%d), clip (%d,%d)" % (go["x1"], go["cy"], clip2["x1"], clip2["cy"]))

# --- D. a draft opens itself --------------------------------------------------
go = first(nodes(), r"^→$")
if go:
    tap(go["cx"], go["cy"])
    t0, prep = time.time(), None
    while time.time() - t0 < 210:
        prep = first(nodes(), "Prepare application")
        if prep:
            break
        time.sleep(4)
    ck("D a run reaches the matches", prep is not None)
    if prep:
        tap(prep["cx"], prep["cy"])
        time.sleep(4)
        onward = first(nodes(), "Prepare application|Apply anyway")   # the detail's own primary
        if onward:
            tap(onward["cx"], onward["cy"])
            time.sleep(4)
        run = first(nodes(), "Write the letter|Rebuild my r|Get their questions")
        ck("D the drafting steps are reachable", run is not None)
        if run:
            tap(run["cx"], run["cy"])
            at = watch(200)
            ck("D the draft OPENS ITSELF, with no Read it tap", at is not None,
               ("opened at t+%ss" % at) if at else "it never opened on its own")

            # --- D'. THE GUARD ------------------------------------------------
            sh("shell", "input", "keyevent", "4")
            time.sleep(3)
            again = watch(20)
            ck("D' the watch reports NO popup when none opens", again is None,
               "claimed one at t+%ss with nothing tapped" % again)
            ck("D' Read it is there to reopen a closed draft", "Read it" in labels(nodes()))

say("check_popups: %d assertions on %s" % (checks, PKG))
for f in fails:
    say("  FAIL  " + f)
say("VERDICT: " + ("PASS" if not fails else "FAIL (%d)" % len(fails)))
sys.exit(1 if fails else 0)
