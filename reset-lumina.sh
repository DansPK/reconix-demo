#!/usr/bin/env bash
# Reset the Lumina sample app to its original, intentionally-vulnerable state.
#
# Use it between demo runs: after you've applied a fix to a Lumina file in the
# editor (to show the scanner reacting), run this to put the vulnerable code
# back so the next scan finds all four issues again.
#
# Static demo: this only restores files already tracked in this repo
# (apps/Lumina/src) from the last commit. Nothing else is touched, no network.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"

TARGET=apps/Lumina/src

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "reset-lumina: not a git repo here, cannot restore $TARGET." >&2
  exit 1
fi

# Restore the working-tree copy of every Lumina source file from HEAD.
git restore --source=HEAD --worktree -- "$TARGET"

echo "Lumina reset to the original vulnerable sources ($TARGET)."
echo "Re-run the scan to see all findings again."
