# Plan — "Edit params" on gated actions, in every template

2026-10-09. Classic UI. Changes the store (the backend seam), the Approval and Plan screens,
one new form, the templates' approval data, tests and docs.

## Decision (from the user)

The Approval screen's **Edit params** (and the Plan's **Edit steps**) were always disabled.
They now work for the gated actions of all four templates.

## What can be edited

One parameter per gated action: **where it runs**. Nothing that changes what kind of action
it is, so the risk the AI and policy assigned stays true.

| Template | Parameter | Example | Rebuilt from it |
|---|---|---|---|
| Web URL | Path | `/api/orders/10483` | target, command (`GET <url><path> as test account A`) |
| API | Path | `/v1/orders/8843` | target, command |
| Network | Host:port | `10.0.0.1:8443` | target, command (`connect <host:port> …`) |
| Source | File | `app/config/settings.py` | target, command |

Not editable: risk, method, action, purpose, impact. The source HIGH action now names the
file that holds the flagged credential (`app/config/settings.py`), so its parameter means
something; its command includes it.

## Store (`store/approvals.py`)

`edit_approval(request_id, value) -> ApprovalRequest`, the only way to change a request:

- Allowed only while the action is **undecided** and the run waits **at the plan gate** or
  **at this action's approval gate**. Anything else raises `StoreValidationError`.
- The value is trimmed, 1–200 characters, no whitespace or control characters. A network
  value needs a port (`host:port`).
- The **policy engine decides** (`scope.policy_reason`, the same check as `check_request`
  without recording a verdict, so a typo isn't counted as a blocked request). Blocked →
  refused, nothing changes, `approval.edit_refused` is audited.
- On success: `path`, `target` and `command` are rebuilt from the request's patterns,
  `command_hash` is recomputed, open HIGH confirmation tokens for it are voided, and the
  edit is logged (`approval.edited`, old → new) and shown in the activity log.
- Unchanged: risk, and every gate. The gate's own policy check, `approve()`'s hash check,
  policy re-check and HIGH token all apply to the edited request. An approval made for the
  old command hash is refused ("for a different request").

## Model and templates

`ApprovalRequest` gains `param_label` ("Path", "Host:port", "File"; "" = not editable),
`target_pattern` and `command_pattern`, where `{path}` stands for the value. These fields
stay in the store: the saved copy and reports keep exporting the same fields, so
`web/src/lib/data/schema.ts` doesn't change. `templates/base.approval()` takes `param=` and
builds target/command from the patterns. All four templates set it on both actions.
`network.align_to_scope` keeps rebuilding its approvals at scope approval (before any edit).

## UI

- `screens/forms/approval_edit.py`: `ApprovalEditForm(FormScreen)`: one field (the
  parameter), a note with the action, its risk ("stays HIGH: you still double-check") and
  the current command. Submit calls `store.edit_approval`; a refusal stays in the form.
- Approval screen: "Edit params" is enabled when the action has a parameter. The app opens
  the form (`app.edit_approval`, `shell/actions.py`, via `open_dialog`). `view_state`
  includes the command hash, so the screen rebuilds with the new request; "View details"
  stays the default choice.
- Plan screen: "Edit steps" is enabled when an undecided action has a parameter. It asks
  which step (a `ChoiceScreen`), then opens the same form. The plan rows read the requests
  live, so they show the new command.

## Tests

- Store, for all four templates: a valid edit rebuilds path/target/command/hash; approve with
  the new hash works, the old hash is refused; an out-of-scope value is refused per template
  and records no verdict; bad values; wrong moment (scope gate, testing, decided); plan-gate
  edit; HIGH token voided by an edit; audit events.
- UI: Edit params opens the form and the screen shows the new command; a refused value
  keeps the form open with the error; Edit steps → choose step → form.

## Verification

`pytest -q`, ruff (no new errors), `compileall`, `scripts/make_sample_data.py` (source
HIGH changes), web `npm test` + typecheck. Security review of the store change.
