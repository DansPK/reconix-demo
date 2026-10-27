# Flexible LLM Model Integration (PoC)

What was built for spec item **3.8 Flexible LLM Model Integration**. Everything else —
the scripted run, gates, findings, approvals, the whole deterministic core — is unchanged.
This follows the principle in `LLM_INTEGRATION_PLAN.md`: **the LLM proposes narrative
replies only; it never decides.** The model gets no tools and no code path reaches a
decision function (`approve`, `reject`, `approve_scope`, `edit_scope`).

## What it does

- Chat lines typed **during and after a run** go to a real LLM, with the fixed safety prompt, the
  assessment state as context, and the full chat history. Everything else stays scripted.
- The operator can add / update / remove / test providers and pick a model, and can switch
  provider or model **mid-run** — the run, findings, approvals and guardrails are untouched.
- Providers, the active selection and chat history live in **one SQLite file**. API keys
  are **Fernet-encrypted** in it; the UI only ever shows a hint like `sk-…3f9a`.

## The seam

The store stays the only thing the UI calls. Low-level parts live in `reconix/llm/`
(no UI, no `store.lists` imports):

| module | role |
|---|---|
| `config.py` | loads `.env`; DB path, key file, timeout, Reconix URL/model (read-only) |
| `crypto.py` | Fernet: key file 0600, `encrypt` / `decrypt` / `hint` |
| `db.py` | stdlib `sqlite3`: schema, 0600 file, CRUD (providers / active_model / chat_messages / model_switches) |
| `catalog.py` | the 6 providers (reconix, openai, anthropic, deepseek, ollama, openai_compatible) and their rules |
| `client.py` | LiteLLM `complete()` and `ping()`; redacted `LLMError`; keys never in env/logs |
| `guardrail.py` | `SYSTEM_PROMPT`, `build_messages`, `check_response`; every piece redacted |

Store functions (exported from `reconix.store`): `list_providers`, `get_provider`,
`set_provider`, `unset_provider`, `test_provider`, `activate`, `active_model`
(`store/providers.py`); `reply` (`store/llm_chat.py`). `run.say_to_assistant` now splits
into `say_operator_line` (records the line) + `llm_answer` (the model reply, or the
built-in reply as a fallback when no model is active or the call fails).

## UI

- `/provider` — a menu of every provider (label, `[configured]`, masked key, model(s),
  status) → Set/Update, Test, Use a model, Unset. `/provider set|update|test|unset <id>`
  go straight to the action. Unset asks to confirm (`danger`, defaults to "No, keep it").
- `/model` — pick the active model; models of unreachable providers are disabled with
  "Test the connection first". `/model <provider>/<model>` activates directly.
- `ProviderForm` (`screens/forms/provider.py`) — fields depend on the provider; the key is
  masked and cleared on close. Cloud providers (OpenAI/Anthropic/DeepSeek) are **key-only** —
  their endpoint and default models are built into `catalog.py`; Ollama takes a model name,
  the custom endpoint a URL + model, and Reconix shows its `.env` base/model read-only.
- `SessionBar` shows `llm: <provider> · <model> ●` (dot by reachability) or `llm: off`.
- The model call blocks, so `shell/actions.py` runs `llm_answer` in a Textual worker
  (`shell/llm.py` runs reachability tests the same way); the `RunController` keeps playing.

## Guardrails (unchanged + one addition)

Policy, approvals (hash + single-use HIGH token), vault, the credential-paste refusal at
the login gates, and snapshot redaction all stay exactly as they were. Added: one fixed
`SYSTEM_PROMPT` and full redaction of every outbound message. The plain API key is
decrypted only inside `client.py`, passed as `api_key=`, never written to env, logs, chat,
snapshots or exceptions.

## Tests

`tests/test_llm_providers.py`, `test_llm_chat.py`, `test_llm_ui.py` — LiteLLM and HTTP are
mocked (`monkeypatch` on `reconix.llm.client`), so no test hits the network. An autouse
fixture in `conftest.py` points `llm.config.DB_PATH` / `KEY_FILE` at `tmp_path`. Covers
every PoC success item: set/update/unset, single-model rule, key encrypted at rest,
reachability, the activate guard, mid-task switch (run/findings/decisions unchanged),
history + context preserved, history in the DB, identical system prompt across models,
secret redaction, approvals still need token+hash after a switch, the offline fallback,
and Reconix driven by `.env`.

## Config

`.env.example` documents `RECONIX_LLM_BASE_URL`, `RECONIX_LLM_MODEL` (and optional
`RECONIX_LLM_DB`, `RECONIX_LLM_KEY_FILE`, `RECONIX_LLM_TIMEOUT`, `OLLAMA_BASE_URL`). New
deps: `litellm`, `cryptography`, `python-dotenv`. `reconix.llm` is in
`pyproject.toml` packages.
