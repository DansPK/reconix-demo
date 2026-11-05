#!/usr/bin/env bash
# Unified launcher for the Reconix demo. One subcommand per surface.
#
#   ./setup.sh tui      the terminal TUI            (interactive; or 'reconix' in the venv)
#   ./setup.sh web      the web dashboard           http://127.0.0.1:3100
#   ./setup.sh site     the public website          http://localhost:3000
#   ./setup.sh store    the Lumina storefront       http://localhost:5173
#   ./setup.sh scanner  the VS Code scanner server  http://127.0.0.1:7357 (token test-token)
#   ./setup.sh vscode   build + install the VS Code extension
#   ./setup.sh reset    restore the Lumina storefront from apps/lumina-site.zip (after a fix demo)
#
# The TUI, web, site and scanner each take over a terminal, so run them in separate terminals.
# Everything runs locally on bundled sample data — no accounts, no keys.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
TUI=$ROOT/apps/terminal
EXT=$ROOT/apps/scanner/extension
SITE=$ROOT/apps/public-web

# Print the leading comment block (minus the title line), stopping at the first code line.
usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} {exit}' "$0"; exit "${1:-0}"; }

# The storefront (the scan target; planted vulns in apps/lumina-site/server) is gitignored because
# the VS Code demo edits it when you "Fix" a finding. The pristine copy is the tracked
# apps/lumina-site.zip; extract it on a fresh clone, and './setup.sh reset' re-extracts on demand.
SCAN_TARGET=$ROOT/apps/lumina-site
LUMINA_ZIP=$ROOT/apps/lumina-site.zip
ensure_store() {
  [ -d "$SCAN_TARGET" ] && return 0
  [ -f "$LUMINA_ZIP" ] || return 0
  echo "Extracting the Lumina storefront (apps/lumina-site)…"
  unzip -oq "$LUMINA_ZIP" -d "$ROOT/apps"
}

case "${1:-}" in
  store|scanner|vscode|setup) ensure_store ;;
esac

case "${1:-}" in
  tui)
    venv=$TUI/.venv
    [ -x "$venv/bin/python" ] || { echo "Creating venv…"; python3 -m venv "$venv"; "$venv/bin/pip" install -q -e "$TUI"; }
    # The editable install above also exposes a `reconix` command inside the venv. Not exec'd, so
    # the hint below prints after you quit the full-screen TUI (stdout before launch is cleared).
    "$venv/bin/python" -m reconix
    echo "Tip: you can launch the TUI by name — activate the venv first, then run 'reconix':"
    echo "       source \"$venv/bin/activate\" && reconix"
    ;;
  web)
    cd "$TUI/web"
    [ -d node_modules ] || npm install
    # Serve the same runs the TUI's /web shows (~/.reconix/assessments by default, or
    # $RECONIX_DATA_DIR if set), so both launch paths open the identical dashboard. It is empty
    # until you have run an assessment in the TUI; those autosave here.
    export RECONIX_DATA_DIR="${RECONIX_DATA_DIR:-$HOME/.reconix/assessments}"
    exec npm run dev
    ;;
  site)
    cd "$SITE"
    [ -d node_modules ] || npm install
    exec npm run dev
    ;;
  store)
    cd "$SCAN_TARGET"
    [ -d node_modules ] || npm install
    exec npm run dev
    ;;
  scanner)
    cd "$EXT"
    [ -d node_modules ] || npm install
    exec npm run server
    ;;
  vscode|setup)
    "$ROOT/apps/scanner/setup.sh"
    # Open the storefront as its OWN VS Code window so the scan sees its source, including the
    # planted vulnerable backend in apps/lumina-site/server.
    if command -v code >/dev/null; then
      echo "Opening apps/lumina-site in VS Code (scan from this window)…"
      code "$SCAN_TARGET"
    fi
    ;;
  reset|reset-lumina)
    # Restore the storefront from the pristine zip after a "Fix" + rescan demo (overwrites source
    # files in place; node_modules, which isn't in the zip, is left alone).
    [ -f "$LUMINA_ZIP" ] || { echo "setup.sh: missing apps/lumina-site.zip" >&2; exit 1; }
    unzip -oq "$LUMINA_ZIP" -d "$ROOT/apps"
    echo "Lumina storefront reset to its original sources (apps/lumina-site)."
    echo "Re-run the scan to see all findings again."
    ;;
  -h|--help|help|"") usage 0 ;;
  *) echo "setup.sh: unknown command '$1'" >&2; echo; usage 1 ;;
esac
