# Reconix

**Reconix** is an AI-powered security-testing assistant. This repository holds its product
surfaces — the terminal TUI, the web dashboard, and the VS Code scanner — plus the public
website. Everything runs locally, with no accounts or API keys.

## Run it

One launcher, one subcommand per surface:

```sh
./setup.sh tui      # the terminal TUI                (interactive)
./setup.sh web      # the web dashboard               http://127.0.0.1:3100
./setup.sh site     # the public website              http://localhost:3000
./setup.sh scanner  # the VS Code scanner server      http://127.0.0.1:7357 (token test-token)
./setup.sh vscode   # build + install the VS Code extension
./setup.sh reset    # restore the Lumina sample app to its vulnerable state
```

`./setup.sh` with no argument prints this list. Each one takes over a terminal, so run the ones
you want in separate terminals (first run installs dependencies automatically). You need
Python 3, [Node.js](https://nodejs.org/) 20+, and — for the VS Code surface — VS Code with the
`code` command on your PATH.

On **Windows**, use the PowerShell launcher with the same subcommands: `.\setup.ps1 tui`,
`.\setup.ps1 web`, `.\setup.ps1 reset`, etc. (if scripts are blocked, run
`Set-ExecutionPolicy -Scope Process Bypass` first). `setup.sh` also works in Git Bash.

Once `./setup.sh tui` has created its virtual environment, the TUI is also installed as the
**`reconix`** command. Activate the environment, then launch it by name:

```sh
source apps/terminal/.venv/bin/activate          # Windows: . apps\terminal\.venv\Scripts\Activate.ps1
reconix
```

## The surfaces

- **`apps/terminal/`** — the terminal TUI (`python -m reconix`, or just `reconix` in the venv; a
  scripted assessment) and the web dashboard (Next.js, reads `web/sample-data/`, no sign-in).
- **`apps/scanner/`** — the VS Code extension plus a bundled **Reconix scanner server**
  (`npm run server`, token `test-token`). Scan the **`apps/lumina-site/`** storefront: open it,
  click the shield → "Scan with Reconix", and the findings land on their lines.
- **`apps/public-web/`** — the public Reconix marketing site (Next.js). `./setup.sh site`.
- **`apps/lumina-site/`** — the Lumina storefront (React/Vite), the demo target. It runs offline
  on mock data (`npm run dev`); its planted vulnerable backend lives in `apps/lumina-site/server/`.
  The folder is gitignored (the VS Code demo edits it); the pristine copy is `apps/lumina-site.zip`,
  extracted on first run, and `./setup.sh reset` re-extracts it to undo a fix/rescan.

Each app's own README has the detail.
