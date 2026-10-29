#!/usr/bin/env bash
# One-shot setup for the Reconix code scanner. Safe to run again.
#
# Works on Linux, macOS and Windows (run it in Git Bash, which comes with Git for Windows).
#
# No Docker, no SonarQube, no LLM and no API keys. It builds the VS Code extension and
# points it at the bundled Reconix scanner server.
#
#   ./setup.sh
#   cd extension && npm run server          # start the scanner server on :7357
#
# Then in VS Code: Reload Window, click the shield → "Scan with Reconix".
set -euo pipefail

case $(uname -s) in
  MINGW* | MSYS* | CYGWIN*) WINDOWS=1 ;;
  *) WINDOWS= ;;
esac
if [[ $WINDOWS ]]; then
  export MSYS_NO_PATHCONV=1
  ROOT=$(cd "$(dirname "$0")" && pwd -W)
else
  ROOT=$(cd "$(dirname "$0")" && pwd)
fi
EXT=$ROOT/extension
SERVER_URL=http://127.0.0.1:7357
TOKEN=test-token

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }

# --- extension ---------------------------------------------------------------
say "Building the VS Code extension"
cd "$EXT"
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent >/dev/null 2>&1
npx -y @vscode/vsce package --allow-missing-repository --skip-license -o reconix-scanner.vsix >/dev/null
echo "Packaged $EXT/reconix-scanner.vsix"

if command -v code >/dev/null; then
  say "Installing the extension and configuring VS Code"
  code --install-extension reconix-scanner.vsix --force >/dev/null 2>&1
  case $(uname -s) in
    Darwin) SETTINGS="$HOME/Library/Application Support/Code/User/settings.json" ;;
    MINGW* | MSYS* | CYGWIN*) SETTINGS="${APPDATA//\\//}/Code/User/settings.json" ;;
    *) SETTINGS="${XDG_CONFIG_HOME:-$HOME/.config}/Code/User/settings.json" ;;
  esac
  # The extension moves reconix.token into secure storage on start and clears the setting.
  if URL=$SERVER_URL TOKEN=$TOKEN python3 - "$SETTINGS" <<'EOF'
import json, os, sys
path = sys.argv[1]
os.makedirs(os.path.dirname(path), exist_ok=True)
try:
    s = json.load(open(path, encoding="utf-8-sig")) if os.path.getsize(path) else {}
except FileNotFoundError:
    s = {}
except ValueError:
    sys.exit(1)  # settings.json has comments or trailing commas; leave it alone
for k in [k for k in s if k.startswith("vulnScanner.")]:  # migrate keys from older installs
    s.setdefault("reconix." + k[len("vulnScanner."):], s.pop(k))
s["reconix.serverUrl"] = os.environ["URL"]
s["reconix.token"] = os.environ["TOKEN"]
json.dump(s, open(path, "w", encoding="utf-8"), indent=4)
EOF
  then
    echo "VS Code settings updated (serverUrl=$SERVER_URL, token set)"
  else
    warn "Could not edit $SETTINGS. Set reconix.serverUrl=$SERVER_URL and token=$TOKEN yourself."
  fi
else
  warn "'code' is not on PATH. Install $EXT/reconix-scanner.vsix from VS Code (Extensions → … → Install from VSIX)."
fi

# --- summary -----------------------------------------------------------------
say "Done"
echo "Scanner server: $SERVER_URL  (token: $TOKEN)"
echo "Start it:       cd extension && npm run server"
echo "Sample app:     open apps/Lumina/ in VS Code (one issue per file)"
echo "Then in VS Code: Reload Window → shield icon → \"Scan with Reconix\"."
