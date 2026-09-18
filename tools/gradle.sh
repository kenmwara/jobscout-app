#!/usr/bin/env bash
# Run Gradle at a pinned version, fetched rather than assumed.
#
# The workflows used to run `gradle wrapper --gradle-version 8.11.1` and then `./gradlew`. That
# depends on the build image's OWN Gradle, because Gradle configures the project before it runs
# any task — including the `wrapper` task. It worked on mac_mini_m2 and broke the moment the
# Android workflows moved to linux_x2, whose image ships Gradle 8.1.1: it dies evaluating this
# project with "Failed to create Jar file … bcprov-jdk18on-1.79.jar", so no wrapper is written
# and the next line fails with "./gradlew: No such file or directory".
#
# Committing the wrapper would also fix it, but android/gradle/ and android/gradlew* are
# gitignored on purpose. This keeps that decision and removes the dependency instead: one
# pinned distribution, checksum-verified, cached in $HOME between steps of the same build.
#
# Usage, from the repo root or anywhere:  bash tools/gradle.sh assembleDebug
set -euo pipefail

VER=8.11.1
SHA=f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6
DIR="$HOME/.gradle-dist/gradle-$VER"

if [ ! -x "$DIR/bin/gradle" ]; then
  mkdir -p "$HOME/.gradle-dist"
  ZIP=/tmp/gradle-$VER-bin.zip
  curl -sSLo "$ZIP" "https://services.gradle.org/distributions/gradle-$VER-bin.zip"
  # CI executes whatever this unpacks, so it is worth one line to know what it is.
  echo "$SHA  $ZIP" | sha256sum -c -
  unzip -q -o "$ZIP" -d "$HOME/.gradle-dist"
fi

exec "$DIR/bin/gradle" --no-daemon "$@"
