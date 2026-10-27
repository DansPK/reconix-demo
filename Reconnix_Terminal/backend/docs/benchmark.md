# Benchmark

> **Docs:** [project flow](project_flow.md) · [benchmark](benchmark.md)

End-to-end scenario runs of the full workflow: **provide credentials → tool explores the app authenticated
→ report findings to the AI → agent crafts a PoC → verify it.** One section per run. For the per-class
support tables and raw tool counts, see the [support matrix](project_flow.md#appendix-a--support-matrix). **Authorized testing only.**

**Legend:** ✅ pass · ◧ partial (works, needed adjustment) · ✗ fail

---

## Run 1 — Authenticated scan → AI report → agent-crafted PoC

**2026-10-02** · custom vulnerable lab

### Setup

| Item | Value |
|---|---|
| Harness | tool orchestration + NL agent |
| Tool execution | `DansPK/kali-mcp-server` on Kali VM `192.168.210.130` (67 tools), Streamable-HTTP |
| LLM (AI/agent) | `deephat-v1-7b-heretic-abliterated-mlx` (local, `192.168.10.14:1234`), OpenAI-compatible |
| Target | `lab/vuln_web` in Docker at `http://192.168.210.1:8081` (reachable from the VM) |
| Credentials provided | `admin` / `admin` (via `GET /login`) |
| Authenticated surface | `GET /dashboard?note_id=` — **401 without a session cookie**; SQLi in `note_id` once authenticated |

### Workflow phases

| # | Phase | Result | Tool / actor | Evidence |
|---|---|---|---|---|
| 1 | **Authenticated session** | ✅ | httpx login | `GET /login?u=admin&p=admin` → `Set-Cookie: session=<token>` |
| 2 | **Auth gates attack surface** | ✅ | sqlmap (no cookie) | `/dashboard` returns **401**; unauthenticated sqlmap → **0 findings** |
| 3 | **Authenticated vuln detection** | ✅ | **sqlmap (`--cookie`)** via MCP | `note_id` injectable — boolean, error-based, time-based, UNION; back-end **SQLite** → `[High] SQL injection in 'note_id'` |
| 4 | **Report to AI** | ✅ | LLM | finding passed to the model for analysis |
| 5 | **Agent crafts PoC** | ◧ | LLM | structurally-correct PoC (login → UNION payload + cookie → parse); assumed POST + `<td>`, needed GET + `<li>` (see caveats) |
| 6 | **PoC verified (exploit works)** | ✅ | verified PoC | dumped `users` → `admin:admin`, `bob:hunter2`; `notes` → `db_pw=S3cr3t!` |

**Outcome:** credentials unlocked an attack surface invisible to unauthenticated scanning; the authenticated
SQLi was auto-detected, reported to the AI, turned into a working PoC, and the PoC exfiltrated credentials.

### Scan evidence (authenticated sqlmap)

```
GET parameter 'note_id' is vulnerable.
Parameter: note_id (GET)
    Type: boolean-based blind
    Type: error-based
    Type: time-based blind
    Type: UNION query
back-end DBMS: SQLite
```

### Agent-crafted PoC

The model's PoC (`lab/poc/run1_auth_sqli_poc.py`) chose a UNION-based extraction with session-cookie auth,
but assumed a `POST` login and `<td>`-table output; the app uses `GET` params and `<li>` output, so it 404'd
unmodified. The verified, app-accurate variant (`lab/poc/run1_auth_sqli_poc_verified.py`) runs clean:

```
session: session=8b23bfbc1eb988f8
users (username:password):
  admin:admin
  bob:hunter2
notes:
  admin -> admin private note: db_pw=S3cr3t!
  bob -> bob note
```

Injection used: `note_id=0 UNION SELECT username,password FROM users-- -`.

### Caveats

- **PoC crafting (phase 5) is model-limited.** The 7B abliterated model wrote a plausible but shape-wrong
  PoC (POST vs GET, `<td>` vs `<li>`) because the request method/output format weren't in the prompt. A
  larger model — or passing an example request/response — removes the manual fix.
- **Cookie passing:** sqlmap's `--cookie` must be unquoted in `opts` (the server splits args on whitespace;
  `--cookie="..."` leaks literal quotes → invalid cookie → 401 → 0 findings). Use `--cookie=session=<tok>`.
- **Session lifetime:** tokens live in the lab's memory until the container restarts; re-login if it bounces.
- Scanners run from the Kali VM; the login step and verified PoC run from the harness host (both can reach
  the lab). For a VM-only-reachable target, obtain the cookie from the VM side.

### Reproduce

```bash
docker restart vuln-lab                                 # lab with the authenticated /dashboard SQLi on 8081
python lab/poc/run1_auth_sqli_poc_verified.py           # end-to-end exploit
# or in chat:  harness  ->  "log into the lab with admin/admin and test /dashboard for SQLi"
```

---

## Run 2 — Juice Shop, credentialed login → authenticated BOLA → agent PoC

**2026-10-02** · OWASP Juice Shop

### Setup

| Item | Value |
|---|---|
| Harness | tool orchestration + NL agent |
| LLM (AI/agent) | `deephat-v1-7b-heretic-abliterated-mlx` (local, `192.168.10.14:1234`) |
| Target | **OWASP Juice Shop** (Docker `bkimminich/juice-shop`) at `http://192.168.210.1:8081` |
| Credentials (simulated) | `tester@lab.test` / `Labtest123!` (registered via `POST /api/Users`) |
| Auth scheme | JWT — `POST /rest/user/login` → `authentication.token` + `authentication.bid` |
| Finding | **Broken Object-Level Authorization (BOLA / IDOR)** on `GET /rest/basket/{id}` |

### Workflow phases

| # | Phase | Result | Tool / actor | Evidence |
|---|---|---|---|---|
| 1 | **Provide credentials + login** | ✅ | httpx | registered (201), login (200) → JWT (len 727) + basket id 6 (UserId 25) |
| 2 | **Auth required** | ✅ | — | `/rest/basket/{id}` needs `Authorization: Bearer`; unauthenticated → 401 |
| 3 | **Authenticated BOLA detection** | ✅ | authenticated probe (Bearer) | with my token, `GET /rest/basket/1,2,3` → **200**, returning baskets of UserId 1, 2, 3 (not mine) |
| 4 | **Report to AI** | ✅ | LLM | finding analyzed |
| 5 | **Agent crafts PoC** | ◧ | LLM | correct logic (JSON login, Bearer, basket enum); wrong JSON keys (`userId`/`items` vs `data.UserId`/`data.Products`) |
| 6 | **PoC verified (exploit runs)** | ✅ | verified PoC | read other users' baskets with our own JWT |

**Outcome:** the provided credential yielded a JWT that was abused for horizontal privilege escalation —
reading other users' baskets — the quintessential authenticated access-control flaw. Detected, reported to
the AI, turned into a PoC, and verified.

### PoC output (verified)

```
logged in as tester@lab.test — my basket id=6
basket 1: UserId=1, items=3  <-- NOT MINE (BOLA!)
basket 2: UserId=2, items=1  <-- NOT MINE (BOLA!)
basket 3: UserId=3, items=1  <-- NOT MINE (BOLA!)
basket 4: UserId=11, items=1 <-- NOT MINE (BOLA!)
```

Files: `lab/poc/run2_bola_poc.py` (model's), `lab/poc/run2_bola_poc_verified.py` (working).

### Caveats

- **PoC crafting is model-limited** — same pattern as Run 1: the 7B model nailed the exploitation logic but
  guessed the response JSON shape wrong. The verified variant is a minimal key-name fix of the model's code.
- BOLA/IDOR is a logic flaw: confirmed by an authenticated probe (change the object id with a valid token),
  not a signature scanner — the harness's `◧→✅` path for Broken Access Control.
- Juice Shop ran on `8081` (reusing the open firewall rule); the `vuln_web` lab was stopped for this run.

### Reproduce

```bash
docker run -d -p 8081:3000 --name juice-shop bkimminich/juice-shop
python lab/poc/run2_bola_poc_verified.py
# or in chat:  harness  ->  "register tester@lab.test on the juice shop, log in, and check /rest/basket for IDOR"
```

---

## Run 3 — Planner-executor convergence (stop on confirmed evidence)

**2026-10-08** · OWASP Juice Shop · validates the [agent loop's termination](project_flow.md#4-the-agent-loop)

### Setup

| Item | Value |
|---|---|
| LLM (agent) | `deepseek-v4.1-flash` (BytePlus Ark, OpenAI-compatible) |
| Target | `http://192.168.210.1:8081/rest/products/search?q=test` (Juice Shop search SQLi) |
| Prompt | "Test … for SQL injection — I own it, authorized. Confirm whether `q` is injectable, then stop and report." |

### What the loop did

| # | Step | Result |
|---|---|---|
| 1 | `update_plan` → recon/confirm/extract/report checklist | ✅ planned |
| 2 | `run_scan [sqlmap]` default | 0 findings |
| 3 | **Reflect + adapt** — "Juice Shop search often needs `--level=5 --risk=3`" → escalated `run_scan [sqlmap]` | ✅ confirmed `[High]` SQLi in `q` |
| 4 | `get_finding` to verify evidence | ✅ DBMS + techniques |
| 5 | **Stop on sufficient evidence** — marked "extract DBMS" step `skip`, "confirm" `done` | ✅ no redundant tools |
| 6 | Final report, no tool call | ✅ natural end |

### Termination outcome

- `run_scan` invocations: **2** (not an exhaustive sweep)
- Ended **naturally** (model stopped calling tools), not via the 20-round hard cap
- Plan fully resolved (all steps `done` / `skip`)

**Outcome:** the loop converged the moment it had enough evidence to confirm the class was real, skipped
redundant extraction, and ended cleanly — demonstrating the early-convergence and graceful-end guarantees.

---

## Run 4 — NL request → agent self-login (username/password) → authenticated BOLA confirmed

**2026-10-08** · OWASP Juice Shop · validates the full authenticated workflow end-to-end from plain English

### Setup

| Item | Value |
|---|---|
| LLM (agent) | `deepseek-v4.1-flash` (BytePlus Ark, OpenAI-compatible) |
| Tool execution | `DansPK/kali-mcp-server` on Kali VM `192.168.210.130` (67 tools) + host-side `httpprobe` |
| Target | **OWASP Juice Shop** (Docker) at `http://192.168.210.1:8081` |
| Credentials | a registered account given to the agent as **username + password** (no token minted by hand) |
| Prompt | "Pentest the authenticated basket API … I authorize it. Log in yourself at `/rest/user/login` with `<user>`/`<pass>`, then test `/rest/basket/1` for BOLA/IDOR and injection. Stop and report once confirmed or ruled out." |

### What the loop did (full run, 62.8s)

| # | Step | Result |
|---|---|---|
| 1 | `update_plan` → recon / login / BOLA / injection / summarize | ✅ planned |
| 2 | `run_scan recon` + `whatweb` → `get_finding` | ✅ OWASP Juice Shop (Node/Express/Angular), only 8081 open |
| 3 | **`login`** with the username/password → JWT; agent decoded its own `id=31`, basket `12` | ✅ session minted host-side (raw password never sent to the LLM) |
| 4 | **`httpprobe`** `token=<jwt> path=/rest/basket ids=12,1,2,3` | ✅ **HIGH — Broken access control (IDOR/BOLA)**, finding #1459 |
| 5 | `get_finding` → verified bodies | ✅ own basket 12 = 155 B; basket **1 = 1310 B** (another user's cart), 2/3 = 557 B |
| 6 | **Adapt** → sqlmap on the basket id path param (space-free cookie auth) | ✅ clean — SQLi ruled out |
| 7 | Mark all steps done, final summary, no tool call | ✅ natural end |

### BOLA evidence (finding #1459, `httpprobe`)

```
id=12 200 len=155   (mine, baseline)
id=1  200 len=1310  <-- another user's basket (NOT MINE)
id=2  200 len=557   <-- NOT MINE
id=3  200 len=557   <-- NOT MINE
```
`/rest/basket/{id}` returns any basket by numeric id with one session — object-level authorization is not
enforced.

### Metrics

- `run_scan` invocations: **4** · `login`: 1 · plan revisions: 3
- Ended **naturally**; **plan fully resolved** (not via the hard cap); duration **62.8s**
- Credential path: **username/password → agent logged in itself**; token carried into `httpprobe`
  host-side (never through the whitespace-splitting MCP opts)

**Outcome:** from one plain-English request the agent planned, authenticated itself with just a
username/password, **auto-confirmed BOLA/IDOR** with the `httpprobe` tool, ruled out injection, and ended
cleanly — the complete authenticated planner-executor workflow.

> This run also drove two fixes: `httpprobe` gained a `path=` option (so it probes the real API endpoint,
> not the SPA root) and now reports per-id body length (so a catch-all is distinguishable from real
> per-object data). An earlier attempt pointed the probe at the site root and correctly returned
> *inconclusive* rather than a false positive — the honesty is by design.
