# Pentest Harness (PoC)

A TUI security-testing harness. It manages targets, runs **nmap → nuclei → sqlmap** against them by
delegating execution to [`DansPK/kali-mcp-server`](https://github.com/DansPK/kali-mcp-server) over MCP, and
attaches AI explanations to findings via an OpenAI-compatible LLM.

> **Authorized testing only.** Only scan hosts you own or are explicitly authorized to test. The harness
> refuses to run a scan against a target not marked *authorized/in-scope*.

## How it fits together

```
Textual TUI ──> ScanManager ──> scanner adapters ──> KaliMCP (MCP client)
                     │                                      │
                     ▼                                      ▼
                  SQLite  <── findings            DansPK/kali-mcp-server (on Kali VM)
                     ▲                                 nmap · nuclei · sqlmap · …
                     │
             LLM analyzer (OpenAI-compatible)
```

The harness is a standalone app, so it embeds its **own** MCP client (`harness/mcp_client.py`) — it does not
reuse any editor/host MCP connection. Tool input schemas are discovered at runtime, so adapters pass the
argument names the server actually declares.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .            # add '.[dev]' for tests
cp .env.example .env        # then edit .env
```

### Run the Kali MCP server (on your Kali VM)

Install and start `DansPK/kali-mcp-server` on the VM where the tools live. the harness reaches it one of two
ways, set by `KALI_MCP_TRANSPORT` in `.env`:

- **`stdio`** (default): the harness runs `ssh $KALI_MCP_SSH_HOST "$KALI_MCP_REMOTE_CMD"` and speaks MCP over
  that SSH session. Requires key-based SSH to the VM. No extra network exposure.
- **`http`** / **`sse`**: point `KALI_MCP_URL` at an exposed endpoint (e.g. `http://VM:8080/mcp`), with an
  optional `KALI_MCP_AUTH_TOKEN`.

### LLM (optional but recommended)

Set `HARNESS_LLM_BASE_URL`, `HARNESS_LLM_API_KEY`, `HARNESS_LLM_MODEL` to any OpenAI-compatible endpoint
(OpenAI, Ollama's `/v1`, vLLM, …). If unset, scans still run; findings just won't get AI analysis.

## Use

```bash
harness doctor     # verify MCP connectivity + that nmap/nuclei/sqlmap are offered, and LLM config
harness            # launch the TUI
```

In the TUI: **Targets** tab to add a target (tick *authorized*), **Scan** tab to pick a target + profile and
run, **Findings** tab to browse results with AI analysis.

Profiles live in `config/harness.yaml` (`recon` = nmap, `standard` = nmap+nuclei, `full` = all three).

## Tests

```bash
pytest        # offline: exercises the output parsers, no VM/LLM needed
```

## Documentation

Full docs live in [`docs/`](docs/):

- [docs/project_flow.md](docs/project_flow.md) — how the application works: architecture, the
  planner-executor / ReflAct agent loop, adaptivity, credential flow, the detailed PoC-execution workflow,
  the support matrix, caveats, and roadmap.
- [docs/benchmark.md](docs/benchmark.md) — end-to-end benchmark runs (authenticated SQLi, Juice Shop BOLA,
  loop convergence).

## Status / scope

This is a PoC: the vertical slice *add target → scan via Kali MCP → store → LLM-analyze → view* works
end-to-end. See [project-spec.md](project-spec.md) for the broader design (ZAP, more target types,
reporting export) not yet built.
