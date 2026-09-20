#!/usr/bin/env python3
"""No tool may die while reporting what it found.

    python tools/check_console.py

Python picks stdout's encoding from the console codepage. On this machine that
is cp1252, which happens to carry the em dash at 0x97, so the house message
style survives by luck. cp437 and cp850 - both of which plain cmd.exe still
sits on - carry no em dash at all, and Python raises UnicodeEncodeError the
moment a message reaches print().

That failure lands in the worst possible place. It happened twice here:

  * check_palette.py printed a box-drawing rule in its market header and died
    on cp1252 before saying anything. Exit 1, no findings: it looked like a
    failure it had never found.
  * check_swift.py survived only because its PASS strings are ASCII. Forced to
    fail, on cp437 it found two real defects and died before naming either -
    exit 1, zero lines printed, which is the same exit code as a clean report.

Both were fixed by reconfiguring stdout to UTF-8 with errors="replace", so the
worst case is a substituted glyph rather than a dead run. This asserts that any
tool which CAN print such a character has done so.

Deliberately ASCII-only itself, including every message below: a check that
polices console encoding must not be able to fall over on console encoding.
"""
import ast
import glob
import io
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
# The narrowest codepage a Windows console realistically runs. Passing here
# means passing on cp850 and cp1252 too, both of which are supersets for the
# punctuation this repo actually writes.
TARGET = "cp437"
# Calls whose arguments reach stdout. A helper added later that is not in this
# set is invisible to the scan, which is why rule 2 exists.
OUT = {"print", "ok", "bad", "log", "warn", "fail", "note"}

fails = []


# Detected as a CALL, never as a substring. This file names the guard in its
# own prose, and a grep would score it as protected on the strength of talking
# about it - which is the presence-assertion trap this repo keeps relearning.
def guarded(tree):
    """A real sys.stdout.reconfigure(...) call somewhere in the module."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        f = node.func
        if (isinstance(f, ast.Attribute) and f.attr == "reconfigure"
                and isinstance(f.value, ast.Attribute) and f.value.attr == "stdout"):
            return True
    return False


def risky(src):
    """Characters in printable literals that TARGET cannot encode."""
    found = {}
    for node in ast.walk(src if isinstance(src, ast.AST) else ast.parse(src)):
        if not (isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name) and node.func.id in OUT):
            continue
        for sub in ast.walk(node):
            if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
                for ch in sub.value:
                    if ord(ch) < 128:
                        continue
                    try:
                        ch.encode(TARGET)
                    except UnicodeEncodeError:
                        found[ch] = found.get(ch, 0) + 1
    return found


print("stdout encoding: %s | target: %s" % (sys.stdout.encoding, TARGET))
files = sorted(glob.glob(os.path.join(ROOT, "tools", "*.py")))
if not files:
    print("  FAIL  no tools found - this check cannot fire")
    sys.exit(1)

for path in files:
    name = os.path.basename(path)
    tree = ast.parse(io.open(path, encoding="utf-8").read())
    is_guarded = guarded(tree)
    found = risky(tree)

    # 1. A tool that can print an unencodable character must reconfigure first.
    if found and not is_guarded:
        detail = ", ".join("U+%04X x%d" % (ord(c), n) for c, n in sorted(found.items()))
        fails.append(name)
        print("  FAIL  %-22s prints %s and does not reconfigure stdout" % (name, detail))
        continue

    # 2. A guard nobody needs is a guard nobody maintains. Say so, quietly, so
    #    the list stays honest about which tools the rule is actually load-
    #    bearing for - and so a helper this scan cannot see still gets covered
    #    rather than being stripped as dead weight.
    if is_guarded and not found:
        print("  ok    %-22s guarded (no unencodable literal today; keep it)" % name)
    elif is_guarded:
        print("  ok    %-22s guarded, and needs it" % name)
    else:
        print("  ok    %-22s ASCII output" % name)

print("")
print("%d FAILED" % len(fails) if fails else "ALL GREEN")
sys.exit(1 if fails else 0)
