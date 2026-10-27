# Harness Integration — real AI assessment with flexible model switching

## Context

The Reconix TUI runs a *scripted* simulation. The `backend/harness/` package is a real
agentic pentest engine: an LLM tool-calling loop (`Agent.chat`) that plans, runs Kali tools
via an MCP server, parses findings, and analyzes them. Its own UI is missing — the Reconix
TUI becomes its front-end.

**Goal (the PoC we are proving):** switch the LLM provider/model *mid-assessment* and show
the conversation context is preserved. The harness already makes this clean — `Agent.history`
lives on the `Agent`, independent of the LLM client — so switching = replace the client, keep
the `Agent`.

**Decisions (from the operator):** the harness agent drives the **whole assessment** (real
scans produce findings, not the script); the harness LLM is **rebuilt on LiteLLM** so every
Reconix provider works and switching is uniform; scans use the **real Kali MCP server**
(reachable now at `KALI_MCP_URL`).

## Approach

Reuse the harness as-is (it is built and tested); add a thin Reconix-side bridge. Keep the
scripted flow as the offline fallback so the existing 509 tests stay green — the agent runs
whenever a Reconix model is active and the harness is configured; otherwise the simulation.

**`/provider` is the whole application's LLM control plane.** The harness has no LLM config
of its own: its agent is always driven by Reconix's active provider/model. The `reconix`
provider is the default `/provider` entry, seeded from the unified `LLM_*` env (base URL,
model, key); every other model is added and switched through `/provider` + `/model`. There is
no `HARNESS_LLM_*` fallback — remove it. The active provider is always set on the agent before
`chat`, so there is always a model (the `reconix` default) unless the operator unset it.

### Phase 1 — Harness LLM on LiteLLM + a switch hook (backend/)
- `backend/harness/llm/client.py`: replace `AsyncOpenAI` with `litellm.acompletion`. Keep
  the `raw_chat`/`complete`/`available` interface and the returned dict shape
  (`role`/`content`/`tool_calls`). At import: `suppress_debug_info`, `telemetry=False`,
  `drop_params=True` (providers that ignore `temperature`/`tools` don't error).
- `backend/harness/config.py` `LLMSettings`: add `litellm_params()` → `{model, api_base,
  api_key, timeout}`. A model string with `/` (e.g. `ollama_chat/llama3.1`) is used as-is;
  a bare model + `base_url` becomes `openai/<model>` + `api_base` (the BytePlus Ark case).
  The harness no longer reads `HARNESS_LLM_*` — the bridge supplies `LLMSettings` from
  Reconix's active provider; drop the `HARNESS_LLM_*` env entirely.
- `backend/harness/agent.py`: add `Agent.set_llm(settings)` — rebuild `self.llm` and
  `self.analyzer`, **keep `self.history`**. This is the context-preserving switch.
- `backend/pyproject.toml`: swap `openai` → `litellm`. Keep `mcp`, `pyyaml`, `python-dotenv`.
- Harness tests stub `raw_chat`, so they stay green; add one test mapping a mocked litellm
  response to the dict shape.

### Phase 2 — Reconix ↔ harness bridge (reconix/store/)
- `pip install -e backend` so `import harness` works (installs `mcp`, `pyyaml`).
- `reconix/llm/` helper: `active_call_params()` → the LiteLLM `(model, api_base, api_key)`
  for Reconix's active provider, from the catalog + the decrypted key in the providers DB.
- `reconix/store/agent_run.py` (the only new store seam):
  - `available()` — harness importable + a Reconix model active.
  - `agent()` — lazily build + cache one harness `Agent` per Reconix assessment, its LLM
    set from the active provider.
  - `async run(text, on_event)` — set the LLM from the active provider, then `agent.chat`.
  - `switch_model()` — `agent.set_llm(...)` from the now-active provider; keep history.
  - `findings()` — read the harness DB for display.
- Context test: start (mocked `raw_chat`) with model A, `switch_model()` to B, chat again,
  assert the messages B receives include A's turns → **context preserved across a switch**.

### Phase 3 — Reconix UI surface (reconix/shell, screens, widgets)
- When a model is active, the Start prompt / a `/assess <target>` command launches the agent
  for the whole assessment in a Textual worker (the `web.py` worker pattern): an event-loop
  thread runs `agent_run.run`, and each harness event (`plan`/`assistant`/`tool_start`/
  `tool_progress`/`tool_end`) is marshalled via `call_from_thread` into the chat/activity log
  (reuse `add_chat`/`add_activity` + `RunLog`). Findings surface in the findings view.
- `/model` switch mid-assessment calls `agent_run.switch_model()` and drops a muted chat note;
  the SessionBar already shows the active model.
- The credential `on_ask` hook maps to the existing `LoginForm`/secure input.
- Offline/no-model: the scripted demo still runs (fallback), so existing tests pass.

### Phase 4 — Scanner + PoC test, env, docs
- Improve the host-side BOLA/IDOR verification (`parse_httpprobe`): the report notes a
  false-positive when a catch-all returns identical bodies for every id — require *distinct*
  bodies/owners before flagging HIGH `verified`. Strengthen `test_parse_httpprobe_bola`.
- Merge `HARNESS_LLM_*` / `KALI_MCP_*` / `HARNESS_DB_PATH` into the root `.env.example` with
  comments; note that the Reconix `/model` selection overrides `HARNESS_LLM_*` at runtime.
- Update `CLAUDE.md`, README, and this plan with what was built.

## Status — built

- **Phase 1** ✅ harness LLM on LiteLLM (`backend/harness/llm/client.py`), `litellm_params()`
  in `config.py`, `Agent.set_llm()`, `openai`→`litellm` dep, root-`.env` + unified `LLM_*`.
  Harness tests green (18, incl. the new client-mapping test).
- **Phase 2** ✅ `store/agent_run.py` bridge + `providers.active_llm_settings()`;
  `pip install -e backend`. Context-preservation proven in `tests/test_llm_agent_bridge.py`.
- **Phase 3** ✅ `shell/agent.py` (`AgentMixin`) + `/assess` command; `submit_request` routes
  to agent mode when a model is active; `/model` calls `switch_model()`. Pilot-tested in
  `tests/test_agent_mode_ui.py`.
- **Phase 4** ✅ `parse_httpprobe` BOLA now grades confidence by response size (verified HIGH
  vs ambiguous MEDIUM) with tests; unified `.env.example`; docs.
- **Reasoning** ✅ reasoning models' chain-of-thought (`reasoning_content`) is captured in
  the LiteLLM client, emitted as a `reasoning` event (stripped from history, never resent),
  and shown muted as "thinking…" in the chat. The planner-executor + ReflAct loop is
  unchanged (additive only). Tested in `backend/tests/` + `tests/test_llm_agent_bridge.py`.
- **Credentials** ✅ the agent's `request_credentials` pops a secure modal in the TUI
  (`screens/forms/credential.py`), wired through a worker-safe `on_ask` in `shell/agent.py`;
  password/token/cookie are masked and cleared on close, the login is performed host-side so
  the raw password never reaches the model. Pilot-tested (`tests/test_agent_credentials_ui.py`).

Not done (deliberate, follow-ups): a dedicated live-stream execution screen (events render
into chat/activity today); surfacing harness-DB findings in the findings screens.

## Verification
1. `cd backend && .venv/bin/python -m pytest -q` — harness tests green after the LiteLLM swap.
2. Reconix: `.venv/bin/python -m pytest -q` — 509 + new bridge/context tests green; no network.
3. The **context-preservation** test is the PoC's automated proof (Phase 2).
4. Live (operator-run, costs Ark credits + needs ShopWave up + the Kali VM): start an assess
   on the ShopWave target, let the agent scan, `/model` to another provider mid-run, ask
   "what did you find so far?" — the answer references earlier findings; the run continues.

## Files
- Backend: `harness/llm/client.py`, `harness/config.py`, `harness/agent.py`,
  `harness/utils/parsers.py` (BOLA), `pyproject.toml`, `tests/test_agent_loop.py`.
- Reconix: new `reconix/store/agent_run.py`; `reconix/llm/` param helper;
  `reconix/shell/` (worker + command), `reconix/store/__init__.py`, `.env.example`, docs.
