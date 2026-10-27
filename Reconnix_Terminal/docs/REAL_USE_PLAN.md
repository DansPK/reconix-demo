# Plan — real-use-case data and flow (still list-backed)

Keep the dashboard + dialogs look exactly as it is. Make the flow and data behave
like real use, driven by what the operator types — **no backend, no LLM yet**. Data
stays in the in-memory store (memory only; nothing written to disk).

## Decisions (from the user)

- **Data:** in-memory lists, shaped like real use. No API, no LLM.
- **Templates:** all four work for real — Network, API, Source Code, Web URL.
- **Scope:** Edit Scope really changes the manifest before approval.
- **Assessments:** several can exist in one session (create, list, reopen). Memory only.
- **Target login:** depends on the tool/step — a session **cookie**, **email + password**,
  or a **live OTP** (asked when needed, used once, never stored). Sometimes password + OTP.
- **No operator roles.** One local operator; "login" is logging in to the *target*.
- **Findings:** both **generated per template** (from data lists) and **imported** from
  real tool output files (nuclei / nmap / ZAP).
- **OTP:** asked live each time; never stored.

## What changes vs. today

Today there is one hardcoded scenario (`store/scenario.demo_script()`) and one run
(`lists.RUNS[-1]`, `lists.ASSESSMENTS[-1]`, …). The redesign makes the data per-target
and multi-assessment, but the **UI contract stays the same**: the dashboard hosts a
`RunController` that plays `store.advance()`, and dialogs record decisions. The policy
engine (`store/scope.py`, `store/policy.py`) and the approval rules stay the authority.

## 1. Parse what the operator types (rule-based, `store/parser.py`)

`parse_request(text) -> ParsedTarget` with regex/heuristics, no LLM:

| Input example | kind | target | suggested template |
| --- | --- | --- | --- |
| `https://shop.example.com` | web_url | the URL | Web URL |
| `scan 10.0.0.0/24 for open ports` | network | the host/CIDR | Network |
| `test the API at https://api.example.com/v1` | api | the base URL | API |
| `review repo github.com/acme/app` or a local path | source | repo ref | Source Code |

Ambiguous input → the assistant asks (a short chat line) or the operator picks the
template in the dialog. Each new assessment re-parses; nothing is hardcoded to
`staging.example.com`.

## 2. Templates own their defaults and their run (`store/templates/`)

Each template is a small module with:
- **defaults:** allowed actions, methods, ports, excluded paths, time limit, tools.
- **scope(target):** build the `ScopeManifest` from the parsed target.
- **generate(assessment) -> run script + approvals + findings:** realistic steps and
  numbers derived from the target and per-template **data lists** (not one fixed script).

| Template | Discovery data | Example findings |
| --- | --- | --- |
| Network | ports, services, banners | exposed service, weak TLS, default creds surface |
| API | endpoints, methods, auth scheme | BOLA, missing authz, no rate limiting |
| Source Code | files, deps, secret patterns | hardcoded secret, vulnerable dependency |
| Web URL | pages, forms, cookies, headers | reflected XSS, missing headers, SameSite |

`store/scenario.py` stops being one script; it becomes the shared step builders
(`say`, `log`, `progress`, `gate`, …) that the generators use.

## 3. Scope manifest: generated and editable

- Built by the chosen template from the parsed target.
- **Edit Scope** becomes a real editor dialog: change target(s), allowed methods,
  excluded paths, time limit, and tools before approval. The store validates every
  edit (`store/scope.py`), and the policy engine enforces the edited scope.

## 4. The run is generated, policy still decides

- A per-template generator produces the `RunStep`s: discovery → scanning → (auth when a
  step needs it) → validation (MEDIUM/HIGH approvals) → analysis → complete, with numbers
  from the data lists.
- `store.check_request()` stays the authority; `advance()` and the gates are unchanged.

## 5. Target login adapts to the step (`store/vault.py`, auth dialogs)

A step can raise an **auth challenge** naming what it needs:

| Challenge | Dialog | Stored (memory, `Secret`) |
| --- | --- | --- |
| `cookie` | paste a session cookie | the cookie value |
| `password` | email/username + password | the credentials |
| `otp` | the current 6-digit code | **nothing** — used once |
| `password+otp` | credentials, then the code | only the credentials |

`SecureInputDialog` becomes a small family driven by the challenge's fields. OTP is
never stored, never logged, never in a report. The vault already keeps secrets as
`models.Secret`.

## 6. Multiple assessments (`store/assessment.py`, a new dialog)

- An assessment becomes a self-contained record: its `RunState`, scope, approvals,
  findings, chat and activity. The store holds a **list** of them and a "current" one.
- New dialog (F6 / `/assessments` / `/new <target>`): list assessments with status,
  start a new one, reopen a past one. The dashboard shows the current assessment and
  switches when you reopen another.
- Reports are per assessment. All in memory; closing the app clears everything.

## 7. Import real tool output (`store/importers/`, an Import dialog)

- Parsers for a few formats: **nuclei** JSON lines, **nmap** XML/greppable, **ZAP** JSON.
- An Import dialog (file path) loads a file, parses it into `Finding`s, and adds them to
  the current assessment, marked as imported with the source tool. Malformed files are
  rejected with a clear message; nothing is executed.

## 8. No roles

One local operator stays. No sign-in to Reconix, no role checks. The only "login" is the
target login in §5.

## File structure (added/changed)

```
reconix/store/
├── parser.py              # NEW: parse_request(text) -> ParsedTarget (rule-based)
├── templates/             # NEW: one module per template
│   ├── base.py            #   Template protocol: defaults, scope(), generate()
│   ├── network.py, api.py, source.py, web_url.py
│   └── data.py            #   per-template data lists (ports, endpoints, pages, …)
├── scenario.py            # CHANGED: shared step builders only (no fixed script)
├── assessment.py          # CHANGED: a collection of assessments + current
├── scope.py               # CHANGED: scope edits (validated); policy unchanged
├── vault.py               # CHANGED: cookie / password / otp challenges
├── importers/             # NEW: nuclei.py, nmap.py, zap.py + detect()
└── run.py, seed.py        # CHANGED: run keyed to the current assessment; sample seed

reconix/models/            # + ParsedTarget, AuthChallenge, import source on Finding;
                           #   Assessment gains its own run/scope/findings refs
reconix/screens/dialogs/   # + assessments.py, import.py, scope_edit.py;
                           #   secure_input.py becomes challenge-driven
reconix/screens/dashboard.py  # + F6 assessments, current-assessment switching
```

## Build order (each step keeps the app running and `pytest` green)

1. **Parser + template defaults/scope** for all 4, with the generator for Web URL first
   (parity with today). Tests: parsing, each template's scope.
2. **Per-template generators** for Network, API, Source Code, from data lists. Tests:
   each produces a valid run, findings, approvals; policy still blocks out-of-scope.
3. **Editable scope** dialog + store edits. Tests: edits validated and enforced.
4. **Auth challenges** (cookie / password / otp / password+otp) + dialogs. Tests: OTP
   never stored; each challenge saves the right thing.
5. **Multiple assessments** store + dialog. Tests: create/list/reopen, isolation between
   assessments.
6. **Import** parsers + dialog. Tests: each format parses; malformed input rejected.
7. **Clean-up:** README, CLAUDE.md, skills/agents; then `security-reviewer` and
   `code-reviewer`.

## Status (built 2026-10-04)

All seven steps are done and the suite is green. Decisions settled during the build:

- **Data scale:** small and realistic (~3 findings, 2 approvals, a card or two per run).
- **Login kinds, by template:** Web URL = email + password + one-time code; API = session
  cookie; Network and Source = none. The one-time code is validated and never stored.
- **Policy per scope kind:** web/api = HTTP path + host + method; network = host + port
  (via `allowed_ports`); source = repo path under excluded entries.
- **Assessments:** created, listed and reopened in one session (F6 / `/assessments`),
  memory-only.
- **Import:** nuclei (JSONL), nmap (XML), ZAP (JSON); findings get an `IMP-` id, show at
  once, evidence masked. Files are read, never executed.
- **No operator roles**, per the user: the only login is the target login.
