#!/usr/bin/env bash
# Run the Android picker's self-check.
#
# Select.kt is pure logic with no Android in it, so it does not need the SDK, Gradle
# or a device — just kotlinc. That matters: a check nobody can run without a CI
# credit is a check that stops being run. android/check/Stubs.kt supplies the two
# data classes it reads (the real ones carry kotlinx.serialization annotations) and
# android/check/Check.kt is the fixtures.
#
# Run it after any change to Select.kt, and after any change to the picker in
# site/index.html or ios/Sources/Select.swift — the four implementations are meant
# to agree, and this is the only one that can be executed here.
#
# Usage, from anywhere:  bash tools/check_picker.sh
set -euo pipefail

VER=2.0.21
DIR="$HOME/.kotlinc-dist/kotlinc"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$DIR" ]; then
  echo "fetching kotlinc $VER (once)"
  mkdir -p "$HOME/.kotlinc-dist"
  ZIP=/tmp/kotlin-compiler-$VER.zip
  curl -sSLo "$ZIP" "https://github.com/JetBrains/kotlin/releases/download/v$VER/kotlin-compiler-$VER.zip"
  unzip -q -o "$ZIP" -d "$HOME/.kotlinc-dist"
  rm -f "$ZIP"
fi

# .bat on Windows/Git Bash, the plain script everywhere else.
KOTLINC="$DIR/bin/kotlinc"
[ -x "$KOTLINC" ] || KOTLINC="$DIR/bin/kotlinc.bat"

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

"$KOTLINC" \
  "$ROOT/android/app/src/main/java/trade/tbot/jobscout/Select.kt" \
  "$ROOT/android/check/Stubs.kt" \
  "$ROOT/android/check/Check.kt" \
  -include-runtime -d "$OUT/check.jar" 2>&1 | grep -v '^warning: ' || true

java -jar "$OUT/check.jar"
