# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**the harness** — a Textual TUI security-testing harness for *authorized, controlled* penetration testing (the
repo name is "Controlled-Exploitation-Test"). It manages targets, runs **nmap → nuclei → sqlmap** against
them by delegating execution to the [`DansPK/kali-mcp-server`](https://github.com/DansPK/kali-mcp-server)
MCP server, parses results into findings, stores them in SQLite, and attaches AI explanations via an
OpenAI-compatible LLM.

`project-spec.md` is the *original* blueprint (full 6-phase vision: ZAP, 4 target types, report export). The
code is a **PoC vertical slice** of it with one deliberate departure: tool execution goes through an MCP
server, **not** local `nuclei`/`zap` subprocesses. When the spec and the code disagree, the code wins;
treat the spec as aspirational scope, not a contract.

**Authorization is a feature.** `ScanManager.run_profile` raises `PermissionError` unless
`target.authorized` is true, and the TUI blocks the same. Keep that gate; only scan owned/in-scope hosts.

## Commands

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"          # runtime + pytest
cp .env.example .env             # then edit (see below)

harness doctor                  # check MCP connectivity + that tools are offered + LLM config
harness                         # DEFAULT: Claude-Code-style natural-language chat agent
harness classic                 # the older tabbed TUI (targets/scan/findings)
pytest                           # offline: parser unit tests, no VM/LLM needed
pytest tests/test_parsers.py::test_parse_nuclei_jsonl   # single test
```

`.env` config: `KALI_MCP_TRANSPORT` = `stdio` | `http` | `sse`. For stdio, the harness launches
`ssh $KALI_MCP_SSH_HOST "$KALI_MCP_REMOTE_CMD"` (server runs on the VM). For http/sse, set `KALI_MCP_URL`
(+ optional `KALI_MCP_AUTH_TOKEN`, sent as `Authorization: Bearer`). LLM is optional: unset
`HARNESS_LLM_*` → scans still run, findings just get no AI analysis. **`.env` is git-ignored; the live
config currently uses `http` against the Kali VM with a bearer token.**

## Architecture

Data flows: **UI → `ScanManager` (`scanners/manager.py`) → scanner adapter → `KaliMCP`
(`mcp_client.py`) → the Kali MCP server.** Findings land in SQLite (`db.py`); the LLM analyzer
(`llm/`) annotates them; the UI reads back from the DB. Shared dataclasses (`models.py`: `Target`,
`Finding`, `ScanResult`, enums `TargetType`/`Severity`) are the lingua franca across all layers.

Two front-ends over the same core:
- **`ui/chat.py` + `agent.py` (default)** — a Claude-Code-style NL agent. `Agent` runs an LLM
  tool-calling loop (`LLMClient.raw_chat` with `TOOLS`): the model calls `add_target` / `authorize_target`
  / `run_scan` / `list_findings` / `get_finding` etc., the harness executes them, and results feed back until
  the model answers. `agent.chat()` streams events (`assistant`/`tool_start`/`tool_progress`/`tool_end`)
  which `ChatApp` renders inline. The scan progress callback is sync, so `_run_scan` bridges it to the loop
  via `loop.create_task`. Requires an LLM that supports function-calling.
- **`ui/main.py` (`harness classic`)** — the original tabbed TUI (targets/scan/findings) with live
  step-by-step scan narration.

- **`mcp_client.py` is the heart.** the harness embeds its *own* MCP client (official `mcp` SDK) — it does not
  reuse any host/editor MCP connection. `KaliMCP` is transport-agnostic (stdio via SSH, or streamable
  http/sse) and manages the connection with an `AsyncExitStack`. It discovers tools at runtime; adapters
  read each tool's input schema to pass correctly-named args.
- **Scanner adapters** (`scanners/`: nmap, nuclei, sqlmap, nikto, commix, whatweb, gobuster, zap) are thin:
  subclass `BaseScanner`, declare `tool_name` + a `parser`, implement `target_value()`. `build_args()` uses
  `adapt_target_args()` to map the target + options onto the schema's real property names; override it for
  extra params (nmap/nikto add a port from the URL; gobuster adds a wordlist+mode). A multi-step tool
  overrides `run_args()` instead (see `zap.py`: `zap_spider` then `zap_alerts`). Register new ones in
  `scanners/__init__.py:SCANNERS`. Profiles (which tools run, in order) live in `config/harness.yaml`:
  `recon`, `standard`, `full`, `web-deep` (whatweb→nuclei→nikto→sqlmap→commix), `dast`, `zap`, `web-deep+zap`.
  Two non-standard scanners: `nuclei-dast` (same `nuclei` MCP tool, `-dast` opts → active param fuzzing +
  interactsh/OAST; detects blind SSRF/LFI/injections — point the target at a `?param=` URL), and `upload`
  (NOT an MCP tool — a host-side httpx probe that uploads a marked file and retrieves it; `available()`
  returns True; target must be reachable from the harness host; endpoints overridable via its `options`).
- **Parsers** (`utils/parsers.py`) are pure, tolerant functions (raw tool text → `list[Finding]`); they
  never raise on junk lines. This is the offline-testable core.
- **Async everywhere.** Scans run in a Textual worker; DB uses a fresh sqlite connection per call so it's
  safe from worker threads.

## Gotchas (learned the hard way — don't regress these)

- **The DansPK server's tool param names:** `nmap{target, ports, opts}`, `nuclei{target, opts}`,
  `sqlmap{url, opts}`. Note sqlmap's target key is **`url`**, not `target`, and the options key is **`opts`**
  for all three (not `options`). `adapt_target_args` handles this via its candidate-key lists — keep `url`
  in the target candidates and `opts` first in the option candidates (`scanners/base.py`).
- **mcp SDK (`mcp>=2.x`) exposes the schema as `input_schema`** (snake_case), with an `inputSchema` alias on
  older versions. `KaliMCP.schema_props` reads both; reading only `inputSchema` silently yields `{}` and
  args get dropped.
- **Streamable HTTP auth:** `streamable_http_client` takes no `headers` kwarg — build the header-carrying
  client with `create_mcp_http_client(headers=...)` and pass it as `http_client` (see `mcp_client.py`).
- nuclei options include `-jsonl` so `parse_nuclei` gets JSON lines; if you change the nuclei profile opts,
  keep JSONL output or the parser yields nothing. The `web-deep` nuclei opts use targeted template dirs
  (`-t http/technologies/ -t http/misconfiguration/ -t http/exposures/`) for fast, reliable hits.
- **ZAP IS available via the MCP server** (the server now ships 67 tools incl. a `zap_*` suite:
  `zap_start/status/spider/scan/active_scan/alerts/report/stop`). ZAP runs on the Kali VM; it auto-starts.
  The `zap` scanner does spider + passive-scan `zap_alerts` (fast, hundreds of misconfig/info findings).
  Intrusive active scanning (real SQLi/XSS payloads) is `zap_active_scan` / `zap_scan` — available but not
  run by default (can take many minutes). Tool count/availability can change as the user edits their
  server, so always discover live rather than hardcoding.
- **nikto** takes `host`+`port` (not a URL); **gobuster** requires a `wordlist` (defaults to a standard
  Kali path). The adapters handle both.
- **commix is broken on this MCP server** (server-side): `tools/base.py:run_tool` runs with inherited
  stdin, so commix v4.1 switches to stdin target-parsing and ignores `--url`. No client `opts` fix it;
  server fix is `run_tool(cmd, input_data=url)`. Use **ZAP active scan for command-injection** instead.
- **Agent loop guard:** small/abliterated models re-issue identical tool calls; `agent.py` dedupes
  `(tool, args)` per turn and stops (still answers every `tool_call` to satisfy the API).

## Lab target & networking

`lab/vuln_web/` is a tiny intentionally-vulnerable stdlib app (SQLi + XSS). For broader PoCs we run
**OWASP Juice Shop** in Docker: `docker run -d -p 8081:3000 --name juice-shop bkimminich/juice-shop`.
The scanner tools run on the Kali VM (192.168.210.130); the host is reachable from the VM at
**192.168.210.1**. A host firewall rule is required so the VM can reach the lab port:
`sudo ufw allow from 192.168.210.0/24 to any port 8081 proto tcp`. Scan target URL from the VM's side is
`http://192.168.210.1:8081/...`.

## Not a git repo

There's an IntelliJ `.idea/` folder (editor metadata only). An OpenAI Codex config exists at
`~/.codex/config.toml` — reply `/import` to pull its user-level items into Claude Code if wanted.
