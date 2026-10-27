"""The assessment run: play the next scripted step, stop at gates, and report where it is.

`advance()` is the only way the run moves. At a gate it stays put until the store has
recorded the human decision (template, scope, plan, target login, one-time code,
approval), so no step past a gate can play early, whatever the UI does. Steps marked
`when` play only if the approved tools need them (a login, the code after it).
"""

from datetime import timedelta
from pathlib import PurePath
from string import Template as TextTemplate
from typing import Dict, List, Optional

from ..models import (
    GATE_ACCOUNT, GATE_APPROVAL_PREFIX, GATE_CODE, GATE_PLAN, GATE_SCOPE, GATE_TEMPLATE,
    PROGRESS_BARS, PlanTask, RunState, RunStep,
)
from ..models.base import utc_now
from ..models.parser import ParsedTarget
from . import lists, seed
from .activity import log_event
from .approvals import approvals_count, decision_for, get_approval
from .assessment import add_request, clean_request, get_assessment
from .errors import StoreValidationError
from .findings import finding_exists, findings_line, list_findings
from .parser import parse_request
from .replies import reply_after_run, reply_to, reply_while_running
from .scope import (
    blocked_count, check_request, get_scope, is_scope_approved, time_limit_reached,
)
from .scope_view import join_and
from .targets import as_network, check_target
from .templates import apply_template, selected_template, template_name
from .templates.base import build_plan
from .tools import approved_tool
from .transcript import add_activity, add_chat, list_activity
from .vault import code_needed, is_authenticated, is_code_verified, login_kind, login_tools

# The phase shown while the run waits at a gate.
WAITING_PHASES = {
    GATE_TEMPLATE: "planning",
    GATE_SCOPE: "scope_pending",
    GATE_PLAN: "plan_pending",
    GATE_ACCOUNT: "waiting_account",
    GATE_CODE: "waiting_account",
}
# How the login reads in step text ($login_need).
LOGIN_WORDS = {"cookie": "a session cookie", "password": "a test account",
               "password+otp": "a test account and a one-time code"}
PIPELINE_SOURCES = {"AI": "ai", "POLICY": "policy", "TOOL": "tool"}


def _client_label(target: str) -> str:
    """A readable client name from the target (staging.example.com -> Example).

    An address or range stays as typed (192.0.2.10), and a local folder gives its own
    name (/home/me/shop-app -> Shop App): neither has a domain to take a name from.
    """
    if as_network(target) is not None:
        return target.strip()
    if target.startswith(("/", "~", ".")) or (len(target) > 2 and target[1:3] in (":\\", ":/")):
        name = PurePath(target.replace("\\", "/").rstrip("/")).name
        return name.replace("-", " ").replace("_", " ").title() or target
    host = target.split("//")[-1].split("/")[0].split(":")[0]
    labels = [part for part in host.split(".") if part]
    core = labels[-2] if len(labels) >= 2 else (labels[0] if labels else target)
    return core.replace("-", " ").title() or target


def get_run() -> RunState:
    return lists.current().run


# --- starting and resetting -------------------------------------------------------------
def submit_prompt(text: str) -> str:
    """A line typed at the prompt. Returns "started" (a run began) or "answered".

    Before a run, a line that names a target starts the run on it; anything else (a
    greeting, a question, "scan my network" without an address) gets a short answer and
    nothing starts. A malformed target (10.0.0.300) raises, so the operator can fix it.
    During a run the line goes to the assistant.
    """
    if get_run().started:
        say_to_assistant(text)
        return "answered"
    text = clean_request(text)
    parsed = parse_request(text)
    if parsed is None:
        add_chat("text", "you", text)
        add_chat("text", "reconix", reply_to(text), tone="muted")
        return "answered"
    _start(text, parsed, picked=False)
    return "started"


def start_run(text: str, template_id: Optional[str] = None) -> None:
    """Start the assessment on the target in `text`.

    With `template_id` (the operator picked it with /template) the target must be valid
    for that template, and the template applies at once. Without it the target's shape
    picks the template: an unambiguous one (IPv4, URL, repo, path) applies at once; a bare
    hostname waits at the template gate. Text without a target raises with the answer.
    The Scope Manifest gate comes next in every case.
    """
    if get_run().started:
        raise StoreValidationError("An assessment is already running. Type /new to start over.")
    text = clean_request(text)
    if template_id is not None:
        _start(text, check_target(template_id, text), picked=True)
        return
    parsed = parse_request(text)
    if parsed is None:
        raise StoreValidationError(reply_to(text))
    _start(text, parsed, picked=False)


def _start(text: str, parsed: ParsedTarget, *, picked: bool) -> None:
    """Record the request and target and build the plan (and the run, if the template is
    known). `picked`: the operator chose the template; else it is matched or asked for."""
    assessment = lists.current()
    add_request(text)
    assessment.target = parsed.target
    assessment.target_url = parsed.target_url
    assessment.target_kind = parsed.target_kind
    assessment.template_id = parsed.template_id
    assessment.requested_ports = list(parsed.ports)
    assessment.requested_tools = list(parsed.tools)
    assessment.client = _client_label(parsed.target)
    add_chat("text", "you", text)
    known = picked or parsed.confident
    assessment.script = build_plan(parsed.target_kind, ask_template=not known)
    assessment.run.started = True
    log_event("run.started", parsed.target)
    if known:
        apply_template(parsed.template_id, auto=not picked)


def say_operator_line(text: str) -> str:
    """Record the operator's chat line and return it. Raises before any model is called."""
    if not get_run().started:
        raise StoreValidationError("Start an assessment first.")
    if get_run().waiting_gate in (GATE_ACCOUNT, GATE_CODE):
        # Don't record it: an operator may be pasting the login into the wrong place.
        raise StoreValidationError("Reconix is waiting for the target login. Press Enter on "
                                   "the Execution screen to open the secure input; never "
                                   "paste credentials into the chat.")
    if get_run().stopped_at_gate in (GATE_ACCOUNT, GATE_CODE):
        # Stopped at the login: the next line may still be the password. Never echo, record
        # or send it to a model.
        raise StoreValidationError("This run stopped at the target login. Use /new to start "
                                   "another assessment; never paste credentials into the "
                                   "chat.")
    request = add_request(text)
    add_chat("text", "you", request.text)
    return request.text


def llm_answer(text: str) -> None:
    """Add Reconix's reply: the active model when one is set, else the built-in reply.

    Blocks on the network, so the app runs it in a worker (see `shell/actions.py`). Any
    model failure falls back to the scripted reply so the offline demo keeps working.
    """
    from . import llm_chat, providers
    from ..llm import LLMError

    active = providers.active_model()
    if active is not None:
        try:
            llm_chat.reply(text, active)
            return
        except LLMError as exc:
            add_chat("text", "reconix",
                     f"LLM unavailable ({exc}). Showing the built-in reply.", tone="muted")
    builtin = reply_after_run if is_finished() else reply_while_running
    add_chat("text", "reconix", builtin(text), tone="muted")


def say_to_assistant(text: str) -> None:
    """A message typed while the run is going: record it, then answer (model or built-in)."""
    answer = say_operator_line(text)
    llm_answer(answer)


def new_assessment() -> None:
    """Throw away the current run and load a fresh one. The audit trail and history stay."""
    from .persist import autosave       # (imported here: persist depends on this module)

    autosave()                          # keep the one we leave up to date on disk
    seed.load_run_data()
    log_event("assessment.new")


# --- gates -----------------------------------------------------------------------------------
def gate_state(gate: str) -> str:
    """"open" once the human decision is recorded, "rejected", or "pending"."""
    if gate == GATE_TEMPLATE:
        return "open" if selected_template() else "pending"
    if gate == GATE_SCOPE:
        return "open" if is_scope_approved() else "pending"
    if gate == GATE_PLAN:
        return "open" if get_run().plan_started else "pending"
    if gate == GATE_ACCOUNT:
        return "open" if not login_kind() or is_authenticated() else "pending"
    if gate == GATE_CODE:
        return "open" if not code_needed() or is_code_verified() else "pending"
    if gate.startswith(GATE_APPROVAL_PREFIX):
        decision = decision_for(gate[len(GATE_APPROVAL_PREFIX):])
        if decision is None:
            return "pending"
        return "open" if decision.decision == "APPROVED" else "rejected"
    raise StoreValidationError(f"Unknown gate {gate}.")


def waiting_gate() -> str:
    return get_run().waiting_gate


def run_plan() -> None:
    """The operator runs the reviewed plan. Testing starts only after this."""
    run = get_run()
    if run.waiting_gate != GATE_PLAN or not is_scope_approved():
        raise StoreValidationError("The plan can only be run when Reconix asks for it.")
    if run.plan_started:
        raise StoreValidationError("The plan is already running.")
    run.plan_started = True
    add_activity("USER", "Plan approved · testing starts", tone="ok")
    log_event("plan.run", get_assessment().label)


def is_plan_started() -> bool:
    return get_run().plan_started


def reject_scope() -> None:
    """The operator rejects the drafted scope: nothing is tested and the assessment stops."""
    run = get_run()
    if run.waiting_gate != GATE_SCOPE or is_scope_approved() or run.stopped:
        raise StoreValidationError("The scope can only be rejected while it waits for approval.")
    add_activity("USER", "Scope rejected", tone="block")
    log_event("scope.rejected")
    _stop("you rejected the scope", "Scope rejected. Nothing was tested.")


def stop_run() -> None:
    """The operator stops the run. Findings so far are kept; nothing else plays."""
    run = get_run()
    if not run.started or is_finished():
        raise StoreValidationError("No assessment is running.")
    add_activity("USER", "Stop requested", tone="block")
    _stop("you stopped it", "Stopped by the operator. Nothing else will run.")


# --- playing steps ---------------------------------------------------------------------------
def _applies(step: RunStep) -> bool:
    """A `when` step plays only if the approved tools need it."""
    if step.when == "login":
        return bool(login_kind())
    if step.when == "code":
        return code_needed()
    return True


def _next_index() -> Optional[int]:
    """Where the next step that applies sits in the script (None when the run can't move)."""
    run = get_run()
    script = lists.current().script
    if not run.started or run.stopped:
        return None
    index = run.cursor
    while index < len(script) and not _applies(script[index]):
        index += 1
    return index if index < len(script) else None


def peek() -> Optional[RunStep]:
    """The next step, without playing it (None when the run can't move)."""
    index = _next_index()
    return None if index is None else lists.current().script[index]


def advance() -> Optional[RunStep]:
    """Play the next step and return it.

    At a gate that is still pending, the run records that it is waiting and returns
    the gate step without moving. Returns None when there is nothing to play.
    """
    index = _next_index()
    if index is None:
        return None
    step = lists.current().script[index]
    run = get_run()
    run.cursor = index                      # past the steps this run doesn't need
    if time_limit_reached():
        _stop("the scope's time limit was reached", "Time limit reached. Testing stopped.")
        return None
    if step.kind == "gate":
        state = gate_state(step.name)
        if state == "pending":
            if run.waiting_gate != step.name and _policy_blocks_gate(step.name):
                return None
            run.waiting_gate = step.name
            return step
        run.waiting_gate = ""
        if state == "rejected":
            request = get_approval(step.name[len(GATE_APPROVAL_PREFIX):])
            _stop(f"you rejected {request.action}",
                  f"Rejected: {request.action}. Not executed.")
            return None
    else:
        _apply(step)
    run.cursor += 1
    return step


def _fill(text: str, tool: str = "") -> str:
    """Step text with its $names filled in. `tool` is what the step names as `$tool`."""
    assessment = get_assessment()
    tools = _approved_tools()
    return TextTemplate(text).safe_substitute(
        assessment=assessment.assessment_id or assessment.planned_id,
        target=assessment.target,
        template=template_name(assessment.template_id),
        picked="auto-selected" if assessment.template_auto else "selected",
        findings=findings_line(),
        login_need=_login_need(),
        tools=join_and(tools) if tools else "none",
        tool=approved_tool(tool, tools) if tool else "",
    )


def _approved_tools() -> List[str]:
    scope = get_scope()
    return list(scope.tools) if scope else []


def _login_need() -> str:
    """'a test account and a one-time code (for OWASP ZAP)', for the login step's text."""
    return f"{LOGIN_WORDS.get(login_kind(), 'no login')} (for {join_and(login_tools())})"


def _apply(step: RunStep) -> None:
    run = get_run()
    kind = step.kind
    if kind == "say":
        add_chat(step.entry, step.speaker, _fill(step.text, step.tool), step.tone)
    elif kind == "card":
        add_chat("card", step.speaker, _fill(step.text, step.tool), rows=step.rows)
    elif kind == "log":
        add_activity(step.source, _fill(step.text, step.tool), step.tone)
    elif kind == "phase":
        run.phase = step.name
    elif kind == "parse":
        run.target_known = True
    elif kind == "progress":
        if step.name not in PROGRESS_BARS:
            raise StoreValidationError(f"Unknown progress bar {step.name}.")
        run.progress[step.name] = max(0, min(100, step.value))
    elif kind == "requests":
        run.requests += max(0, step.value)
    elif kind == "propose":
        _propose(step.method, step.path)
    elif kind == "reveal":
        if not finding_exists(step.name):
            raise StoreValidationError(f"No finding {step.name}.")
        if step.name not in run.revealed:
            run.revealed.append(step.name)
    elif kind == "complete":
        run.completed = True
        run.phase = "completed"
        run.finished_at = utc_now()
        log_event("run.completed")
    else:
        raise StoreValidationError(f"Unknown run step {kind}.")


def _propose(method: str, path: str) -> None:
    """The AI proposes a request; the policy check decides whether it runs."""
    add_activity("AI", f"Proposed request: {method} {path}", tone="warn")
    verdict = check_request(method, path)
    if verdict.allowed:
        get_run().requests += 1
        add_activity("TOOL", f"Executing {method} {path}")
        return
    add_activity("POLICY", f"Blocked: {verdict.reason}", tone="block")
    add_chat("banner", "policy", f"Blocked: {method} {path} · {verdict.reason}. Not executed.",
             tone="block")


def _policy_blocks_gate(gate: str) -> bool:
    """Before asking a human, the policy engine checks the action; a block stops the run."""
    if not gate.startswith(GATE_APPROVAL_PREFIX):
        return False
    request = get_approval(gate[len(GATE_APPROVAL_PREFIX):])
    verdict = check_request(request.method, request.path)
    if verdict.allowed:
        return False
    add_activity("POLICY", f"Blocked: {verdict.reason}", tone="block")
    _stop(f"policy blocked {request.action}",
          f"Blocked: {request.method} {request.path} · {verdict.reason}. Not executed.")
    return True


def _stop(reason: str, banner: str) -> None:
    """End the run early: nothing else plays, and the chat says why."""
    run = get_run()
    run.stopped = reason
    run.phase = "stopped"
    at_login = run.waiting_gate in (GATE_ACCOUNT, GATE_CODE)
    run.stopped_at_gate = run.waiting_gate if at_login else ""
    run.waiting_gate = ""
    run.finished_at = utc_now()
    add_chat("banner", "policy", banner, tone="block")
    add_chat("text", "reconix", "Assessment stopped. Nothing else will run. "
             "Type /new to start a new assessment.", tone="muted")
    add_activity("SYS", "Assessment stopped", tone="block")
    log_event("run.stopped", run.stopped)


# --- what the dashboard shows ------------------------------------------------------------------
def display_phase() -> str:
    """The phase id to show: a waiting state at a gate, else the run's phase."""
    run = get_run()
    if run.stopped:
        return "stopped"
    if run.completed:
        return "completed"
    gate = run.waiting_gate
    if gate.startswith(GATE_APPROVAL_PREFIX):
        return "awaiting_approval"
    return WAITING_PHASES.get(gate, run.phase)


def is_completed() -> bool:
    return get_run().completed


def is_finished() -> bool:
    """Completed or stopped: nothing more will play."""
    run = get_run()
    return run.completed or bool(run.stopped)


def counters() -> Dict[str, int]:
    return {
        "requests": get_run().requests,
        "blocked": blocked_count(),
        "approvals": approvals_count(),
        "findings": len(list_findings()),
    }


def phase_progress() -> Dict[str, int]:
    progress = get_run().progress
    return {bar: progress.get(bar, 0) for bar in PROGRESS_BARS}


def task_status(key: str, run: RunState) -> str:
    """Where a plan task stands, read from the run's progress.

    The report task is special: it has no progress until a report is generated, so it
    reads "active" (ready to generate) once the assessment completes and "done" once a
    report is saved.
    """
    percent = run.progress.get(key, 0)
    if key == "report" and percent < 100:
        return "active" if run.completed else "pending"
    if percent >= 100:
        return "done"
    if percent > 0:
        return "active"
    return "pending"


def plan_tasks() -> List[PlanTask]:
    """The current assessment's plan, each task's status read live from the run.

    Empty until a template is chosen (the plan is template-specific). The dashboard shows
    these as a checklist: pending ·, loading ⠹, done ✓.
    """
    run = get_run()
    tasks = lists.current().plan
    for task in tasks:
        task.status = task_status(task.key, run)
    return list(tasks)


def pipeline_stage() -> str:
    """Which box of AI Assistant → Policy Engine → Tool Service is active ("" before a run)."""
    run = get_run()
    if not run.started or run.completed or run.stopped:
        return ""
    if run.waiting_gate:
        return "policy"
    for entry in reversed(list_activity()):
        stage = PIPELINE_SOURCES.get(entry.source)
        if stage:
            return stage
    return "ai"


def elapsed() -> Optional[timedelta]:
    """Testing time so far (from scope approval to now, or to the end of the run)."""
    run = get_run()
    if run.started_at is None:
        return None
    end = run.finished_at or utc_now()
    return end - run.started_at


def time_limit() -> timedelta:
    scope = get_scope()
    return timedelta(minutes=scope.time_limit_minutes if scope else 30)
