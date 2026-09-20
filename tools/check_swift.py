#!/usr/bin/env python3
"""The Swift mistakes that only a mac can catch, caught here instead.

iOS cannot be compiled on the operator's machine, so every Swift error costs a
Codemagic build to discover — five minutes and a slot on the one mac instance
the free plan offers. Twice now the error has been the same one, and it is a
pattern a regex can see:

    \\u2014   is a Swift SYNTAX ERROR  (expected hexadecimal code in braces)
    \\u{2014} is the escape it wants

It gets into the source because a Python patch script writes "\\\\u2014" and
that is the bare form. The rest of the file's escapes are braced, so the bad
one sits among a dozen good ones and reads fine.

    python tools/check_swift.py

Not a compiler. It catches the handful of things that have actually broken
these builds; a green run here means nothing except that those are absent.
"""
import io
import os
import re
import sys

# Every message below writes an em dash, which cp437 and cp850 cannot encode.
# Without this the FAIL path dies BEFORE naming what it found, exiting 1 with a
# traceback instead of a report — the same exit code as a clean finding, and
# nothing on screen to say which. Proven on this repo: two real defects found,
# zero printed.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BS = chr(92)
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ios", "Sources")

fails = []


def bad(msg):
    fails.append(msg)
    print(f"  FAIL  {msg}")


def ok(msg):
    print(f"  ok    {msg}")


def sources():
    for root, _, files in os.walk(SRC):
        for f in sorted(files):
            if f.endswith(".swift"):
                p = os.path.join(root, f)
                yield f, io.open(p, encoding="utf-8").read()


files = list(sources())
if not files:
    bad("no Swift sources found — this check cannot fire")
    sys.exit(1)

# ── 1. unicode escapes are braced ─────────────────────────────────────────
BARE = re.compile(BS + BS + "u(?!" + re.escape("{") + ")([0-9a-fA-F]{4})")
n = 0
for name, s in files:
    for m in BARE.finditer(s):
        line = s[: m.start()].count("\n") + 1
        bad(f"{name}:{line} bare {BS}u{m.group(1)} — Swift needs {BS}u{{{m.group(1)}}}")
        n += 1
if not n:
    braced = sum(len(re.findall(BS + BS + re.escape("u{"), s)) for _, s in files)
    ok(f"{braced} unicode escapes, every one of them braced")

# ── 2. braces and parens balance outside comments and strings ─────────────
def strip(s):
    s = re.sub(r"/\*[\s\S]*?\*/", " ", s)
    s = re.sub(r"//[^\n]*", " ", s)
    # a string literal, interpolation and all; \( … ) inside is consumed with it
    return re.sub(r'"(?:[^"' + BS + BS + r'\n]|' + BS + BS + r".)*\"", '""', s)


for name, s in files:
    t = strip(s)
    d = t.count("{") - t.count("}")
    if d:
        bad(f"{name} brace imbalance {d:+d}")
if not any("brace imbalance" in f for f in fails):
    ok(f"{len(files)} files, braces balanced in every one")

# ── 3. a `body` that shadows View's own ───────────────────────────────────
#   A closure parameter or local named `body` inside a View shadows the
#   protocol's property and the type stops conforming, with an error that
#   names neither. Same for a generic called `Body`.
#   `var body: some View` is the CORRECT declaration and must never be
#   flagged. The first cut matched against the STRIPPED text and then counted
#   lines and read its lookahead in the ORIGINAL — the offsets stop
#   corresponding the moment comments and strings are blanked, so it read the
#   wrong sixty characters and reported all twenty real declarations. Match
#   and slice the same string.
for name, s in files:
    t = strip(s)
    for m in re.finditer(r"\b(?:let|var)\s+body\b([^\n]*)", t):
        # `some View` on a View and `some Scene` on the App are both correct;
        # an allow-list that knew only the first flagged @main's own body.
        if re.match(r"\s*:\s*some\s+(?:View|Scene)", m.group(1)):
            continue
        line = t[: m.start()].count("\n") + 1
        bad(f"{name}:{line} `body` declared as something other than `some View` — it shadows View's own")
    for m in re.finditer(r"<\s*Body\b", t):
        line = t[: m.start()].count("\n") + 1
        bad(f"{name}:{line} a generic named `Body` shadows View's associated type")
if not any("shadows" in f for f in fails):
    ok("no local `body` or generic `Body` shadowing View's own")

print("")
print(f"{len(fails)} FAILED" if fails else "ALL GREEN")
sys.exit(1 if fails else 0)
