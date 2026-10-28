# Reconix

**Reconix** is an AI-powered security-testing assistant. This repository holds its three
surfaces, each running locally on bundled sample data — no accounts, no API keys, offline.

## Run it

One launcher, one subcommand per surface:

```sh
./run.sh tui        # the terminal TUI                (interactive)
./run.sh web        # the web dashboard               http://127.0.0.1:3100
./run.sh scanner    # the VS Code scanner server      http://127.0.0.1:7357 (token test-token)
./run.sh vscode     # build + install the VS Code extension
```

`./run.sh` with no argument prints this list. Each surface takes over a terminal, so run the
ones you want in separate terminals (first run installs dependencies automatically). You need
Python 3, [Node.js](https://nodejs.org/) 20+, and — for the VS Code surface — VS Code with the
`code` command on your PATH.

## The surfaces

- **`apps/Reconnix_Terminal/`** — the terminal TUI (`python -m reconix`, a scripted
  assessment) and the web dashboard (Next.js, reads `web/sample-data/`, no sign-in).
- **`apps/vscode-code-scanner/`** — the VS Code extension plus a bundled **Reconix scanner
  server** (`npm run server`, token `test-token`) and a sample **`vuln-shop/`** project (one
  issue per file). Open it, click the shield → "Scan with Reconix", and the findings land on
  their lines.

Each app's own README has the detail.
