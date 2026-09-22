# -*- coding: utf-8 -*-
"""
specs.py - the spec ledger's own tooling.

The ledger is docs/specs.json: every requirement Ken has given for JobScout, in
his own words, with what proves it is live. This script is how the ledger stays
true, because a ledger nobody runs is a document, and a document drifts.

    python tools/specs.py            the status table
    python tools/specs.py --check    run every named check; exit 1 on any red
    python tools/specs.py --check --skip-device
                                     ... except the ones that drive a phone,
                                     which CI cannot run. They are LISTED, by
                                     name, with what rests on them
    python tools/specs.py --new      Ken's messages since the audit date that look
                                     like requirements and are NOT in the ledger
    python tools/specs.py --render   rewrite docs/SPECS.md from the ledger

WHY IT EXISTS. On 2026-09-22 three releases came back with the same complaint and
nothing reproduced, because the requirements only ever lived in the chat. Once
that scrolled past, the surviving record was Claude's own summary - and the
summary had written down the IMPLEMENTATION as though it were the REQUIREMENT.
Every check after that compared the build to itself, stayed green, and the
product stayed wrong. --new is the half that matters: it reads what Ken actually
typed and tells you what the ledger has not caught up with.
"""
import glob
import io
import json
import os
import re
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, "docs", "specs.json")
RENDERED = os.path.join(ROOT, "docs", "SPECS.md")
TRANSCRIPTS = os.path.expanduser(
    r"~/.claude/projects/C--Workspaces-tbot-platform/*.jsonl")

MARK = {"live": "OK  ", "open": "OPEN", "changed": "RULE", "unverified": "????"}


def say(s):
    # A console without the codepage for one character must not kill the report:
    # a crash while printing exits 1 with nothing said, which reads as a finding.
    try:
        sys.stdout.write(s + "\n")
    except Exception:
        sys.stdout.write(re.sub(r"[^\x00-\x7F]", "-", s) + "\n")


def load():
    with io.open(LEDGER, encoding="utf-8") as f:
        return json.load(f)


# --------------------------------------------------------------------------
def table(d):
    rows = d["specs"]
    by = {}
    for s in rows:
        by.setdefault(s["status"], []).append(s)
    say("JobScout spec ledger - %d requirements, audited %s" % (len(rows), d["audited"]))
    say("")
    for st in ("open", "changed", "unverified", "live"):
        group = by.get(st, [])
        if not group:
            continue
        say("%s  (%d)" % (st.upper(), len(group)))
        for s in group:
            say("  %s %-26s %s  %s" % (MARK[st], s["id"], s["date"], s["surface"]))
            say('        "%s"' % s["said"][:110])
            if s.get("restated"):
                say("        restated: %s" % s["restated"][:110])
            if st != "live":
                say("        %s" % s["evidence"][:150])
        say("")
    unchecked = [s for s in rows if s.get("check") in (None, "", "none")]
    say("%d of %d rows name no check. A row with no check is a finding, not a blank."
        % (len(unchecked), len(rows)))
    return by


# --------------------------------------------------------------------------
# A check that drives a PHONE. Continuous integration has no emulator, so these
# cannot run there. They are NOT quietly dropped: --skip-device lists them by
# name every run, with the requirements that rest on them, so "the gate is
# green" never comes to mean "everything is proven".
NEEDS_A_DEVICE = ("check_popups.py",)


def check(d):
    """Run every distinct check named in the ledger. Red anywhere fails."""
    cmds = []
    for s in d["specs"]:
        c = s.get("check")
        if c and c != "none" and c not in cmds:
            cmds.append(c)

    # An explicit flag, not an inferred environment: CI= is easy to lose through
    # a wrapper, and that failure is silent — the run looks complete while two
    # requirements went unproven.
    device = [c for c in cmds if any(n in c for n in NEEDS_A_DEVICE)]
    if "--skip-device" in sys.argv and device:
        cmds = [c for c in cmds if c not in device]
        say("NOT RUN HERE — these drive a phone, and this is not a phone:")
        for c in device:
            rows = [s["id"] for s in d["specs"] if s.get("check") == c]
            say("  %s" % c)
            say("     proves: %s" % ", ".join(rows))
        say("  Run them on a device before a store build. They are not optional;")
        say("  they are simply not runnable from here.")
        say("")

    say("Running %d distinct checks named by the ledger.\n" % len(cmds))
    bad = []
    for c in cmds:
        r = subprocess.run(c, shell=True, cwd=ROOT, capture_output=True, timeout=2400)
        out = (r.stdout or b"").decode("utf-8", "replace").strip().splitlines()
        tail = out[-1] if out else "(no output)"
        say("  %s  %s" % ("PASS" if r.returncode == 0 else "FAIL", c))
        say("        %s" % tail[:150])
        if r.returncode != 0:
            bad.append(c)
    say("")
    blocked = [s for s in d["specs"] if s["status"] in ("open", "changed")]
    for s in blocked:
        say("  %s  %-24s %s" % (MARK[s["status"]], s["id"], s["evidence"][:110]))
    say("")
    say("VERDICT: %s" % ("PASS" if not bad else "FAIL (%d check(s) red)" % len(bad)))
    return 1 if bad else 0


# --------------------------------------------------------------------------
SPEC_RX = re.compile(
    r"(?ix)^\s*[\*\-•]\s+|\b(should|needs? to|must |make (it|the|sure)|add |remove |"
    r"get rid|fix |change |move |replace |enable |disable |hide |show |never |always|"
    r"can'?t |cannot |won'?t |doesn'?t |isn'?t |not working|broken|bug\b|still |"
    r"instead of|i want|i need|pls\b|please )")
PASTED_RX = re.compile(
    r"(?i)(export const meta|Promise<any>|system-reminder|task-notification|"
    r"^\s*(const|import|function|return|await|def |class )\b|```)")
NOISE_RX = re.compile(
    r"(?i)^\s*(ok|okay|go|yes|no|thanks|great|perfect|nice|cool|done|sure|continue|"
    r"carry on|push|commit|update memory[, ].*)\W*$")


def ken_messages(since):
    """Every message Ken typed after `since`, oldest first."""
    out, seen = [], set()
    for f in sorted(glob.glob(TRANSCRIPTS), key=os.path.getmtime):
        try:
            fh = io.open(f, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                if '"type":"user"' not in line and '"type": "user"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                if d.get("type") != "user":
                    continue
                ts = (d.get("timestamp") or "")[:19]
                if ts[:10] < since:
                    continue
                c = (d.get("message") or {}).get("content")
                parts = []
                if isinstance(c, str):
                    parts = [c]
                elif isinstance(c, list):
                    parts = [b.get("text", "") for b in c
                             if isinstance(b, dict) and b.get("type") == "text"]
                t = "\n".join(p for p in parts if p).split("<system-reminder")[0].strip()
                if not t or PASTED_RX.search(t) or len(t) > 4000:
                    continue
                key = (ts, t[:100])
                if key in seen:
                    continue
                seen.add(key)
                out.append((ts, t))
    out.sort()
    return out


def new(d):
    """What Ken has said since the audit that the ledger has not caught up with."""
    since = d["audited"]
    known = " ".join((s["said"] + " " + s.get("restated", "")) for s in d["specs"]).lower()
    hits = []
    for ts, t in ken_messages(since):
        for line in t.splitlines():
            s = re.sub(r"^\s*[\*\-•]\s*", "", line).strip()
            if len(s) < 12 or NOISE_RX.match(s) or s.startswith(("[Image:", "@\"", "http")):
                continue
            if not SPEC_RX.search(line):
                continue
            # already in the ledger? compare on the distinctive words
            words = [w for w in re.findall(r"[a-z]{5,}", s.lower())][:6]
            if words and sum(1 for w in words if w in known) >= max(2, len(words) - 2):
                continue
            hits.append((ts, s[:200]))
    say("Messages since %s that read like requirements and are not in the ledger:\n" % since)
    if not hits:
        say("  none - the ledger is level with the transcript.")
    for ts, s in hits:
        say("  %s  %s" % (ts, s))
    say("")
    say("%d to triage. Add each to docs/specs.json with his words VERBATIM, or" % len(hits))
    say("decide it is not a requirement. Do not paraphrase: a paraphrase is how a")
    say("requirement turns into whatever was built.")
    return 0


# --------------------------------------------------------------------------
def render(d):
    L = ["# JobScout - the spec ledger", "",
         "Generated from `docs/specs.json` by `python tools/specs.py --render`. Do not hand-edit.",
         "", "Every requirement Ken has given, **in his own words**, with what proves it is live.",
         ""]
    # the WHY paragraph, whole: from the line that opens it to the blank after it
    r = d["_README"]
    i = next(k for k, l in enumerate(r) if l.startswith("WHY THIS FILE EXISTS"))
    j = next(k for k in range(i, len(r)) if not r[k].strip())
    L += ["> " + l.strip() for l in r[i:j]]
    L += ["",
         "Audited **%s**. Source: %s" % (d["audited"], d["source"]), "",
         "| | Requirement | Said | Surface | Proven by |",
         "|---|---|---|---|---|"]
    order = {"open": 0, "changed": 1, "unverified": 2, "live": 3}
    badge = {"live": "OK", "open": "**OPEN**", "changed": "**RULING**", "unverified": "_?_"}
    for s in sorted(d["specs"], key=lambda x: (order[x["status"]], x["date"])):
        said = s["said"].replace("|", "\\|")
        chk = s.get("check") or "none"
        chk = "`%s`" % chk if chk != "none" else "**none**"
        L.append("| %s | `%s`<br><sub>%s</sub> | %s | %s | %s |"
                 % (badge[s["status"]], s["id"], s["date"], said, s["surface"], chk))
    L += ["", "## What is not settled", ""]
    for s in d["specs"]:
        if s["status"] in ("open", "changed", "unverified"):
            L.append("**`%s`** - %s" % (s["id"], s["evidence"]))
            L.append("")
    io.open(RENDERED, "w", encoding="utf-8").write("\n".join(L) + "\n")
    say("wrote %s" % RENDERED)
    return 0


if __name__ == "__main__":
    d = load()
    a = sys.argv[1:]
    sys.exit(check(d) if "--check" in a else
             new(d) if "--new" in a else
             render(d) if "--render" in a else
             (table(d), 0)[1])
