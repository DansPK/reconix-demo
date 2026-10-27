#!/usr/bin/env python3
"""INTENTIONALLY VULNERABLE web app — the harness exploitation benchmark target.

Covers, on purpose, the PoC categories the harness is tested against:
  SQLi, XSS, Command Injection, SSRF, Path Traversal / LFI, Auth Bypass,
  Default Credentials, an exposed Admin Panel, and Security Misconfigurations.

⚠️  DO NOT expose to any untrusted network. Run ONLY in an isolated lab/container
on a private VM network. Stdlib only.

Endpoints:
  /                         index / links
  /item?id=1                SQL injection (raw numeric interpolation, error leak)
  /search?q=hello           reflected XSS (unescaped echo)
  /ping?host=127.0.0.1      OS command injection (shell interpolation)
  /fetch?url=http://x       SSRF (server-side fetch of attacker URL)
  /download?file=report.txt Path traversal / LFI (unsanitized file read)
  /login  (u=, p=)          SQLi auth bypass  +  default creds admin/admin
  /admin                    exposed admin panel (no auth)
A deliberately spoofed `Server: Apache/2.4.49` header + missing security headers
feed the service-CVE and misconfiguration checks.
"""

from __future__ import annotations

import html
import os
import secrets
import sqlite3
import subprocess
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

_conn = sqlite3.connect(":memory:", check_same_thread=False)
_conn.executescript(
    """
    CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, secret TEXT);
    INSERT INTO items VALUES (1,'alpha','flag{sqli-1}'),(2,'bravo','flag{sqli-2}');
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT);
    INSERT INTO users VALUES (1,'admin','admin'),(2,'bob','hunter2');
    CREATE TABLE notes (id INTEGER PRIMARY KEY, owner TEXT, body TEXT);
    INSERT INTO notes VALUES (1,'admin','admin private note: db_pw=S3cr3t!'),(2,'bob','bob note');
    """
)
SESSIONS: set[str] = set()  # valid session tokens (authenticated scanning target)
DOCROOT = os.getenv("VULN_DOCROOT", "/srv/public")
os.makedirs(DOCROOT, exist_ok=True)
with open(os.path.join(DOCROOT, "report.txt"), "w") as fh:
    fh.write("quarterly report: all nominal\n")


class Handler(BaseHTTPRequestHandler):
    server_version = "Apache/2.4.49"           # spoofed for service-CVE mapping
    sys_version = ""

    def _send(self, body: str, code: int = 200, ctype: str = "text/html", cookie: str = "") -> None:
        data = body.encode(errors="replace")
        self.send_response(code)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        # NOTE: intentionally no CSP / X-Frame-Options / HSTS (misconfiguration).
        self.end_headers()
        self.wfile.write(data)

    def _session_ok(self) -> bool:
        raw = self.headers.get("Cookie", "")
        for part in raw.split(";"):
            if part.strip().startswith("session=") and part.strip()[8:] in SESSIONS:
                return True
        return False

    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        q = parse_qs(u.query)
        p = u.path
        if p == "/":
            # Real anchors so a crawler (ZAP spider) discovers the attack surface.
            self._send(
                "<h1>Vuln Lab</h1><ul>"
                "<li><a href='/item?id=1'>item (SQLi)</a></li>"
                "<li><a href='/search?q=hi'>search (XSS)</a></li>"
                "<li><a href='/ping?host=127.0.0.1'>ping (cmd inj)</a></li>"
                "<li><a href='/fetch?url=http://127.0.0.1/'>fetch (SSRF)</a></li>"
                "<li><a href='/download?file=report.txt'>download (path traversal/LFI)</a></li>"
                "<li><a href='/login?u=admin&p=admin'>login (auth)</a></li>"
                "<li><a href='/admin'>admin (panel)</a></li>"
                "<li><a href='/account?id=1'>account (IDOR / broken access control)</a></li>"
                "<li><a href='/upload'>upload (file upload)</a></li></ul>"
            )
        elif p == "/item":
            self._item(q.get("id", ["1"])[0])
        elif p == "/search":
            self._send(f"<h1>Results for {q.get('q', [''])[0]}</h1>")   # reflected XSS
        elif p == "/ping":
            self._ping(q.get("host", ["127.0.0.1"])[0])
        elif p == "/fetch":
            self._fetch(q.get("url", [""])[0])
        elif p == "/download":
            self._download(q.get("file", ["report.txt"])[0])
        elif p == "/login":
            self._login(q.get("u", [""])[0], q.get("p", [""])[0])
        elif p == "/dashboard":
            self._dashboard(q.get("note_id", ["1"])[0])
        elif p == "/admin":
            self._send("<h1>Admin Panel</h1><p>Users, settings, danger zone. (no auth!)</p>")
        elif p == "/account":
            self._account(q.get("id", ["1"])[0])
        elif p == "/upload":
            self._send(
                "<h1>Upload</h1><form method='POST' action='/upload' enctype='multipart/form-data'>"
                "<input type='file' name='f'><input type='submit'></form>"
                "<p>Also accepts: POST /upload?name=FILE with the raw body.</p>"
            )
        else:
            self._send("<h1>404</h1>", 404)

    def do_POST(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        if u.path != "/upload":
            self._send("<h1>404</h1>", 404)
            return
        # VULNERABLE: unrestricted file upload (any name/extension, no validation),
        # stored under the web root and retrievable via /download.
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else b""
        name = parse_qs(u.query).get("name", ["upload.bin"])[0]
        name = os.path.basename(name)  # (does not restrict extension/content)
        with open(os.path.join(DOCROOT, name), "wb") as fh:
            fh.write(body)
        self._send(
            f"<h1>Uploaded</h1><p>Stored as <code>{html.escape(name)}</code> "
            f"({len(body)} bytes). Retrieve via <a href='/download?file={html.escape(name)}'>"
            f"/download?file={html.escape(name)}</a></p>"
        )

    def _account(self, acct_id: str) -> None:
        # VULNERABLE: IDOR — returns any account by id with no authorization check.
        row = _conn.execute(
            "SELECT id, username, password FROM users WHERE id = ?", (acct_id,)
        ).fetchone()
        if not row:
            self._send("<h1>Account</h1><p>not found</p>", 404)
            return
        self._send(
            f"<h1>Account #{row[0]}</h1><p>username: {html.escape(str(row[1]))}</p>"
            f"<p>password: {html.escape(str(row[2]))}</p>"
        )

    def _item(self, item_id: str) -> None:
        try:
            rows = _conn.execute(f"SELECT id,name,secret FROM items WHERE id = {item_id}").fetchall()
        except Exception as exc:  # noqa: BLE001 - leak DB error (error-based SQLi)
            self._send(f"<h1>DB error</h1><pre>{html.escape(str(exc))}</pre>", 500)
            return
        body = "".join(f"<li>#{r[0]} {html.escape(str(r[1]))} — {html.escape(str(r[2]))}</li>" for r in rows)
        self._send(f"<h1>Item(s)</h1><ul>{body or 'none'}</ul>")

    def _ping(self, host: str) -> None:
        # VULNERABLE: user input into a shell command.
        try:
            out = subprocess.run(f"ping -c 1 {host}", shell=True, capture_output=True, timeout=8, text=True)
            self._send(f"<h1>ping {html.escape(host)}</h1><pre>{html.escape(out.stdout + out.stderr)}</pre>")
        except Exception as exc:  # noqa: BLE001
            self._send(f"<pre>{html.escape(str(exc))}</pre>", 500)

    def _fetch(self, url: str) -> None:
        # VULNERABLE: server fetches an attacker-controlled URL (SSRF).
        if not url:
            self._send("<p>provide ?url=</p>", 400)
            return
        try:
            with urllib.request.urlopen(url, timeout=6) as r:  # noqa: S310
                body = r.read(4096).decode(errors="replace")
            self._send(f"<h1>Fetched {html.escape(url)}</h1><pre>{html.escape(body)}</pre>")
        except Exception as exc:  # noqa: BLE001
            self._send(f"<h1>fetch error</h1><pre>{html.escape(str(exc))}</pre>", 502)

    def _download(self, fname: str) -> None:
        # VULNERABLE: no path sanitization (path traversal / LFI).
        path = os.path.join(DOCROOT, fname)
        try:
            with open(path, "rb") as fh:
                self._send(fh.read().decode(errors="replace"), ctype="text/plain")
        except Exception as exc:  # noqa: BLE001
            self._send(f"error: {html.escape(str(exc))}", 404, ctype="text/plain")

    def _login(self, user: str, pw: str) -> None:
        # VULNERABLE: SQLi auth bypass (' OR '1'='1) + default creds admin/admin.
        query = f"SELECT username FROM users WHERE username='{user}' AND password='{pw}'"
        try:
            row = _conn.execute(query).fetchone()
        except Exception as exc:  # noqa: BLE001
            self._send(f"<pre>{html.escape(str(exc))}</pre>", 500)
            return
        if row:
            token = secrets.token_hex(8)
            SESSIONS.add(token)
            self._send(
                f"<h1>Welcome {html.escape(str(row[0]))}</h1>"
                "<p>flag{auth-bypass}</p><p><a href='/dashboard?note_id=1'>dashboard</a></p>",
                cookie=f"session={token}; HttpOnly",
            )
        else:
            self._send("<h1>Login failed</h1>", 401)

    def _dashboard(self, note_id: str) -> None:
        # AUTHENTICATED-ONLY: requires a valid session cookie. Contains SQLi in
        # note_id — reachable only after login (authenticated attack surface).
        if not self._session_ok():
            self._send("<h1>401</h1><p>login required</p>", 401)
            return
        try:
            rows = _conn.execute(f"SELECT owner, body FROM notes WHERE id = {note_id}").fetchall()
        except Exception as exc:  # noqa: BLE001 - leak DB error (error-based SQLi)
            self._send(f"<h1>DB error</h1><pre>{html.escape(str(exc))}</pre>", 500)
            return
        body = "".join(f"<li>{html.escape(str(o))}: {html.escape(str(b))}</li>" for o, b in rows)
        self._send(f"<h1>Dashboard</h1><ul>{body or 'no notes'}</ul>")

    def log_message(self, fmt: str, *args) -> None:
        import sys
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    host = os.getenv("VULN_HOST", "0.0.0.0")
    port = int(os.getenv("VULN_PORT", "8081"))
    print(f"Vuln lab on http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
