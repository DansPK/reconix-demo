# reconix-demo

Demo materials for **Reconix**, the AI-powered security-testing assistant.

This is a **pure static demo**: there is no real engine. No LLM/model calls, no live
scanning, no backend servers, no auth, no API keys — every surface runs on bundled, canned
data, so the demo always works offline.

- `apps/Reconnix_Terminal/` — the terminal TUI (`python -m reconix`, scripted assessment) +
  the web dashboard (`cd web && npm run dev`, reads `web/sample-data/`, no sign-in).
- `apps/vscode-code-scanner/` — the VS Code extension + a bundled canned **demo server**
  (`vscode-extension/`: `npm run fake-server`, token `test-token`); the shield icon →
  "Scan with Reconix" shows static findings.

Each app keeps its original UI and flow; only the real engine behind it was removed.
