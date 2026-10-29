#!/usr/bin/env bash
# Reset the Lumina sample app to its original, intentionally-vulnerable state.
#
# Use it between demo runs: after you've applied a fix to a Lumina file in the
# editor (to show the scanner reacting), run this to put the vulnerable code
# back so the next scan finds all issues again.
#
# apps/Lumina is gitignored (your demo edits never show up in git). The pristine
# copy is kept in apps/lumina-pristine.zip; this restores Lumina from it.
# Static demo: local files only, no network.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
SNAPSHOT=$ROOT/apps/lumina-pristine.zip

[ -f "$SNAPSHOT" ] || { echo "reset-lumina: missing $SNAPSHOT" >&2; exit 1; }

rm -rf "$ROOT/apps/Lumina"
unzip -oq "$SNAPSHOT" -d "$ROOT/apps"

echo "Lumina reset to the original vulnerable sources (apps/Lumina)."
echo "Re-run the scan to see all findings again."
