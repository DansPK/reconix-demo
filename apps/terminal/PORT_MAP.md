# PORT_MAP — porting the real `apps/tui` + `apps/web` into the static demo

Source (read-only): `_real-reference/reconix-core-backend/apps/{tui,web}`. Target: `apps/terminal/`.
Deltas are counted as changed lines from `diff real demo`; "NEW" files exist only in the real repo.

**Hard rules for every chunk:** static demo only. Don't bring in `core_api/`, `llm/`,
`store/live.py`, `store/llm_chat.py`, auth (`lib/auth`, `/login`, `/api/session`, `proxy.ts`) or
real network calls. Chat stays canned (`store/replies.py`), and the provider store stays static.
Keep the demo **data** (Lumina, the Sophea + Visa ****5466 row, MD5 ↔ cracked password,
`evidence_unmasked` + the `u` / "Reveal attacker's view" toggle). Never show the word "demo" to the
audience: the real code uses `"demo data"` / `"not in demo"`, and the demo keeps `"in-memory"` /
`"not available"`. Colors come only from tokens.

## 0. Foundation: done in this worktree (don't redo)

| File | What changed |
| --- | --- |
| `reconix/theme.py` | Taken from the real repo: `NONE`/`UNKNOWN` severities, the `skipped` step state, and the triage labels "Accepted risk" / "False positive" |
| `reconix/wording.py` | NEW: `counted()` and `clock()` (used by the real approval, execution, findings_list and dialogs) |
| `reconix/widgets/chrome.py` | SessionBar uses the real priority/short-form layout. FlowProgress keeps the demo's `PASSED_IS_DONE` and "Target" label |
| `reconix/widgets/choice_menu.py`, `question.py`, `models/choice.py` | Real ChoiceMenu: danger choices get no number, `ARM_DELAY`, `inline` / `type_out` / `TypedOut`, hint wrapping, `Choice.reason` |
| `reconix/widgets/findings.py` | `mask()` and `for_display()` (display-only redaction) |
| `reconix/widgets/spinner.py` | `duration_text()` |
| `reconix/widgets/__init__.py` | exports `duration_text` |
| `reconix/reconix.tcss` | chrome/base: `#prompt-hint.-message`, the SuggestionMenu popup box, `RichLog, RunLog`, `.form-body`, `#form-more` |
| `web/src/components/ui/use-modal-dialog.ts` | NEW (needed by knowledge upload and the assistant's switch dialog) |
| `web/src/styles/ui.css`, `motion.css` | `.ui-dialog*` and `.dash-content[data-under-assistant]` |
| `tests/conftest.py`, `tests/support.py` | `ARM_DELAY = 0`, plus `choose_by_keys()` for danger choices (Reject is no longer on a digit) |

These needed no change:
- `tokens.css`: `WEB_TOKENS` are the same, and regenerating it gave an identical file.
- `globals.css`: same import order.
- `components/ui/*` (except the new hook): already identical.
- `schema.ts` / `snapshot.py`: the demo is a superset (it adds `evidence_unmasked`).
- `scripts/*`: the demo's scripts differ only in paths and realistic data. Keep them.
  `export_commands.py` gets `stop` / `tests` only if a chunk below adds those commands.

## 1. Single-owner files: keep these out of the fan-out

Each of these files is touched by several chunks. Give each one to a single integrator: either the
coordinator after the fan-out, or the chunk named here.

| File | Why it's shared | Owner |
| --- | --- | --- |
| `reconix/reconix.tcss` | every screen's rules live in one file | **Each chunk writes its tcss rules to `PORT_NOTES/<chunk>.tcss`; the integrator merges them** |
| `reconix/widgets/__init__.py` | every new widget is exported here | integrator. Chunks import from the module directly (`from ..widgets.step_chat import StepChat`) |
| `reconix/screens/__init__.py`, `screens/forms/__init__.py` | screen registry | integrator |
| `reconix/store/__init__.py` | the public store API | **T1** (flow core). Other chunks that need a new store function ask T1 or import the submodule |
| `reconix/screens/base.py` | every screen's base (in-step chat, decisions) | **T1** |
| `reconix/app.py`, `shell/navigation.py`, `shell/run_host.py`, `shell/actions.py` | app wiring | **T1** |
| `reconix/commands/builtin.py` + `scripts/export_commands.py` + `web/src/content/docs/commands.json` | command list | **T6** (help/commands) |
| `web/src/styles/dashboard.css` | Overview, viewer and sidebar all share it | **W1** |
| `web/src/lib/data/*` (`adapt.ts`, `view-types.ts`, `store.ts`, `schema.ts`) | every view reads them | **W1** |
| `web/src/components/dashboard/viewer.tsx`, `view-url.ts`, `sidebar.tsx`, `view-header.tsx` | the page frame | **W1** |
| `tests/conftest.py`, `tests/support.py` | every test | integrator (chunks append new helpers to `PORT_NOTES/<chunk>-support.py`) |

## 2. TUI chunks

Complexity: **simple** means a mechanical port (give it to Sonnet). **complex** means flow,
approval, execution or the run controller (give it to Opus).

### T1: flow core: in-step chat, plan order, base screen (complex, Opus). Must land first.
- `screens/base.py` (Δ503): the real one adds in-step chat (`StepChat`), `Decision`,
  `focus_menu`, the tick-list and plan-order handlers, and the scope/plan cards. **Adapt**: the
  in-step chat answers from `store/replies.py` (canned), never `llm_chat` / `ai_plan`.
  Keep `.feedback-echo` (used by the demo's base) until this lands.
- `widgets/step_chat.py`, `tick_list.py`, `plan_order.py` (NEW): **port**. `THINKING` comes from
  `store/thinking.py`. Port `thinking.py` too, as a static, scripted thinking text.
- `store/plan_order.py` (NEW): **port**. It is pure ordering logic.
- `app.py` (Δ98), `flow/controller.py` (Δ9), `shell/navigation.py` (Δ97),
  `shell/run_host.py` (Δ133), `shell/actions.py` (Δ217): **adapt**. Drop `from ..llm`,
  `scope_suggest` and the live run. Keep the scripted `RunController`.
- `store/__init__.py`: the exports for the above.
- tcss: `.step-chat`, `.chat-line`, `.chat-bar`, `.tick-list`.

### T2: Template (scope) screen (complex, Opus). After T1.
- `screens/template.py` (Δ337), `widgets/manifest.py` (Δ81, adds `ScopePanel`).
- **Adapt**: `scope_suggest` / `scope_ask` are LLM-backed in the real repo. Use static
  suggestions from the template module, or leave them out.

### T3: Plan screen (complex, Opus). After T1.
- `screens/plan.py` (Δ246), `widgets/plan_rows.py` (NEW, `PlanPanel`).
- **Port** the layout. `ai_plan.py` is out: the plan stays the scripted one.

### T4: Approval and typed-target (complex, Opus). After T1.
- `screens/approval.py` (Δ107), `screens/forms/typed_target.py` (NEW), `screens/forms/approval_edit.py` (Δ13).
- **Port**. Keep the two-step HIGH gate (token + command hash). tcss: `ApprovalScreen .menu-hint`.

### T5: Execution, run log, thinking (complex, Opus). After T1.
- `screens/execution.py` (Δ124), `widgets/run_log.py` (Δ179), `widgets/log_rows.py` (NEW),
  `widgets/thinking_block.py` (NEW).
- **Adapt**: the thinking text comes from scripted steps, not a model.
- tcss: `.message-line`, `.thinking*`.

### T6: Help, command bar, commands (simple, Sonnet)
- `screens/help.py` (Δ103), `screens/command_bar.py` (Δ32), `commands/builtin.py`,
  `commands/registry.py`, `commands/__init__.py`, then rerun `scripts/export_commands.py`.
- Add `/stop` only if T1 adds `store.stop_run` wiring. **Preserve-as-demo**: no `/tests` unless T9 lands.
- tcss: `#help-box` (width 96%, max 104), `.help-row`, `.help-keys`, `.help-desc`.

### T7: Findings list and detail (simple, Sonnet)
- `screens/findings_list.py` (Δ130), `screens/finding_detail.py` (Δ70). Use
  `widgets.findings.for_display` (already ported) and `wording.counted`.
- **Preserve-as-demo**: the detail screen's `u` toggle and `evidence_unmasked` (the real repo has neither).

### T8: Start, report, choice dialog, prompt (simple, Sonnet)
- `screens/start.py` (Δ80), `screens/report.py` (Δ82), `screens/choice.py` (Δ44),
  `widgets/prompt.py` (Δ66, the `-message` hint class: its tcss is already in).
- `shell/dialogs.py` (Δ72): drop the `test_guide` parts. `shell/web.py` (Δ23).

### T9: forms (simple, Sonnet)
- `screens/forms/base.py` (Δ112: `.form-body` scroller and `#form-more`; the tcss is already in),
  `forms/scope_edit.py` (Δ12), `forms/openapi_spec.py` (Δ4).
- `screens/test_guide.py`, `forms/test_note.py` and `store/test_guide/` are the real repo's QA
  checklist. **Skip it**: it isn't audience-facing.

### T10: providers / knowledge shell (simple, Sonnet)
- `shell/llm.py` (Δ137): **adapt** only the UI wording and menus. It must stay the static
  `store/providers.py`, with no `core_api` or `llm/`.
- `shell/knowledge.py` (Δ18): **port**.

### Store modules: leave them alone unless a chunk above needs one
- Out (live): `core_api/`, `llm/`, `store/{live,llm_chat,ai_plan,kali_catalog,known_secrets,
  confirm_check,step_intent,step_text,scope_ask,scope_suggest}.py`, `models/live.py`,
  `templates/techniques.py`.
- The many small `store/*.py` and `models/*.py` deltas are mostly live-engine plumbing. Port a
  piece only if a screen chunk needs it, and do it in that chunk (T1 owns `store/__init__.py`).
- `store/redact.py`: the real one adds `known_secrets`, ANSI and escape handling. It's optional
  hardening; if ported, also update `web/src/lib/assistant/redact.ts` and the shared vectors.

## 3. Web chunks

The real web delta is mostly **live-only**. These are out, never ported:
- the model picker (`components/assistant/model-*`, `switch-*`, `use-models`, `use-switch-ask`,
  `lib/assistant/{config,llm}.ts`, `lib/assistant/models/*`, `/api/assistant/models/*`)
- auth (`lib/auth/*`, `app/login`, `/api/session`, `proxy.ts`)
- knowledge writes (`lib/knowledge/{cli,commands,gate,upload,original,access,limits}.ts`,
  `/api/knowledge/[id]*`, `upload-dialog.tsx`, `file-actions.tsx`)
- `/api/reports/combined`

Keep the demo-only `lib/data/export.ts` and `lib/report/fonts.ts`.

### W1: frame and Overview (simple, Sonnet). Owns the shared frame.
- `app/page.tsx` (Δ17), `components/dashboard/{viewer,view-url,view-header,sidebar,intro,
  dash-card,summary-strip,activity-timeline,execution-timeline,findings-card,live-refresh,
  empty-view,stat-types,derive-shared,run-cells}.tsx/ts`, `dash-card-help.tsx` (NEW),
  `lib/data/{adapt,view-types,store}.ts`, `styles/dashboard.css` (Δ76).
- **Adapt** `intro.tsx` (Δ43): no sign-in.

### W2: Findings and detail (simple, Sonnet)
- `components/dashboard/{findings-view,findings-list,finding-detail}.tsx`, `styles/findings.css` (Δ36).
- **Preserve-as-demo**: the "Reveal attacker's view" toggle and `evidence_unmasked`.

### W3: Assessments, Execution, run log (simple, Sonnet)
- `assessments-view.tsx` (Δ3), `run-log-view.tsx`, `derive-run-log.ts`, `thinking-block.tsx`
  (all NEW), `lib/data/thinking.ts` (NEW).
- The thinking content must come from the saved snapshot. If it needs a schema field, ask the
  W1 owner.

### W4: Reports (simple, Sonnet)
- `report-*.tsx/ts`, `derive-report.ts`, `lib/report/{formats,html,mask}.ts`,
  `lib/report/combined/{options,query}.ts`, `app/api/assessments/[uid]/{route,export/route}.ts`.
- **Preserve-as-demo**: reports stay masked.

### W5: AI Assistant (complex, Opus). Canned replies only.
- `components/assistant/{assistant-view,assistant-provider,assistant-header,composer,
  conversation-menu,scroll-to-bottom,types,use-asking,use-stick-to-bottom,motion}.ts(x)`,
  `cards/card-shell.tsx`, `lib/assistant/{access,cards,client,history-store,insights,intent,
  paths,redact,reply}.ts`, `app/api/assistant/route.ts`, `app/assistant/page.tsx`,
  `styles/assistant.css` (Δ12), `lib/scroll/stick-rules.ts`.
- **Adapt**: `reply.ts` / `client.ts` keep the canned answers, and there is no model chip.
  `redact.ts` (Δ122) pairs with `store/redact.py` (see T10).

### W6: Knowledge (simple, Sonnet). Read-only.
- `components/knowledge/{knowledge-view,file-grid,file-table,use-knowledge}.ts(x)`,
  `lib/knowledge/{client,rules}.ts`, `app/api/knowledge/route.ts`, `styles/knowledge.css` (Δ19).
- **Adapt**: the real knowledge view uploads and removes files. The demo keeps it read-only, with
  no upload or remove.

### W7: Docs (simple, Sonnet)
- `content/docs/*` (getting-started Δ202, reports Δ178, commands Δ104, …), `lib/docs-nav.ts`,
  `lib/docs-redirects.ts`, `components/docs-layout.tsx`, `docs-part.tsx`, `app/docs/layout.tsx`.
- **Skip** `ai-models.tsx` (the live model picker). Docs must not describe sign-in or live models.
- `content/docs/commands.json` is generated: rerun the exporter after T6, never edit it by hand.

## 4. Suggested order
1. T1 (Opus) and W1 (Sonnet) first. They own the shared files.
2. Then in parallel: T2, T3, T4, T5 (Opus); T6–T10 (Sonnet); W2–W4, W6, W7 (Sonnet); W5 (Opus).
3. Integrator: merge `PORT_NOTES/*.tcss` into `reconix.tcss`, update `widgets/__init__.py` and
   `screens/__init__.py`, then run the full checks: `pytest -q`, `compileall`, `npm run build`, and
   `make_sample_data.py` if the schema changed.
