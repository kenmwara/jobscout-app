#!/bin/bash
# Type a usable resume into the app's box on the emulator, and run it.
#
# `adb input text` silently drops characters on anything long — 400 characters
# sent in one call arrives as 150 — so this sends short chunks with a pause and
# reads the field back at the end. Spaces are %s and a `;` would end the shell
# command, so neither appears below.
set -e
ADB="$HOME/android-sdk/platform-tools/adb.exe"
T(){ MSYS_NO_PATHCONV=1 "$ADB" shell input tap "$1" "$2"; sleep "${3:-2}"; }
S(){ MSYS_NO_PATHCONV=1 "$ADB" shell input text "$1"; sleep 1.3; }

"$ADB" shell am force-stop trade.tbot.jobscout
"$ADB" shell am start -n trade.tbot.jobscout/.MainActivity >/dev/null 2>&1
sleep 9

T 429 644 3
S "Senior%sPlatform%sEngineer."
S "%sEXPERIENCE."
S "%sTechnical%slead%son%sa%strading%splatform."
S "%sCloudflare%sWorkers%sand%sPython."
S "%sRisk%sgates%sand%sreconciliation."
S "%sSKILLS."
S "%sPython%s8%syears."
S "%sTypeScript%sSQL%sPostgres."
S "%sTerraform%sLinux."
S "%sEDUCATION."
S "%sBSc%sComputer%sScience."
sleep 1

# The box grows as it fills, so the arrow is not where it was when it was empty.
ARROW_Y=$(MSYS_NO_PATHCONV=1 "$ADB" shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1; \
  MSYS_NO_PATHCONV=1 "$ADB" shell cat /sdcard/u.xml 2>/dev/null \
  | tr '>' '\n' | grep -o 'class="android.widget.EditText"[^/]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' \
  | grep -o '\[[0-9]*,[0-9]*\]$' | tr -d '[]' | cut -d, -f2)
[ -z "$ARROW_Y" ] && ARROW_Y=700
echo "box bottom at ${ARROW_Y}px, tapping the arrow just above it"
T 946 $((ARROW_Y - 25)) 2

echo "running (8 live calls)..."
sleep 38
