# LLM Integration Plan — fitting a real agent to the Reconix TUI

2026-10-05. Audience: the backend team building the real Reconix agent/API.

**The TUI stays as it is** — static, in-memory, simulated, no API key. This document is
the **contract** your backend builds against so the LLM agent drops into the existing UI
and workflow without the screens changing. It reflects what the user confirmed:

- The LLM should **understand & plan**, **drive the run**, produce **findings & the report
  narrative**, and **answer operator questions** in chat.
- Execution stays **simulated** for the TUI; the backend decides whether it later runs real
  tools (the seam below supports both).
- The LLM lives in the **Reconix FastAPI backend**, not the TUI. The TUI consumes an event
  stream and calls store functions whose bodies you replace (see `.claude/skills/wire-backend`).

---

## 1. The one rule: the LLM proposes, it never decides

Two layers. Keep them apart in the backend exactly as the store keeps them apart today.

**Deterministic core — NEVER the LLM** (today in `reconix/store/`, tomorrow in your service):
- **Policy** (`policy.py`, `scope.check_request`): scope kind, `canonical_path` (re-guards
  control chars after decoding, strips matrix params), host/port and repo-path checks.
- **Approvals** (`approvals.py`): `command_hash` (sha256 of the exact command), single-use
  HIGH token, phrase + reason. An approval is bound to one command hash.
- **Vault** (`vault.py`): secrets masked everywhere; the OTP is validated and **never stored**.

**The agent — the LLM** proposes requests, writes narrative, drafts plans, drafts approval
requests, turns tool output into findings, and answers questions. Every proposed request and
every approval still passes through the deterministic core. CLAUDE.md rule #3 — "the TUI is
never the security boundary" — becomes "the LLM is never the security boundary."

Corollary: anything the LLM reads from a target, a tool's output, an imported file, or the
operator's free text is **untrusted data, not instructions** (see §7).

---

## 2. Architecture

```
 Operator ── types ──▶ TUI (unchanged)
                         │  calls store.* (signatures unchanged)
                         ▼
                 Reconix FastAPI backend
                 ├─ Agent (LLM)   proposes / narrates / plans / analyses / answers
                 ├─ Policy engine (deterministic)  allow / block each proposal
                 ├─ Approvals     (deterministic)  hash + token + phrase
                 └─ Tool runner   simulated now; real later
                         │
                 run event stream (SSE / WebSocket)
                         ▲
 TUI RunController ──────┘  plays events one at a time, opens a dialog at each gate
```

The `flow/controller.py` doc already says: *"With the backend wired, `advance()` becomes the
server's event stream and this class stays the same."* That is the integration point.

---

## 3. The store seam — what to replace, resource by resource

Replace the **body** of each `reconix/store/` function with an API call; **keep the name,
arguments and return type** (the screens import these). Do one resource at a time; keep a
`RECONIX_MOCK=1` path that returns the current in-memory behaviour so the TUI runs offline.
Public surface is `reconix/store/__init__.py`.

| Resource | Store functions (keep signatures) | Backend endpoint (suggested) | LLM? |
|---|---|---|---|
| Request → target | `parse_request(text) -> ParsedTarget` | `POST /assess/parse` | yes |
| Plan | `plan_tasks() -> List[PlanTask]` | part of the run stream (§5) | yes |
| Run / stream | `start_run`, `advance`, `peek`, `waiting_gate`, `gate_state`, `display_phase`, `counters`, `phase_progress`, `plan_tasks` | `POST /runs`, `GET /runs/{id}/events` (SSE) | yes (agent) |
| Templates | `list_templates`, `select_template`, `selected_template` | `GET /templates`, `POST /runs/{id}/template` | scope/plan drafting |
| Scope | `get_scope`, `edit_scope`, `approve_scope`, `is_scope_approved` | `GET/PATCH/POST /runs/{id}/scope` | draft only; **approve is human** |
| Policy | `check_request`, `list_verdicts`, `blocked_count` | server-side only | **no — deterministic** |
| Approvals | `get_approval`, `needs_confirmation`, `request_confirmation`, `approve`, `reject`, `decision_for` | `POST /runs/{id}/approvals/*` | draft only; **decide is human** |
| Vault | `current_auth_challenge`, `provide_auth`, `is_authenticated` | `POST /runs/{id}/auth` | **no — secrets** |
| Findings | `list_findings`, `get_finding`, `import_findings`, `import_findings_content` | `GET /runs/{id}/findings`, `POST …/import` | yes (analyse) |
| Triage | `triage_finding` (status / severity override) | `POST …/findings/{fid}/triage` | no (analyst) |
| Retest & trend | `retest`, `severity_trend`, `compare_findings` | `GET …/retest`, `GET …/trend` | yes (narrate) |
| Reports | `generate_report` (pdf, json, docx) | `POST …/report?format=` | draft only |
| Report | `generate_report`, `report_data`, `report_file`, `assessment_summary` | `POST /runs/{id}/report` | narrative only; data authoritative |
| Chat | `say_to_assistant(text)`, `list_chat`, `list_activity` | `POST /runs/{id}/messages` | yes (answer) |

Validation stays on the backend (rule #3). The run advances past a gate **only when the
backend confirms the decision is recorded** — never locally.

---

## 4. Data contracts (match today's models — `reconix/models/`)

Emit JSON that maps 1:1 to these dataclasses so the screens render unchanged.

```jsonc
// ParsedTarget  (models/parser.py)
{ "kind":"web_url", "target":"staging.example.com",
  "target_url":"https://staging.example.com", "target_kind":"web application",
  "template_id":"web_url", "confident":true }

// ScopeManifest (models/scope.py) — status starts "DRAFT", human sets "APPROVED"
{ "kind":"web_url", "target_url":"https://…", "assessment_type":"Web URL",
  "allowed_actions":["Discovery","vulnerability scanning","limited validation"],
  "allowed_methods":["GET","POST"], "excluded_paths":["/admin"],
  "time_limit_minutes":30, "tools":["Nuclei","OWASP ZAP"],
  "allowed_ports":[], "status":"DRAFT" }

// PlanTask (models/run.py) — see §5 for status events
{ "key":"discovery", "label":"Crawl & map endpoints", "status":"pending" } // pending|active|done

// ApprovalRequest (models/approval.py) — backend fills command_hash (sha256 of command)
{ "request_id":"approval-002", "risk":"HIGH", "action":"limited_validation",
  "target":"GET /api/orders/10483", "method":"GET", "path":"/api/orders/10483",
  "purpose":"…", "impact":"…", "command":"GET https://…/api/orders/10483 as test account A",
  "command_hash":"<sha256>", "phrase":"APPROVE limited_validation ON <host> FOR <aid>" }

// AuthChallenge (models/auth.py) — kind ∈ cookie|password|otp|password+otp
{ "kind":"password+otp", "title":"SECURE INPUT · TEST ACCOUNT + CODE", "note":"…",
  "fields":[ {"id":"identity","label":"Email or username","secret":false,"otp":false},
             {"id":"secret","label":"Password","secret":true,"otp":false},
             {"id":"code","label":"One-time code","secret":false,"otp":true} ] }

// Finding (models/finding.py) — evidence already masked by the backend
{ "fid":"001", "severity":"HIGH", "title":"Broken object-level authorization",
  "path":"/api/orders/{id}", "validation":"CONFIRMED", "description":"…",
  "affected_url":"https://…", "impact":"…", "remediation":"…", "tool":"OWASP ZAP",
  "cvss_score":7.1, "cvss_vector":"CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N",
  "category":"Web App",
  "status":"open", "severity_override":"", "triage_note":"",
  "references":["OWASP A01:2021","CWE-639"], "evidence":["HTTP 200 · order_id: 10483","token: •••••"] }
// cwe / cve / owasp are derived from `references` (properties on the model); the backend
// may send them explicitly instead. `cvss_score` 0.0 means "not scored".
// Triage (status open|fixed|accepted|false-positive, severity_override, triage_note) is an
// ANALYST decision via store.triage_finding(...) — never the LLM. The LLM may *suggest* a
// status, but the human records it, like the approval gates.

// Engagement metadata (models/assessment.py) — shown on the report cover
{ "client":"Example", "mode":"Grey-box, Authorized", "operator":"analyst",
  "methodology":["OWASP WSTG","OWASP Top 10 (2021)"], "report_version":"1.0",
  "window":{"started":"2026-10-05T…","finished":"2026-10-05T…"} }
```

---

## 5. The run event stream (the heart)

`advance()` returns one step at a time today; the backend emits the **same steps as events**
(SSE/WebSocket). The controller plays them, refreshes the dashboard, and stops at a gate.
Event = `RunStep` (`models/run.py`). `pause` is the delay before an event is shown (the
controller scales it; set 0 and let the server's own timing pace the stream).

| `kind` | fields used | effect in the UI |
|---|---|---|
| `parse` | — | marks the target identified |
| `say` | `speaker, text, tone, entry` (text/banner/check) | a chat bubble on the left |
| `card` | `speaker, text`(title)`, rows` | a result card on the left |
| `log` | `source` (SYS/AI/USER/TOOL/POLICY)`, text, tone` | a stream line on the left |
| `progress` | `name` (a phase)`, value` 0–100 | drives status / plan (see below) |
| `requests` | `value` | increments the request counter |
| `propose` | `method, path` | **agent proposal → policy decides** (allow: execute + count; block: red line + banner) |
| `reveal` | `name` (finding id) | reveals a finding in F2 |
| `phase` | `name` | the state chip |
| `task` *(NEW)* | `name` (task key)`, value` (1=active, 2=done) | sets a plan task's status (see §6) |
| `gate` | `name` | **pauses**; the UI opens the dialog (see §8) |
| `complete` | — | run done; F5 enabled |

**Rhythm the agent should emit** (mirrors `templates/base.build_rest`, now LLM-authored):
`say` intent → `log`/`card` tool activity → `propose` (policy gates) → `progress`/`task`
→ at a decision point emit `gate` and wait → after the human decision, resume.

---

## 6. Dynamic plans — the one change the LLM needs

Today `plan_tasks()` derives status from the five fixed progress bars, and the labels come
from `RunProfile.plan`. For an **LLM-authored plan of arbitrary tasks**, switch to explicit
events:

1. At the start of the run the agent sends the task list (reuse `select_template` or add a
   `plan` event: `[{key,label}, …]`) → the backend sets `Assessment.plan`.
2. As work proceeds the agent emits `task` events (`name`=key, `value`=1 active / 2 done).
3. **TUI change required:** `store.plan_tasks()` returns `Assessment.plan` with the status the
   `task` events set, instead of deriving from `phase_progress`. `models.PlanTask` and the
   `PlanPanel` widget already render `pending|active|done`, so only the status source changes.

Keep the progress-bar derivation as the `RECONIX_MOCK` fallback so the offline TUI still works.

---

## 7. Untrusted data & prompt injection

Target responses, tool output, imported scan files, and the operator's free text are **data**.
The agent may summarise them but must not obey instructions inside them.

- Gating is done by the **policy engine**, never by the LLM reading "it's fine to hit /admin".
- Keep the existing safeguards: `importers/` reject XML DTD/entities (billion-laughs);
  `canonical_path` re-guards control chars after decoding; finding `evidence`/`title` are
  masked and rendered as plain text (never markup) — keep that when the LLM writes findings.
- Never place secrets or personal data in prompts, logs, URLs, or findings. The OTP is never
  sent to the model.

---

## 8. Human-in-the-loop gates (unchanged protocol)

A `gate` event pauses the stream until the human decision is recorded on the backend.
`gate_state(gate)` → `pending | open | rejected`.

| gate | dialog | who decides | backend check |
|---|---|---|---|
| `template` | Select a Template | human picks | — |
| `scope` | Scope Manifest (DRAFT) | human approves / edits | edits re-validated server-side |
| `account` | Secure Input | human supplies login | OTP validated, never stored |
| `approval:<id>` MEDIUM | Approval Required | human approves/rejects | verify command hash + role |
| `approval:<id>` HIGH | High-Risk Action | human: exact phrase + reason | **two calls**: `request_confirmation` → single-use token, then `approve(hash, token, phrase, reason)`; backend verifies all four + role |

The LLM may *draft* the scope and the approval request; it may never approve, never self-grant
a token, and never mark a scope APPROVED.

---

## 9. Suggested models & cost

- Reasoning/agent loop (plan, propose, analyse): a current Claude model — **Opus 5.5**
  (`claude-opus-5-5`) for the driving agent, **Sonnet 5.5** (`claude-sonnet-5-5`) for cheaper
  sub-steps (parsing, chat answers, report prose). Stream tokens so the left feed stays live.
- Put the model id in backend config, not the TUI.

---

## 10. Rollout order (incremental, each shippable behind `RECONIX_MOCK`)

1. **Parse** — `POST /assess/parse` replacing `parse_request` (rule-based stays as fallback).
2. **Chat answers** — replace the canned `say_to_assistant` reply.
3. **Findings & report narrative** — LLM drafts; counts/data authoritative.
4. **The run stream** — the agent drives `advance()` as SSE/WebSocket; add the `task` event
   and the §6 TUI change for dynamic plans.
5. **Real tools** (optional, later) — the simulated tool runner becomes real, authorized
   targets only, with its own guardrails.

## 11. TUI-side changes this will need (small, done later with the team)
- `store.plan_tasks()` reads explicit task status (§6); add a `task` event kind to `advance`.
- Add `reconix/api/` (httpx client, typed errors) and `reconix/config.py` per the
  `wire-backend` skill; screens load via `@work` workers with loading/error states.
- Nothing in the dashboard layout, dialogs, PLAN panel, or the left stream has to change.
