#!/usr/bin/env bash
# Unified launcher for the Reconix demo. One subcommand per surface.
#
#   ./run.sh tui        the terminal TUI            (interactive)
#   ./run.sh web        the web dashboard           http://127.0.0.1:3100
#   ./run.sh site       the public website          http://localhost:3000
#   ./run.sh scanner    the VS Code scanner server  http://127.0.0.1:7357 (token test-token)
#   ./run.sh vscode     build + install the VS Code extension (runs setup.sh)
#   ./run.sh reset      restore the Lumina sample app to its original vulnerable state
#
# The TUI, web, site and scanner each take over a terminal, so run them in separate terminals.
# Everything runs locally on bundled sample data — no accounts, no keys.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
TUI=$ROOT/apps/terminal
EXT=$ROOT/apps/scanner/extension
SITE=$ROOT/apps/public-web

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

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
    exec "$ROOT/reset-lumina.sh"
    ;;
  -h|--help|help|"") usage 0 ;;
  *) echo "run.sh: unknown command '$1'" >&2; echo; usage 1 ;;
esac
