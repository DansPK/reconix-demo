# Findings — OWASP Juice Shop (PoC assessment)

**Target:** `http://192.168.210.1:8081` (OWASP Juice Shop, Docker `bkimminich/juice-shop`)
**Date:** 2026-10-09 · **Authorization:** yes (operator-run lab target)
**Engine:** Reconix → `backend/` harness → Kali MCP server (`192.168.210.130:8080`, 67 tools)
**Tools run:** nmap, whatweb, nuclei, nikto (recon) + sqlmap (targeted) · AI analysis skipped (`--no-analyze`)

This is a proof-of-concept run of the real assessment path: the harness drove live Kali
tools through the MCP server against a running Juice Shop and recorded the results in its
SQLite store. 44 findings total.

## Summary

| Severity | Count | Headline |
|---|---|---|
| High | 1 | SQL injection confirmed in the product-search `q` parameter |
| Medium | 1 | Prometheus metrics endpoint exposed |
| Low | 4 | Missing security headers (CSP, HSTS, Referrer-Policy, Permissions-Policy) |
| Info | 38 | Tech fingerprint, exposed Swagger API, open CORS, decoy paths, open port |

## High

### H1 — SQL injection in `q` (GET), product search · **confirmed**
- **Location:** `http://192.168.210.1:8081/rest/products/search?q=`
- **Tool:** sqlmap (`--batch --level 1 --risk 1`) — parameter `q` reported injectable.
- **Impact:** An unauthenticated attacker can manipulate the backend SQL query to read or
  alter data outside the intended result set (data disclosure, auth bypass, tampering).
- **Evidence:** sqlmap identified `q` (GET) as injectable (sqlmap 1.10.8). Juice Shop uses
  this endpoint for its documented SQLi challenge.
- **Remediation:** Use parameterized queries / an ORM binding for the search term; never
  concatenate request input into SQL. Add input validation and least-privilege DB creds.

## Medium

### M1 — Prometheus metrics endpoint exposed
- **Location:** `http://192.168.210.1:8081/metrics`
- **Tool:** nuclei (`http/exposures/configs/prometheus-metrics`).
- **Impact:** Operational metrics are readable without authentication — information leak
  (internal routes, counts, versions) useful for reconnaissance.
- **Remediation:** Require authentication / network-restrict `/metrics`, or disable it in
  production.

## Low — missing security headers

Reported on `/` by nikto. Each lets the browser fall back to unsafe defaults.

| ID | Header missing | Effect |
|---|---|---|
| L1 | `Content-Security-Policy` | No defense-in-depth against XSS/content injection |
| L2 | `Strict-Transport-Security` | TLS not pinned; downgrade/MITM risk |
| L3 | `Referrer-Policy` | Full referrer URLs may leak to third parties |
| L4 | `Permissions-Policy` | Powerful browser features not restricted |

**Remediation:** Set these at the app/proxy layer (a strict `CSP`, `HSTS` with a long
max-age over HTTPS, `Referrer-Policy: strict-origin-when-cross-origin`, a minimal
`Permissions-Policy`).

## Informational (selected)

- **Application fingerprint:** OWASP Juice Shop identified (nuclei FingerprintHub /
  Wappalyzer; whatweb). Confirms the stack for targeted follow-up.
- **Exposed API docs:** `GET /api-docs/swagger.json` (public Swagger) — full API surface
  disclosed.
- **Open CORS:** `Access-Control-Allow-Origin: *` on `/` — any origin can read responses.
- **Open port:** `8081/tcp` open (nmap).
- **robots.txt / decoy paths:** `/ftp/` reachable (200); nikto flagged many `*.json`
  paths (`users.json`, `accounts.json`, `PasswordsData.json`, …) and `/JAMonAdmin.jsp`.
  **Caveat:** most of these are Juice Shop's SPA catch-all / deliberate decoys that return
  the app shell rather than real data — treat as *leads to verify manually*, not confirmed
  exposures. (This is exactly the catch-all false-positive class the `httpprobe` BOLA
  detector now grades down to MEDIUM/unverified.)

## Methodology

1. `docker start juice-shop` (host `:8081` → container `:3000`); reachable from the Kali VM
   at `http://192.168.210.1:8081`.
2. `harness doctor` — MCP connected (67 tools; nmap/nuclei/sqlmap present).
3. Recon pipeline: `harness pentest http://192.168.210.1:8081 --yes --no-analyze --tools nmap,whatweb,nuclei,nikto`.
4. Targeted injection: `harness pentest "http://192.168.210.1:8081/rest/products/search?q=apple" --yes --no-analyze --tools sqlmap`.
5. Findings stored in the harness SQLite DB; raw per-run reports in
   `backend/pentest-juice-recon.md` and `backend/pentest-juice-sqli.md`.

## Notes / next steps

- **What this PoC shows:** the Reconix→harness integration runs *real* tools via the Kali
  MCP server against a live target and records structured findings. AI analysis and
  mid-assessment model switching (context-preserving) are the separately-wired flexible-LLM
  layer — run with a `/model` active and without `--no-analyze` to annotate the high/critical
  findings and drive the agent interactively.
- **Not yet exercised here:** authenticated classes (BOLA/IDOR via `httpprobe`, stored XSS,
  price tampering) need a login — the agent's credential modal supplies it in interactive
  mode. nuclei CVE templates produce no behavioral hits on Juice Shop (no genuinely
  vulnerable server software).
