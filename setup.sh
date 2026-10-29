#!/usr/bin/env bash
# Unified launcher for the Reconix demo. One subcommand per surface.
#
#   ./setup.sh tui      the terminal TUI            (interactive)
#   ./setup.sh web      the web dashboard           http://127.0.0.1:3100
#   ./setup.sh site     the public website          http://localhost:3000
#   ./setup.sh scanner  the VS Code scanner server  http://127.0.0.1:7357 (token test-token)
#   ./setup.sh vscode   build + install the VS Code extension
#   ./setup.sh reset    restore the Lumina sample app to its original vulnerable state
#
# The TUI, web, site and scanner each take over a terminal, so run them in separate terminals.
# Everything runs locally on bundled sample data — no accounts, no keys.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
TUI=$ROOT/apps/terminal
EXT=$ROOT/apps/scanner/extension
SITE=$ROOT/apps/public-web

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

# apps/Lumina is gitignored (edited during demos); on a fresh clone it is missing,
# so extract the tracked pristine copy. ./setup.sh reset re-extracts it on demand.
ensure_lumina() {
  [ -d "$ROOT/apps/Lumina" ] && return 0
  [ -f "$ROOT/apps/lumina.zip" ] || return 0
  echo "Extracting the Lumina sample app (apps/Lumina)…"
  unzip -oq "$ROOT/apps/lumina.zip" -d "$ROOT/apps"
}

case "${1:-}" in
  tui|web|site|scanner|vscode|setup) ensure_lumina ;;
esac

case "${1:-}" in
  tui)
    venv=$TUI/.venv
    [ -x "$venv/bin/python" ] || { echo "Creating venv…"; python3 -m venv "$venv"; "$venv/bin/pip" install -q -e "$TUI"; }
    exec "$venv/bin/python" -m reconix
    ;;
  web)
    cd "$TUI/web"
    [ -d node_modules ] || npm install
    exec npm run dev
    ;;
  site)
    cd "$SITE"
    [ -d node_modules ] || npm install
    exec npm run dev
    ;;
  scanner)
    cd "$EXT"
    [ -d node_modules ] || npm install
    exec npm run server
    ;;
  vscode|setup)
    exec "$ROOT/apps/scanner/setup.sh"
    ;;
  reset|reset-lumina)
    # Restore Lumina to its original vulnerable state from the tracked zip.
    [ -f "$ROOT/apps/lumina.zip" ] || { echo "setup.sh: missing apps/lumina.zip" >&2; exit 1; }
    rm -rf "$ROOT/apps/Lumina"
    unzip -oq "$ROOT/apps/lumina.zip" -d "$ROOT/apps"
    echo "Lumina reset to the original vulnerable sources (apps/Lumina)."
    echo "Re-run the scan to see all findings again."
    ;;
  -h|--help|help|"") usage 0 ;;
  *) echo "setup.sh: unknown command '$1'" >&2; echo; usage 1 ;;
esac
