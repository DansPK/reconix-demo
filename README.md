# Reconix

**Reconix** is an AI-powered security-testing assistant. This repository holds its three
surfaces, each running locally on bundled sample data — no accounts, no API keys, offline.

- `apps/Reconnix_Terminal/` — the terminal TUI (`python -m reconix`, a scripted assessment)
  and the web dashboard (`cd web && npm run dev`, reads `web/sample-data/`, no sign-in).
- `apps/vscode-code-scanner/` — the VS Code extension plus a bundled **Reconix scanner
  server** (`vscode-extension/`: `npm run server`, token `test-token`) and a sample
  **`vuln-shop/`** project (one issue per file); open it, click the shield → "Scan with
  Reconix", and the findings land on their lines.
