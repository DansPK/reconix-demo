# Classic UI + version-1 process — plan

Branch `classic-ui`, started from `53ac746` (the original 8-screen flow). `main`
(`098bd0f` "version 1") is untouched.

**Goal:** keep the 53ac746 UI/UX — full-screen flow, Claude-Code-style questions,
←/→ and 1–8 navigation, `/` commands — and run version 1's real process behind it.
`/scope` becomes `/template`, `/web` opens the web dashboard, and the `web/` dashboard
comes along.

Decisions (asked 2026-10-06):

| Question | Answer |
|---|---|
| Git | new branch `classic-ui` from 53ac746 |
| Process to bring | everything: core flow, target login, assessments + import, triage + exports |
| `/template` | the **Template screen replaces the Scope screen** (flow step 2) |
| `/web` | bring the whole `web/` dashboard; `/web` + the Report screen's button open it |

## 1. What moves where

| Layer | Source | Notes |
|---|---|---|
| `reconix/models/` | v1 (whole) | + `Choice.kind` from v0 (the "Type something." row), + `PlanRow` |
| `reconix/store/` | v1 (whole) | + the additions in §3 |
| `reconix/flow/` | v1 `controller.py`, `phases.py` | + `gates.py` (which screen handles a gate) |
| `reconix/theme.py` | v1 | + v0's `RISK` / `STATUS` maps the classic screens use |
| `reconix/screens/` | v0 | rebuilt on the v1 store; `scope.py` → `template.py`; new `forms/` |
| `reconix/widgets/` | v0 | + v1 `secret_input.py` |
| `reconix/commands/` | v0 registry + merged command list | |
| `web/`, `scripts/` | v1 (whole) | sample-data script decides the new plan gate |
| tests | v1 store tests (kept) + new classic-UI tests | v1 dashboard/dialog tests dropped |

## 2. The flow, screen by screen

The process (v1) is a run of scripted steps that stops at **gates** until a human
decides. The run controller lives on the app (not on one screen), so the run keeps
playing while you browse; when it stops at a gate the app opens that gate's screen.

```
Start ──► Template ──► Plan ──► Execution ⇄ Approval ──► Findings ─► Detail ──► Report
 type a    template     run      live log,   MEDIUM /      filter,     evidence,  export,
 target    + target +   plan     login form  HIGH gates    sort,       triage     /web
           scope gate   gate     (modal)                   triage
```

| # | Screen | Gate(s) it decides | Content (v0 look, v1 data) |
|---|---|---|---|
| 1 | Start | — | logo, quickstart, prompt. A target starts the run (parser picks the template); other text gets the rule-based reply under the quickstart; Enter on empty = demo request |
| 2 | **Template** | `template`, `scope` | pick one of 4 templates → type its target → the drafted **scope manifest** (JSON look) → Approve / Edit manifest (form) / Reject |
| 3 | Plan | **`plan` (new)** | the template's plan: phases + the gated actions with exact commands and risk → "Run plan" |
| 4 | Approval | `approval:<id>` | MEDIUM: Approve & run / Reject. HIGH: a double check (second confirmation; no reason, see `LOGIN_AND_HIGH_RISK_PLAN.md`). Opens mid-run when the run reaches the action |
| 5 | Execution | `account`, `code` (modals) | plan tasks with live status, a spinner (no %), live log (chat + activity merged; see `LIVE_OUTPUT_PLAN.md`), ^C stop |
| 6 | Findings | — | severity strip, filter / sort, table; `t` triage, `i` import |
| 7 | Detail | — | evidence + analysis panels (CVSS, CWE/OWASP, remediation); `t` triage, `[`/`]` prev/next |
| 8 | Report | — | executive summary, severity bars, key findings, changes since last run; export PDF / JSON / DOCX (`p` / `j` / `w`); **Web dashboard** button |

Approvals happen while the run is executing (that is how the v1 process works), so the
flow line shows Approval before Execution but you visit it from Execution when the run
pauses there. Execution can only be entered after the plan has been run (replaces v0's
"only after approval" hard gate).

## 3. Store additions (validated in the store, not the UI)

- **Plan gate**: `GATE_PLAN = "plan"` after the scope gate in `templates/base.build_rest`.
  `run_plan()` (only while waiting there), `is_plan_started()`. Phase `plan_pending`;
  snapshot reports it as waiting for "plan review".
- `stop_run()` — operator stop (^C on Execution), recorded like any other stop.
- `reject_scope()` — Reject on the Template screen stops that assessment ("Scope rejected.
  Nothing was tested."); the app then opens a fresh one.
- `plan_overview()` → `List[PlanRow]` — the Plan screen's rows (phase rows + gated actions).
- Findings view: `FINDING_FILTERS`, `FINDING_SORTS`, `find_findings()`, `filter_counts()`,
  `severity_counts()`, `key_findings()` ported from v0 onto the v1 `Finding`.
- `step_states()` — ✓ / ● / ✕ per flow step, derived from the run (drives the flow line).
- Wording: replies and steps that name dashboard keys (F2–F5, "empty prompt") point to the
  classic keys and commands instead.

## 4. Reusable pieces

- `screens/forms/base.py` `FormScreen` — one modal for labeled inputs + error line +
  submit/cancel, styled like `ChoiceScreen`. Used by `LoginForm` (target login, secrets
  masked and cleared on close, OTP never stored), `ScopeEditForm`, `ImportForm`.
- `screens/choice.py` `ChoiceScreen` + `details_body` (v0) for every pick/confirm/details
  modal: assessments list, triage, export formats, audit trail, summary.
- `flow/gates.py` — gate → screen mapping; `browser.py` — open a URL / file detached.

## 5. Commands

`/help` `/new [target]` `/template [id]` `/plan` `/approval` `/status` `/findings`
`/finding <id>` `/report` `/export <fmt>` `/audit` (activity, log) `/assessments` (list)
`/import` `/summary` `/web` (dashboard) `/quit`. `/scope` is gone. Number keys: 2 = Template.

## 6. Steps

1. Bring v1 models/store/flow/theme/web/scripts; remove v0-only store/model files.
2. Store additions (§3) + their tests; port v1 store tests, updated for the plan gate.
3. App: controller host, gate routing, deferral while a modal is open, autosave, `/web`.
4. Screens: Start, Template, Plan, Approval, Execution, Findings, Detail, Report; forms.
5. Commands + help.
6. Classic-UI tests (navigation, each gate through the UI, findings, report export, commands).
7. Verify: pytest, web tests, rendered screenshots of every screen; update CLAUDE.md/README.

## 7. Status (2026-10-06)

Built on `classic-ui`. 366 Python tests (v1's store tests kept, updated for the plan gate,
plus classic-UI tests) and the web's 60 tests pass; every screen was checked rendered.

Decisions made while building:

- **Approvals happen mid-run.** The run pauses at each gated action and the app opens the
  Approval screen; Esc decides later (the run stays paused). The Approval menu highlights
  "View details" first, so an Enter pressed as the screen appears never approves.
- **←/→ step over Execution** until the plan has run (the screen would only refuse).
- **`v` (validate PoC) became `t` (triage)**: validation now happens inside the run, behind
  your approval; analysts set a finding's status afterwards.
- **Reject on the scope** stops that assessment (kept under `/assessments`) and opens a fresh one.
- **The app opens its dialogs with `open_dialog()`** (from its own message loop): Textual
  returns a dialog's result to whatever pushed it, and flow screens are replaced as the run
  moves on.
- `scripts/make_sample_data.py` decides the plan gate, and no longer passes the removed
  `phrase=` to `store.approve()` (it crashed on version 1); `web/sample-data` regenerated.
