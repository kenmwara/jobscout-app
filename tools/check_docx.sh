#!/usr/bin/env bash
# The phone's .docx files open as Word documents, named for the job they are for.
#
# Ken, 2026-09-30, after a session with Shyro: "You re-create docs, then you have to
# download them onto your phone". The phone had no Word files at all; Docx.kt builds
# them. This compiles Docx.kt off a phone (it is pure Kotlin), writes both documents,
# and opens each the way Word does: a zip with the three parts, well-formed XML, the
# text in it, escaped, and no empty section heading.
#
# Usage:  bash tools/check_docx.sh            (needs kotlinc, see check_picker.sh)
set -euo pipefail
VER=2.0.21
DIR="$HOME/.kotlinc-dist/kotlinc"
if [ ! -d "$DIR" ]; then              # the same fetch as check_picker.sh, once per machine
  mkdir -p "$HOME/.kotlinc-dist"; ZIP="$(mktemp -d)/k.zip"
  curl -sSLo "$ZIP" "https://github.com/JetBrains/kotlin/releases/download/v$VER/kotlin-compiler-$VER.zip"
  unzip -q -o "$ZIP" -d "$HOME/.kotlinc-dist"; rm -f "$ZIP"
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KOTLINC="$DIR/bin/kotlinc"; [ -x "$KOTLINC" ] || KOTLINC="$DIR/bin/kotlinc.bat"
KOTLIN="$DIR/bin/kotlin";   [ -x "$KOTLIN" ]   || KOTLIN="$DIR/bin/kotlin.bat"
OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
SRC="$ROOT/android/app/src/main/java/trade/tbot/jobscout/Docx.kt"
[ "${MUTATE:-}" = "no-escape" ] && { sed 's/\.replace("&", "&amp;")//' "$SRC" > "$OUT/Docx.kt"; SRC="$OUT/Docx.kt"; }
[ "${MUTATE:-}" = "empty-sections" ] && { sed 's/r.sections.filter { it.items.isNotEmpty() }/r.sections/' "$SRC" > "$OUT/Docx.kt"; SRC="$OUT/Docx.kt"; }
"$KOTLINC" "$SRC" "$ROOT/android/check/DocxCheck.kt" "$ROOT/android/check/Stubs.kt" -include-runtime -d "$OUT/d.jar" 2>&1 | grep -v '^warning: ' || true
# Stubs.kt's Check.kt main is not compiled in, so DocxCheck's main is the only one.
"$KOTLIN" -cp "$OUT/d.jar" trade.tbot.jobscout.DocxCheckKt "$OUT" > /dev/null
cd "$OUT" && python - <<'PY'
import zipfile, glob, sys, xml.etree.ElementTree as ET
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
bad = 0
def ok(c, what):
    global bad; bad += not c; print(("  ok   " if c else "  FAIL ") + what)
files = sorted(glob.glob("*.docx"))
ok([f for f in files] == ["cover-letter-example-org-kenya-operations-coordinator.docx", "resume-example-org-kenya-operations-coordinator.docx"],
   "both files named for the job: " + ", ".join(files))
for f in files:
    try:
        z = zipfile.ZipFile(f); names = set(z.namelist())
        ok({"[Content_Types].xml", "_rels/.rels", "word/document.xml"} <= names, f + ": the three parts Word needs")
        doc = ET.fromstring(z.read("word/document.xml"))
        paras = ["".join(t.text or "" for t in p.iter(W + "t")) for p in doc.iter(W + "p")]
        text = "\n".join(paras)
        if f.startswith("resume"):
            ok("Operations & logistics <lead>" in text and "Ran a 40-truck fleet" in text, f + ": the résumé's own words, escaped and intact")
            ok("Projects" not in text, f + ": an empty section never reaches the document")
        else:
            ok("logistics & fleets." in text and len(paras) == 3, f + ": three paragraphs, the letter's words intact")
    except Exception as e:
        ok(False, f"{f}: does not open ({type(e).__name__}: {e})")
print("VERDICT: " + ("FAIL (%d)" % bad if bad else "PASS — two Word documents named for the job, opening clean"))
sys.exit(1 if bad else 0)
PY
