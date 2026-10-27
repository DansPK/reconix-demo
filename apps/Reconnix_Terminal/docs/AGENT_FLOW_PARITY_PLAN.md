# Agent flow parity — run the harness agent through the static frames

## Context

Agent mode today streams events into the chat. The operator wants the agent-driven
assessment to look and behave like the scripted ("static") flow: enter through **Template**,
review a **Plan**, approve gated/**HIGH-risk** actions, watch **Execution** narrate live
(task rows + spinner + live log), and end with real **Findings** / **Report** — with full
store integration (`/findings`, `/report`, `/summary`, the web dashboard all populate).

The adaptive ReflAct agent stays the engine. Principle (from `LLM_INTEGRATION_PLAN.md`):
**the agent proposes; Reconix's flow gates; the store records.** The Execution/Plan/Findings
screens are already pure store readers, so the work is to make the agent populate that store
state and pass through the same gates.

## Architecture

The agent runs in its worker as now, but its lifecycle is mapped onto the store's run model
and gates:

- **Template** — agent mode enters via the existing Template frame (confirm template → scope).
  Reused unchanged. Approving the scope marks the harness `target.authorized` (the agent's
  own authorization gate) — so scope approval is the single authorization point.
- **Plan** — before scanning, the agent's first `update_plan` is captured and written as the
  store's plan rows; the Plan screen shows them; the operator runs the plan (approve). The
  agent is held at a barrier until then.
- **Execution** — the agent executes; `tool_start`→task active, `tool_end`→task done, tool
  output→live log, spinner on the current task — all via store run-state the Execution screen
  already reads. Elapsed/counters/log reuse the existing widgets.
- **Approval (HIGH-risk)** — a new `on_approve(action)` hook in the agent pauses before it
  runs an intrusive tool; Reconix raises its approval gate (command hash + single-use token),
  and the agent proceeds or skips on the verdict. MEDIUM/HIGH mapping from the tool/profile.
- **Findings / Report** — each agent finding is ingested into the store as a Reconix `Finding`
  (severity/title/evidence/location/validation), so every downstream view works. On agent
  completion the run is marked complete and the flow advances to Findings.

## Phases (each shippable + tested; suite stays green)

1. **Findings ingestion (foundation).** `store.agent_run` → ingest harness findings as Reconix
   `Finding`s (reuse/extend `store.import_findings`); map severity + `verified`→validation.
   Test: a fake agent `tool_end` with findings populates `store.list_findings()`.
2. **Template entry.** Agent mode routes a typed target through the Template frame first
   (`open_template`), building scope; on scope approval the agent starts and the target is
   marked authorized. Reuses Template/scope screens.
3. **Execution live progress.** Map agent plan + tool events onto store run-state so the
   Execution screen renders task rows + spinner + live log for the agent run (navigate to
   Execution when it starts). Add the store seams to set plan tasks and mark active/done.
4. **Plan frame + barrier.** Capture the agent's first `update_plan`, write store plan rows,
   show the Plan screen, hold the agent until the operator runs the plan.
5. **Approval gate.** `on_approve` hook in `backend/harness/agent.py` before intrusive scans;
   Reconix approval gate (hash + token) decides; wire through the bridge.
6. **Completion + Findings/Report + web snapshot.** Mark run complete; `/findings`,
   `/report`, `/summary`, snapshot all reflect the agent run.

## Status

- **Phase 1 ✅** findings ingestion — `agent_run.ingest_scan_findings` maps harness findings
  (full records from its DB) into store `Finding`s (`findings.ingest_external`, `AI-` ids).
- **Phase 2 ✅** Template entry — a typed target / `/assess` with a model active runs
  `enter_agent_mode`: starts the run (Template + scope like static), `goto("template")`. On
  **scope approval** `approve_scope` branches to `begin_agent_execution` instead of the
  scripted RunController. `agent_mode` is reset on every scripted entry point.
- **Phase 3 ✅** live Execution — `agent_run.begin_execution/set_plan/finish` drive the shared
  `RunState`/plan so the existing Execution screen renders the agent: `update_plan`→task rows,
  step status→spinner/active/done, tool output→live log, findings→store. Execution screen
  rebuilds on plan-set changes (`view_state`) and tolerates the reload window.
- **Live stream ✅** the Execution screen's "live output" (`RunLog`, fed by `stream()` =
  chat + activity) shows the agent's replies, reasoning ("thinking…") and tool events as
  they happen; findings surface in the Findings list/detail, severity strip and snapshot
  (`find_findings` returns the `AI-` findings).
- **Chat gated to between turns ✅** by design, chat is not accepted while a turn is running
  (scanning / a PoC test) — the operator can chat again once it finishes (`_send_to_agent`
  blocks with a notice while `_agent_busy`). The scrollback (Start) and live log (Execution)
  remain visible during the run.
- **Deferred to next:** Phase 4 (Plan-review barrier before scanning), Phase 5 (HIGH-risk
  approval interception via an `on_approve` hook), Phase 6 (completion → auto-advance to
  Findings).

## Risks / decisions

- **Adaptivity vs pre-approved plan:** the agent may revise its plan mid-run (ReflAct). The
  Plan screen shows the *initial* plan; later `update_plan`s update the task rows live on
  Execution (the plan is a living checklist, as in the static run). The operator approves
  *starting*, not a frozen list — same as static where new gated actions still pause.
- **Keep the scripted demo** as the fallback when no model/harness (existing tests green).
- Harness changes stay additive (an `on_approve` hook alongside `on_ask`), preserving the
  ReflAct loop.

## Verification
- Reconix + harness suites green at each phase; new tests per phase (fakes for agent events).
- Live: `/assess` the Juice Shop target → Template → Plan → Execution (live) → approve a
  HIGH-risk scan → Findings/Report populated; switch `/model` mid-run, context preserved.
