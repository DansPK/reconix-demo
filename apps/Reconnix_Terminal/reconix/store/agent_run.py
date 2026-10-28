"""Bridge: drive the backend pentest harness agent from Reconix.

The harness `Agent` performs the real assessment — plan, scan via the Kali MCP server,
analyze findings. Its LLM is always Reconix's active ``/provider`` model, set before each
turn, so the operator can switch model mid-assessment and the `Agent` keeps its whole
conversation history (context preserved). This is the only module that imports `harness`.

One `Agent` is cached per Reconix assessment. The agent runs async; the shell drives it in
a worker and renders the streamed events into the chat/activity log.
"""

import ipaddress
import json
from typing import Any, Awaitable, Callable, Dict, Optional
from urllib.parse import urlsplit

from ..models import PlanTask
from ..models.base import utc_now
from . import agent_guard, lists, providers
from .assessment import get_assessment
from .errors import StoreValidationError
from .redact import MASK, redact, redact_all
from .scope import record_verdict
from .snapshot import uid_for
from .transcript import add_activity, add_chat

OnEvent = Callable[[Dict[str, Any]], Awaitable[None]]
OnAsk = Callable[[Dict[str, Any]], Awaitable[Optional[Dict[str, Any]]]]

_agents: Dict[str, Any] = {}   # assessment uid -> harness Agent


def harness_installed() -> bool:
    try:
        import harness  # noqa: F401
        return True
    except Exception:
        return False


def available() -> bool:
    """True when the harness is importable and a model is active to drive it."""
    return harness_installed() and providers.active_model() is not None


def looks_like_target(text: str) -> bool:
    """Whether a line names a scan target (URL/host/IP/repo/path) vs plain conversation."""
    from .parser import parse_request
    return parse_request((text or "").strip()) is not None


def _llm_settings():
    """A harness `LLMSettings` built from Reconix's active provider, or None."""
    params = providers.active_llm_settings()
    if params is None:
        return None
    from harness.config import LLMSettings
    return LLMSettings(base_url=params["base_url"], api_key=params["api_key"],
                       model=params["model"], timeout=float(params["timeout"]))


def _agent(uid: Optional[str] = None):
    """The cached harness `Agent` for an assessment (created on first use), with the scope
    guard installed: every tool call is checked against the approved scope (`agent_guard`)."""
    from harness.agent import Agent
    from harness.config import load_settings

    uid = uid or uid_for(get_assessment())
    agent = _agents.get(uid)
    if agent is None:
        settings = load_settings()      # Kali MCP + DB from env; the LLM is set per turn
        # Give the agent the store's /add-on knowledge and (for an API run) the attached
        # OpenAPI schema, both as read-only reference tools.
        agent = Agent(settings, knowledge=_knowledge_search, api_schema=_api_schema_lookup)
        agent.guard = agent_guard.make_guard(
            uid, lambda ref: _lookup_target(agent, ref), lambda a, kind: _tools_for(agent, a, kind))
        _agents[uid] = agent
    return agent


def _knowledge_search(query: str) -> list:
    """The store's knowledge search, as the harness tool expects it: a list of plain dicts.

    Passages are already cleaned and redacted at ingest; the score is dropped (the model only
    needs the text). The same 4,000-character budget as the chat applies (`fit_budget`), so
    one tool call never hands the model more than that. The harness never imports Reconix, so
    this mapping lives here.
    """
    from . import knowledge
    return [{"source": p.source, "index": p.index, "text": p.text}
            for p in knowledge.fit_budget(knowledge.search(query))]


def _api_schema_lookup(path: str, method: Optional[str] = None) -> Dict[str, Any]:
    """The store's OpenAPI schema digest for one endpoint, as the harness tool expects it.

    The digest is already redacted and cleaned when it is built; this returns a fenced block
    (or an error). Empty / an error when no spec is attached. The harness never imports
    Reconix, so this mapping lives here.
    """
    from . import openapi
    return openapi.api_schema_endpoint(path, method)


def _lookup_target(agent, ref: str) -> Optional[tuple]:
    """(value, type) of the harness target a tool call names, or None."""
    target = agent._resolve_target(ref)
    return (target.value, target.type.value) if target is not None else None


def _tools_for(agent, args: Dict[str, Any], kind: str) -> list:
    """The tools `run_scan` would actually run (the harness's own fallbacks, mirrored)."""
    tools = args.get("tools") or agent.settings.profile(str(args.get("profile", "") or ""))
    if not tools:
        tools = ["whatweb", "nuclei", "nikto"] if kind in ("web", "api") else ["nmap"]
    return [str(t) for t in tools] if isinstance(tools, (list, tuple)) else [str(tools)]


def switch_model() -> bool:
    """Point the current assessment's agent at the now-active provider, keeping history.

    Returns False if there is no agent yet (nothing to switch) or no active model.
    """
    agent = _agents.get(uid_for(get_assessment()))
    if agent is None:          # no live agent → nothing to switch, don't touch harness
        return False
    settings = _llm_settings()
    if settings is None:
        return False
    agent.set_llm(settings)
    return True


async def run(text: str, on_event: OnEvent, on_ask: Optional[OnAsk] = None) -> None:
    """One agent turn: set the active model, then drive `Agent.chat`, streaming events."""
    settings = _llm_settings()
    if settings is None:
        raise StoreValidationError("No LLM model is active. Use /model to pick one.")
    uid = uid_for(get_assessment())    # bound now: a later switch can't redirect this turn
    agent = _agent(uid)
    agent.set_llm(settings)            # always the current /provider selection
    _authorize_approved_target(agent, uid)
    await agent.chat(text, on_event, on_ask)


def _is_cidr(value: str) -> bool:
    """True for a network range ("10.0.0.0/28"); a URL with a path is not one."""
    if "/" not in value:
        return False
    try:
        ipaddress.ip_network(value, strict=False)
    except ValueError:
        return False
    return True


def _authorize_approved_target(agent, uid: str) -> None:
    """Register the scope's own target as authorized, so the model never has to (or can)
    decide authorization. Only the approved scope's target; a CIDR range is left to the
    model's per-host `add_target`, which the guard checks."""
    snap = agent_guard.snapshot(uid)
    if snap is None or snap.scope.status != "APPROVED":
        return
    scope = snap.scope
    if scope.kind not in ("web_url", "api", "network"):
        return
    value = scope.target_url.strip()
    if scope.kind == "network":
        if _is_cidr(value):
            return
        if "://" in value:                      # "http://10.0.0.7:8080/" -> "10.0.0.7:8080"
            value = urlsplit(value).netloc
    from harness.models import TargetType

    kind = {"web_url": TargetType.WEB, "api": TargetType.API}.get(scope.kind, TargetType.NETWORK)
    agent.register_authorized_target(value, kind)


def reset() -> None:
    """Drop cached agents (new session / assessment, and between tests)."""
    _agents.clear()
    agent_guard.clear()


def revoke_current(drop_agent: bool = False) -> None:
    """`revoke` for the assessment that is current now. `drop_agent` also forgets its cached
    `Agent`: a turn cancelled mid-tool leaves tool calls without replies in its history,
    which a provider would reject on the next turn."""
    uid = uid_for(get_assessment())
    revoke(uid)
    if drop_agent:
        _agents.pop(uid, None)


def revoke(uid: str) -> None:
    """Withdraw an assessment's scope so a still-running or late tool call is refused."""
    agent_guard.install(uid, None, None)


# --- driving the shared run model so the static Execution screen renders the agent --------

_PCT = {"done": 100, "completed": 100, "running": 50, "active": 50, "in_progress": 50}


def _agent_tools() -> list:
    """The tools the agent can actually pick (the harness scanner set)."""
    try:
        from harness.scanners import SCANNERS
        return sorted(SCANNERS)
    except Exception:
        return ["gobuster", "httpprobe", "nikto", "nmap", "nuclei", "sqlmap", "whatweb", "zap"]


def widen_scope_tools() -> None:
    """List the full agent toolset on the Scope Manifest the operator approves.

    The scripted templates allow only a few tools; the agent plans dynamically and may use
    many, so in agent mode the scope the operator reviews should permit them. Only applies
    while the scope awaits approval.
    """
    from ..models import GATE_SCOPE

    current = lists.current()
    scope = current.scope
    if scope is None or scope.status == "APPROVED" or current.run.waiting_gate != GATE_SCOPE:
        return
    tools = _agent_tools()
    if tools and list(scope.tools) != tools:
        scope.tools = tools
        add_activity("SYS", "Scope set for the AI agent · tools: " + ", ".join(tools))


def begin_execution() -> None:
    """Mark the run live and enterable so the Execution screen shows the agent working."""
    run = lists.current().run
    run.started = True
    run.plan_started = True       # navigation lets Execution open
    run.waiting_gate = ""
    run.stopped = ""
    run.completed = False
    run.phase = "testing"
    if run.started_at is None:
        run.started_at = utc_now()
    # The guard decides on this copy (it runs off the app thread); see store/agent_guard.py.
    agent_guard.install(uid_for(get_assessment()), lists.current().scope, run.started_at)


def set_plan(steps) -> None:
    """Replace the plan checklist from the agent's `update_plan` steps and their statuses.

    Each step becomes a plan task; its status drives the Execution task row (spinner on the
    running one). Static `plan_tasks()` reads these via `run.progress`.
    """
    run = lists.current().run
    tasks = []
    for i, step in enumerate(steps or []):
        key = f"s{i}"
        # masked before the cut: a credential URL cut mid-password would slip past redact()
        label = (redact(str(step.get("text", "")).strip()) or f"step {i + 1}")[:48]
        tasks.append(PlanTask(key=key, label=label))
        run.progress[key] = _PCT.get(str(step.get("status", "")).lower(), 0)
    lists.current().plan = tasks


def finish(stopped: str = "") -> None:
    """Mark the agent run complete (or stopped) and settle the checklist."""
    run = lists.current().run
    run.waiting_gate = ""
    run.finished_at = utc_now()
    if stopped:
        run.stopped = stopped
    else:
        run.completed = True
        for key in list(run.progress):          # settle any still-running task to done
            if key.startswith("s") and run.progress[key] == 50:
                run.progress[key] = 100


# --- recording streamed events into the transcript -----------------------------------------

def record_user(text: str) -> None:
    """The operator's line that starts/continues an agent turn."""
    add_chat("text", "you", text)


def note(text: str, tone: str = "muted") -> None:
    """A Reconix chat note (errors, model switches)."""
    add_chat("text", "reconix", text, tone=tone)


def record_event(ev: Dict[str, Any]) -> None:
    """Translate one harness agent event into a chat / activity line."""
    kind = ev.get("type")
    if kind == "assistant":
        add_chat("text", "reconix", redact(ev.get("text") or ""))
    elif kind == "reasoning":
        # The model's chain-of-thought, shown muted so it reads as "thinking".
        thought = redact(f"thinking… {ev.get('text') or ''}")[:2000]
        add_chat("text", "reconix", thought, tone="muted")
    elif kind == "plan":
        steps = ev.get("steps") or []
        set_plan(steps)             # drives the Execution task rows + spinner
        labels = "; ".join(str(s.get("text", "")) for s in steps)
        add_activity("AI", f"plan: {labels}"[:300])
    elif kind == "policy":
        _record_policy(ev)
    elif kind == "tool_start":
        if ev.get("name") == KNOWLEDGE_TOOL:      # its query is never logged (see below)
            return
        add_activity("TOOL", f"{ev.get('name')}({_short(mask_secrets(ev.get('args')))})")
    elif kind == "tool_progress":
        add_activity("TOOL", redact(str(ev.get("text", "")))[:300])
    elif kind == "tool_end":
        if ev.get("name") == KNOWLEDGE_TOOL:
            add_activity("TOOL", _knowledge_summary(ev.get("result")))
            return
        add_activity("TOOL", f"{ev.get('name')}: {_short(mask_secrets(ev.get('result')))}")
        if ev.get("name") in ("run_scan", "http_poc"):   # scanners and ad-hoc PoC proofs
            ingest_scan_findings(ev.get("result"))


# The agent's /add-on lookup. Its query and passages stay out of the activity log: the log is
# saved in the snapshot's timeline (the web and the JSON export show it), and the passages come
# from the operator's private reference files. The log says only how many, from how many files.
KNOWLEDGE_TOOL = "search_knowledge"


def _knowledge_summary(result: Any) -> str:
    """`search_knowledge: N passages from M files` (or that it failed): no query, no text."""
    if not isinstance(result, dict) or result.get("error"):
        return f"{KNOWLEDGE_TOOL}: the knowledge search failed"
    rows = result.get("passages")
    rows = rows if isinstance(rows, list) else []
    sources = {str(row.get("source")) for row in rows if isinstance(row, dict)}
    passages = "passage" if len(rows) == 1 else "passages"
    files = "file" if len(sources) == 1 else "files"
    return f"{KNOWLEDGE_TOOL}: {len(rows)} {passages} from {len(sources)} {files}"


# Keys whose values never go to the activity log: credentials, session material, request
# bodies and header values (a header can carry a token the text patterns don't recognise).
_SECRET_KEYS = {"password", "passwd", "pwd", "secret", "token", "cookie", "authorization",
                "api_key", "apikey", "body", "header", "headers", "options"}


def mask_secrets(value: Any) -> Any:
    """`value` safe to log: secret-named keys masked (whole value, nested too), then every
    remaining string run through `redact`. Mappings under `headers` keep their names only."""
    if isinstance(value, dict):
        out: Dict[Any, Any] = {}
        for key, item in value.items():
            if str(key).casefold().replace("-", "_") in _SECRET_KEYS:
                out[key] = ({k: MASK for k in item} if isinstance(item, dict) else MASK)
            else:
                out[key] = mask_secrets(item)
        return out
    if isinstance(value, (list, tuple)):
        return [mask_secrets(item) for item in value]
    return redact_all(value)


def _record_policy(ev: Dict[str, Any]) -> None:
    """A tool call the scope guard refused: audit it like a blocked request (app thread)."""
    tool = str(ev.get("tool") or "tool")
    args = ev.get("args") or {}
    if tool == "http_poc":
        method, target = str(args.get("method", "GET")).upper(), args.get("url")
    elif tool in ("login", "request_credentials"):
        method, target = "POST", args.get("url") or args.get("login_url")
    elif tool == "run_scan":                    # the host the scan would have hit, with its tools
        method, target = "SCAN", f"{_scan_tools(args)} {_resolved_target(args)}"
    else:
        method, target = tool.upper(), args.get("target") or args.get("value")
    target = redact(str(target or tool))[:200]
    reason = redact(str(ev.get("reason") or "Outside approved scope"))
    record_verdict(method, target, reason)
    add_activity("POLICY", f"Blocked: {reason} · {tool} {target}"[:300], tone="block")


def _scan_tools(args: Dict[str, Any]) -> str:
    tools = args.get("tools")
    if isinstance(tools, (list, tuple)) and tools:
        return ",".join(str(t) for t in tools)
    return str(args.get("profile") or "default")


def _resolved_target(args: Dict[str, Any]) -> str:
    """The target value a `run_scan` ref names (falls back to the ref as written)."""
    ref = str(args.get("target", ""))
    agent = _agents.get(uid_for(get_assessment()))
    try:
        found = _lookup_target(agent, ref) if agent is not None else None
    except Exception:
        found = None
    return found[0] if found else ref


_SEV = {"critical": "CRITICAL", "high": "HIGH", "medium": "MEDIUM",
        "low": "LOW"}


def ingest_scan_findings(result: Any) -> int:
    """Map the harness findings from a run_scan result into store `Finding`s (full records
    from the harness DB), so `/findings`, the report, `/summary` and the web snapshot populate.
    """
    if not isinstance(result, dict):
        return 0
    agent = _agents.get(uid_for(get_assessment()))
    target = result.get("target") or {}
    tid = target.get("id")
    if agent is None or tid is None:
        return 0
    try:
        rows = agent.db.findings_for_target(tid)
    except Exception:
        return 0
    from .findings import ingest_external
    mapped = [f for f in (_to_finding(hf) for hf in rows) if f is not None]
    return ingest_external(mapped, prefix="AI")


def _to_finding(hf: Any):
    """Harness `Finding` dataclass -> Reconix `Finding`, or None for a non-reportable severity."""
    from ..models import Finding
    from .redact import redact

    sev = _SEV.get(str(getattr(hf.severity, "value", hf.severity) or "").lower())
    if sev is None:                               # Info, unknown or empty: never stored
        return None
    evidence = [redact(hf.evidence)[:500]] if getattr(hf, "evidence", "") else []
    return Finding(
        fid="",                                   # assigned by ingest_external
        severity=sev,
        title=redact(hf.title or "")[:200],
        path=hf.location or "",
        validation="CONFIRMED" if getattr(hf, "verified", False) else "UNCONFIRMED",
        description=redact(hf.description or ""),
        affected_url=hf.location or "",
        impact=redact(getattr(hf, "ai_analysis", "") or ""),
        remediation="",
        tool="agent",
        evidence=evidence,
        cvss_score=float(getattr(hf, "cvss_score", 0) or 0),
        category="Web App",
    )


def _short(value: Any, limit: int = 160) -> str:
    """A compact, plain-text one-liner for an event's args/result (never raises)."""
    try:
        text = value if isinstance(value, str) else json.dumps(value, default=str)
    except Exception:
        text = str(value)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"
