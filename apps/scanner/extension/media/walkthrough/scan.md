# Scan your project

1. Open your project folder: **File → Open Folder…** (open the project folder itself).
2. Start a scan in any of these ways:
   - Type **`scan`** in the chat and press **Enter**.
   - Run **Reconix Code Scanner: Scan Workspace** from the Command Palette (`Ctrl+Shift+P`).
   - Right-click a file or folder → **Scan with Reconix** to scan just that part.
3. Watch the progress: **collecting files → uploading → scanning → analyzing → done**.

What gets scanned:

- Your open folder's files are sent to the scanner server on this computer (respecting `.gitignore`, skipping
  binaries and files over `reconixCodeScanner.maxFileSizeKB`).
- The scanners cover application code (Semgrep), secrets (Gitleaks), dependencies (Trivy, Grype,
  OSV-Scanner) and the software inventory (Syft).

> **Scan on save:** turn on `reconixCodeScanner.scanOnSave` to re-scan automatically after
> you save a file that has findings.
