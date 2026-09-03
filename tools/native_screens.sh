#!/bin/bash
# Capture native-UI screenshots from an Android emulator (Codemagic mac_mini_m2).
# Installs the built APK, drives the REAL pipeline once (~1¢, one rate slot),
# and screenshots each stage. Usage: tools/native_screens.sh <apk> ; out: screens/*.png
set -euo pipefail
APK="$1"; OUT="screens"; mkdir -p "$OUT"
SDK="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/emulator:$SDK/platform-tools:$PATH"
IMG="system-images;android-34;google_apis;arm64-v8a"

yes | sdkmanager --licenses >/dev/null 2>&1 || true
sdkmanager "$IMG" "emulator" "platform-tools" >/dev/null
echo no | avdmanager create avd -n shots -k "$IMG" -d pixel_6 --force >/dev/null
emulator -avd shots -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect >/dev/null 2>&1 &
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
sleep 5
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

adb install -r "$APK" >/dev/null
adb shell am start -n trade.tbot.jobscout/.MainActivity >/dev/null
sleep 7
adb exec-out screencap -p > "$OUT/android-01-candidate.png"

# Accessibility dump → find a node by text, print its center (Compose exposes Text nodes).
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1; }
center() { python3 - "$1" <<'PY'
import re, sys
x = open('ui.xml', encoding='utf-8', errors='ignore').read()
m = re.search(r'text="' + re.escape(sys.argv[1]) + r'[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x)
print(f"{(int(m.group(1))+int(m.group(3)))//2} {(int(m.group(2))+int(m.group(4)))//2}" if m else "")
PY
}

dump; adb shell input tap $(center "Run today")
sleep 4
adb exec-out screencap -p > "$OUT/android-02-gates.png"

# Wait for the live scoring run to finish (button text reverts).
for i in $(seq 1 45); do
  dump
  if ! grep -q "Scoring live" ui.xml && ! grep -q "Running the gates" ui.xml; then break; fi
  sleep 3
done
sleep 2

# Scroll until the scores section label sits in the top third of the screen.
for i in $(seq 1 8); do
  dump
  Y=$(python3 -c "
import re
x=open('ui.xml',encoding='utf-8',errors='ignore').read()
m=re.search(r'text=\"180 · HONEST SCORES\"[^>]*bounds=\"\[\d+,(\d+)\]', x)
print(m.group(1) if m else 99999)")
  [ "$Y" -lt 700 ] && break
  adb shell input swipe 540 1900 540 700 250; sleep 1
done
sleep 1
adb exec-out screencap -p > "$OUT/android-03-scores.png"
ls -la "$OUT"
