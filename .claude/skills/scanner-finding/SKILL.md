---
name: scanner-finding
description: Add or edit a finding in the VS Code scanner engine (the source-code scan of apps/lumina-site). Use when changing what the scanner flags, its auto-fix, or the fix-then-rescan behavior.
---

# Scanner finding (VS Code source-scan engine)

This engine scans the **open workspace** and flags canned findings on real files. Two coupled pieces
in `apps/scanner/extension/server/server.ts`:

- **`DEMO_FINDINGS`** — the findings: `path`, `title`, `severity`, `rule_id`, `cwe`, `tools`,
  `start_line`/`end_line`, `message`, `snippet`, `verdict`, `explanation`, `fix_recommendation`.
- **`FIXES`** — keyed by the same `path`: a `{ start_line, end_line, replacement }` whole-line edit,
  shown as the diff and applied on **Fix**.

## How it matches files
The scanned source is the storefront's planted backend, `apps/lumina-site/server/`. A finding's `path`
(e.g. `server/routes/exec.js`) is matched to an open-workspace file by **suffix**
(`workspacePath === path || workspacePath.endsWith("/" + path)`). So the file must exist at that path
and the vulnerable code must sit on the finding's exact line numbers.

## Fix → rescan (commit `ecaeb4b`)
The server records each finding-file's hash on first scan; on rescan a **changed hash drops all
findings for that file** (hash comparison, not re-analysis). Applying a Fix (or resetting) changes the
hash, so the finding disappears — that's the demo's payoff.

## To add/edit a finding
1. Put the vulnerable code in a file under `apps/lumina-site/server/` at a known line.
2. Add a `DEMO_FINDINGS` entry with `path: "server/<...>"` and those line numbers.
3. Add a `FIXES` entry (same path) with the secure whole-line `replacement`.
4. **Never point a finding at the real storefront source (`src/`)** — Fix rewrites whole lines and
   would corrupt it. Keep planted vulns under `server/`.
5. Values follow [[realistic-demo-data]]: test PANs, placeholder secrets (`sk_live_****`), no real
   people. The scanner's own unit tests use separate fixtures, so repointing `DEMO_FINDINGS` is safe.

## The storefront is gitignored + zipped
`apps/lumina-site/` is gitignored because the demo edits it; the pristine copy is the tracked
**`apps/lumina-site.zip`**. **After editing anything under `apps/lumina-site/` (including `server/`),
rebuild the zip** so a fresh clone and `./setup.sh reset` get your changes:

```
tar --format=zip -c -f apps/lumina-site.zip -C apps \
  --exclude='lumina-site/node_modules/*' --exclude='lumina-site/dist/*' lumina-site
```
(Use Windows `tar.exe` / bsdtar — it writes standard forward-slash zip entries; PowerShell 5.1's
`Compress-Archive` writes backslash entries that `unzip` can't read.)

## Run / verify
`./setup.sh scanner` recompiles `server.ts` and serves on `:7357` (token `test-token`);
`./setup.sh vscode` builds + installs the extension and opens `apps/lumina-site` in VS Code → shield →
**Scan with Reconix**. `./setup.sh reset` re-extracts the zip to restore after a Fix.
