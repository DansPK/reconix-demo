# vuln-shop

An **intentionally vulnerable** sample project for the Reconix code scanner. It is not
meant to be deployed or run in production — each file contains one planted issue that the
scan reports, on the exact line shown below.

| File | Line | Issue | Severity |
|------|------|-------|----------|
| `src/index.js` | 42 | SQL injection (CWE-89) | critical |
| `src/routes/exec.js` | 17 | OS command injection (CWE-78) | critical |
| `src/config.js` | 8 | Hard-coded credential (CWE-798) | high |
| `src/views/profile.js` | 23 | Reflected XSS (CWE-79) | medium |
| `src/utils/hash.js` | 5 | Weak password hash / MD5 (CWE-327) | low |

The findings come from the bundled Reconix scanner server over a local connection — no
keys, no external services. The secret in `src/config.js` is a masked placeholder, not a
real key.

## Try it

1. Start the scanner server:

   ```sh
   cd ../vscode-extension && npm run server   # http://127.0.0.1:7357, token test-token
   ```

2. Open **this folder** (`vuln-shop/`) in VS Code, with the Reconix extension installed and
   pointed at `http://127.0.0.1:7357` (token `test-token`) — `../setup.sh` configures that
   for you.

3. Click the shield icon → **Scan with Reconix**. The five findings above populate the
   Findings tree, the Problems panel, and the editor gutter, each on its planted line.
