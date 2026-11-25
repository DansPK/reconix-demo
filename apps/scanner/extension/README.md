# Reconix for VS Code

Scan your code for vulnerabilities from a chat panel in the sidebar. Scanning is served by a local Reconix scanner server (no LLM, no keys, no external services); this extension is the client. It shows live progress, and lists the findings in the chat and in the Problems panel.

## Setup

1. Start the scanner server from `extension/`:
   ```sh
   npm install
   npm run server      # listens on http://127.0.0.1:7357, token "test-token"
   ```
2. `reconixCodeScanner.serverUrl` already defaults to `http://127.0.0.1:7357`, so you don't need to change it.
3. Run **Reconix Code Scanner: Set Token** and paste `test-token` (it is kept only in VS Code's secret storage; the `reconixCodeScanner.token` setting, if you use it, is cleared right away).
4. Open a project to scan — the **Lumina storefront** (`apps/lumina-site/`) has planted issues in `apps/lumina-site/server/`, matched to the findings.
5. Open the **Reconix** view in the activity bar (the Reconix icon), or right-click a file/folder → **Scan with Reconix**. The findings land on their lines in `apps/lumina-site/server/`.

## Using it

Apart from a **Rescan** button, you tell the assistant what you want, in your own words. Every message goes to the local server, which answers from the findings and starts or stops scans:

| You type, for example | What happens |
| --- | --- |
| "scan this project", "check my changes", "rescan" | Sends only the files that changed since the last scan, then scans |
| "scan everything again from scratch" | A full scan |
| "scan only the backend api", "just check src/auth" | Scans only that folder; findings for the rest are kept |
| a GitHub link, e.g. "scan https://github.com/owner/repo" | Scripted: opens a GitHub session. Only `https://github.com/lumina-store/lumina-site` is available, any other repository is refused, and nothing is cloned |
| "fix all high findings", "fix src/db.py", "fix it", "fix all findings" (or **Fix all** on the Findings tab) | The fix agent (scripted) proposes the fix for each finding and reports what it fixed (it asks first when there are more than 10 findings). One file: a diff with **Apply fix** / **Skip**. Several files: **Apply all**, or **Review one by one**, which shows each file's diff in turn |
| "summarize all findings" (or the **Summarize** button on the Findings tab) | A report: counts, most affected files, top risks, and what to fix first |
| "stop" / "cancel the scan" | Stops the running scan (the **Stop** button next to the progress bar does the same) |
| "is my login code safe?" | When the agent only *thinks* a scan would help, it asks first: **Yes, scan** / **No** |
| anything else | The agent answers, using the findings and your code |

When a scan ends, a summary card appears in the chat: a severity bar, one sentence on the overall risk, up to three things to fix first (click one to open the finding, or **Fix** it), the most affected files (click to filter), and **Fix all** / **View findings**. After you save files that have findings, the **Rescan** button above the chat lights up ("Rescan · 2 changed"). Enter sends; Shift+Enter adds a new line.

**Findings** appear while the scan runs, as each scanner finishes; ones not reviewed yet say *Reviewing…*. They are grouped by severity, then by file. Expand one to read the explanation, how to fix it, and a suggested patch (with a copy button). **Fix** asks the assistant for a fix you can review as a diff before it is applied. It works only on a saved file that has not changed since the last upload, so rescan first if you edited it. **Open** jumps to the lines in the editor (a GitHub session has no files to open). If the file changed since the scan, you get a note to rescan. Workspace findings also show as squiggles and in the Problems panel.

**Sessions** live on the server. Use the picker at the top to switch, and New, Rename or Delete to manage them. The last session for each workspace opens again next time.

## What is uploaded

Only files under the chosen workspace folder, skipping:
- `.git`, `node_modules`, `build`, `dist`, `out`, `target`, `bin`, `obj`, `.venv`, `venv`, `__pycache__`, `.idea`, `.vscode`
- anything your `.gitignore` files exclude (every folder's `.gitignore` applies to that folder and below)
- `reconixCodeScanner.extraExcludes` patterns, binary files, files over `reconixCodeScanner.maxFileSizeKB`, and symlinks

On a rescan, only new and changed files are sent. Before uploading, the extension stops if the archive is over `reconixCodeScanner.maxUploadMB` and lists the largest folders, so you can exclude them.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `reconixCodeScanner.serverUrl` | `http://127.0.0.1:7357` | Base URL of the scanner server; any address off this computer is refused |
| `reconixCodeScanner.token` | empty | Paste a token here to sign in; it moves to secure storage and this field is cleared |
| `reconixCodeScanner.caCertificate` | empty | PEM certificate to trust for HTTPS (for a self-signed server), in addition to the normal ones |
| `reconixCodeScanner.maxFileSizeKB` | `2048` | Files larger than this are skipped |
| `reconixCodeScanner.maxUploadMB` | `200` | Stop before uploading an archive larger than this |
| `reconixCodeScanner.extraExcludes` | `[]` | Extra patterns to skip (gitignore syntax) |
| `reconixCodeScanner.showLikelyFalsePositives` | `false` | Show findings marked as likely false alarms |
| `reconixCodeScanner.gutterIcons` | `true` | Severity dot next to the line numbers on lines with findings |
| `reconixCodeScanner.explorerBadges` | `true` | Finding count on files in the Explorer |
| `reconixCodeScanner.codeLens` | `true` | A line above each function with findings, with a Fix button |
| `reconixCodeScanner.scanOnSave` | `false` | Rescan a moment after you save a file in the scanned folder |

## In the editor

- **Hover** an underlined line for what's wrong and how to fix it, with Fix / Explain / Ignore links.
- **Ctrl+.** on it for the same as quick fixes, plus *Fix all findings in this file*.
- **Status bar** shows the counts (or the scan's progress); click it to open the chat.
- **Findings view** under the chat: severity → file → finding.
- **Ctrl+Alt+.** / **Ctrl+Alt+,** jump to the next / previous finding (Cmd+Alt on macOS); **Ctrl+Shift+Alt+R** opens the chat.
- Right-click a file or folder and choose **Scan with Reconix** to scan just that part; select code and choose **Ask Reconix About This Code**.
- **Ignore** hides a finding in this workspace only; *Reconix Code Scanner: Show Ignored Findings Again* brings them back.

## Commands

*Reconix Code Scanner:* Set Token, Clear Token, Open Chat, New Session, Scan Workspace, Rescan, Cancel Scan, Scan GitHub Repository, Select Model, Add Model, Set API Key, Go to Next / Previous Finding, Fix All Findings in This File, Show Ignored Findings Again, Ask Reconix About This Code. (Scan, Rescan and Cancel are also available here for keyboard users.) A walkthrough (*Help → Welcome → Get started with Reconix Code Scanner*) covers the first setup.

Logs are in the **Reconix** output channel. They never contain your token or file contents.

## How it is built

The UI (`controller.ts`, `webview/main.ts`, `editorFeatures.ts`) talks only to the `Backend` interface (`src/backend/Backend.ts`). `McpBackend` is the one implementation: it maps the bundled server's MCP tools (`src/client.ts`, snake_case types in `src/backend/wire.ts`) to `src/shared/contract.ts`. Models live in memory in `localProviders.ts`; keys never reach the server.

The server's findings are `DEMO_FINDINGS` and its fixes `FIXES` (`server/server.ts`). Each fix holds the `original` vulnerable lines and their `replacement`: a finding is served while the original lines are still in the file, and the fix goes where they are now. So `original` must match `apps/lumina-site/server/` exactly. A finding without a fix is dropped when its file's hash changes.

## Development

```sh
npm install
npm run build              # bundle with esbuild into dist/
npm run test:unit          # plain Node tests (routing, file walk, archive, upload and scan flows vs. the bundled server, and the Lumina scan/fix/rescan proof in `lumina.test.ts`)
npm run test:integration   # runs inside a downloaded VS Code against the bundled server
npm test                   # both
node --test out/test/unit/routing.test.js   # one unit test file (after npm run compile-tests)
npm run server        # scanner server on http://127.0.0.1:7357, token "test-token", for trying the UI by hand
```

Press F5 with this folder open to start an Extension Development Host. The integration tests open a second VS Code window for a few seconds; it closes on its own.
