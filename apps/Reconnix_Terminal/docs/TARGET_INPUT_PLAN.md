# Plan — validated prompt input, auto template, `/template`

2026-10-05. Follows `REAL_USE_PLAN.md`. No backend, no LLM: rule-based, list-backed.

## Decisions (from the user)

- **Validate what the operator types.** Small talk ("hi", "thanks", "what can you do")
  gets a short answer in the chat and does **not** start a run.
- **Unambiguous targets skip the template pick:** an IPv4 address or range → Network, an
  `http(s)://` URL → Web URL (or API when the path/keywords say so), a git repo URL or a
  local path → Source Code. The **Scope Manifest gate stays**: nothing is tested before the
  operator approves the scope.
- **Source Code needs a local path or a git repo URL**; "review my code" alone is answered
  with what to type.
- **`/scope` becomes `/template`**: pick a template, then type a target that is validated
  for that template. F3 still shows the scope manifest.

## Behaviour

| Typed before a run | Result |
|---|---|
| `hi`, `thanks`, `help`, `what can you do`, anything without a target | simple answer, no run |
| `scan my network` / `test my api` / `review the source code` (no target) | answer naming what to type for that template |
| `10.0.0.300`, `10.0.0.0/40` | refused (toast), text kept to fix |
| `192.0.2.10`, `scan 10.0.0.0/24` | Network, auto → Scope gate |
| `https://shop.example.com`, `Assess https://…` | Web URL, auto → Scope gate |
| `https://api.example.com/v1`, `test the API at …` | API, auto → Scope gate |
| `github.com/acme/app`, `git@…:acme/app.git`, `/home/me/project`, `./app` | Source, auto → Scope gate |
| `shop.example.com` (bare host, no keyword) | ambiguous → Select-a-Template gate (Web URL suggested) |
| empty Enter | the demo request (unchanged) |

During a run, greetings/thanks get a short friendly answer; other text keeps today's reply.

## Data contract (store — the backend seam)

- `store.submit_prompt(text) -> "started" | "answered"` — the dashboard's single entry
  point for a typed line (the LLM backend will own this decision later).
- `store.start_run(text, template_id=None)` — with `template_id`, the target is validated
  for that template and the template is applied at once (no template gate).
- `store.check_target(template_id, text) -> ParsedTarget` — strict per-template
  validation (raises `StoreValidationError` with what that template needs).
- `Template.target_hint` / `Template.example` — the per-template prompt text.
- `Assessment.template_auto` — the template was matched from the target (chat wording).

## Files

- new `store/targets.py` (per-template validators), `store/replies.py` (simple answers)
- `store/parser.py` (`parse_request` → `Optional`, uses `targets`), `store/run.py`,
  `store/templates/{__init__,base}.py` + the 4 `SPEC`s, `store/seed.py`, `store/__init__.py`
- `models/template.py`, `models/assessment.py`
- new `screens/dialogs/target.py` (`TargetDialog`), `commands/builtin.py`, `app.py`,
  `screens/dashboard.py`
- Fix: `/new <target>` crashed (the run started on a dashboard not yet composed). The store
  now starts the run first and the rebuilt dashboard resumes it on mount.
- Tests: `test_targets.py`, `test_replies.py`, `/template` UI tests; update the template-gate
  tests to use an ambiguous request.

## Keys

No new keys. `/template [network|api|source|web_url]` → choice menu (if no argument) →
target dialog (Input; Enter starts, Esc cancels). Safe first focus: the input.
