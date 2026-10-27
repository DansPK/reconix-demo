"""A plain-data copy of one assessment, for the read-only web dashboard.

`snapshot()` turns an `Assessment` into JSON-safe dicts and lists (schema
`reconix.assessment/v1`). It is built field by field, never with `asdict()` on the whole
assessment, so nothing is included by accident: the vault (`Secret`s, the login identity)
and HIGH-risk confirmation tokens are left out, and one-time codes are never stored
anywhere to begin with. Findings are the revealed ones; their evidence is already masked.

Every string is passed through `redact()` on the way out, so credentials an operator typed
(`https://user:pass@…`, a pasted cookie) or a tool printed never reach the saved file.

A decided gate can linger in `run.waiting_gate` until the next step plays; the snapshot
only reports the run as waiting while the decision is really missing, so a saved copy
never shows an approval that was already given as pending.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from ..models import (
    GATE_ACCOUNT, GATE_APPROVAL_PREFIX, GATE_CODE, GATE_PLAN, GATE_SCOPE, GATE_TEMPLATE,
    PROGRESS_BARS, Assessment,
)
from . import lists
from .assessment import assessment_status
from .findings import SEVERITY_ORDER
from .redact import redact_all
from .run import task_status
from .templates import template_name
from .vault import login_done, login_kind

SCHEMA = "reconix.assessment/v1"

GATE_WAITS = {
    GATE_TEMPLATE: "template choice",
    GATE_SCOPE: "scope approval",
    GATE_PLAN: "plan review",
    GATE_ACCOUNT: "target login",
    GATE_CODE: "one-time code",
}


def uid_for(assessment: Assessment) -> str:
    """The saved file's stem: "<session>_<label>", unique across sessions."""
    return f"{lists.SESSION_ID}_{assessment.label}"


def _iso(moment: Optional[datetime]) -> Optional[str]:
    return moment.isoformat(timespec="seconds") if moment else None


def _pending_gate(assessment: Assessment) -> str:
    """The gate the run waits at while its decision is still missing ("" otherwise)."""
    run = assessment.run
    gate = run.waiting_gate
    if not gate or run.stopped or run.completed:
        return ""
    if gate == GATE_TEMPLATE:
        decided = bool(assessment.selected_template)
    elif gate == GATE_SCOPE:
        decided = assessment.scope is not None and assessment.scope.status == "APPROVED"
    elif gate == GATE_PLAN:
        decided = run.plan_started
    elif gate == GATE_ACCOUNT:
        decided = run.authenticated
    elif gate == GATE_CODE:
        decided = run.code_verified
    elif gate.startswith(GATE_APPROVAL_PREFIX):
        request_id = gate[len(GATE_APPROVAL_PREFIX):]
        decided = any(d.request_id == request_id for d in assessment.decisions)
    else:
        decided = False
    return "" if decided else gate


def _login(assessment: Assessment) -> Dict[str, Any]:
    """The login its tools need, and whether every step of it was given (never the values)."""
    kind = login_kind(assessment)
    return {"kind": kind, "provided": bool(kind) and login_done(assessment)}


def _request_id(gate: str) -> str:
    return gate[len(GATE_APPROVAL_PREFIX):] if gate.startswith(GATE_APPROVAL_PREFIX) else ""


def _waiting_for(assessment: Assessment, gate: str) -> str:
    """What the run waits on, in words ("" when it is not waiting)."""
    if not gate:
        return ""
    request_id = _request_id(gate)
    if request_id:
        request = next((a for a in assessment.approvals if a.request_id == request_id), None)
        return f"{request.risk} approval for {request.action}" if request else "an approval"
    return GATE_WAITS.get(gate, gate)


def _status(assessment: Assessment, gate: str) -> str:
    status = assessment_status(assessment)
    return "Running" if status == "Awaiting input" and not gate else status


def _scope(assessment: Assessment) -> Optional[Dict[str, Any]]:
    scope = assessment.scope
    if scope is None:
        return None
    return {
        "kind": scope.kind, "target_url": scope.target_url,
        "assessment_type": scope.assessment_type, "status": scope.status,
        "allowed_actions": list(scope.allowed_actions),
        "allowed_methods": list(scope.allowed_methods),
        "excluded_paths": list(scope.excluded_paths),
        "allowed_ports": list(scope.allowed_ports),
        "time_limit_minutes": scope.time_limit_minutes,
        "tools": list(scope.tools),
    }


def _api_spec(assessment: Assessment) -> Optional[Dict[str, Any]]:
    """What the attached OpenAPI file said, never the file: counts, methods, in-scope servers."""
    spec = assessment.api_spec
    if spec is None:
        return None
    return {"title": spec.title, "version": spec.version, "spec_version": spec.spec_version,
            "endpoints": spec.total, "methods": list(spec.methods),
            "servers": list(spec.servers)}


def _findings(assessment: Assessment) -> List[Dict[str, Any]]:
    revealed = set(assessment.run.revealed)
    rows = [f for f in assessment.findings
            if f.fid in revealed and f.severity in SEVERITY_ORDER]
    rows.sort(key=lambda f: SEVERITY_ORDER.index(f.severity))
    return [{
        "id": f.fid, "severity": f.severity, "title": f.title, "path": f.path,
        "validation": f.validation, "description": f.description,
        "affected_url": f.affected_url, "impact": f.impact, "remediation": f.remediation,
        "tool": f.tool, "references": list(f.references), "evidence": list(f.evidence),
        "cvss_score": f.cvss_score, "cvss_vector": f.cvss_vector, "category": f.category,
        "cwe": f.cwe, "owasp": f.owasp, "cve": f.cve,
        "status": f.status, "severity_override": f.severity_override,
        "effective_severity": f.effective_severity, "triage_note": f.triage_note,
    } for f in rows]


def _timeline(assessment: Assessment) -> List[Dict[str, Any]]:
    """Chat and activity entries merged in the order they happened (by `seq`)."""
    rows = [{
        "seq": c.seq, "at": _iso(c.created_at), "type": "chat", "who": c.speaker,
        "kind": c.kind, "text": c.text, "tone": c.tone, "rows": [list(r) for r in c.rows],
    } for c in assessment.chat]
    rows += [{
        "seq": e.seq, "at": _iso(e.created_at), "type": "activity", "who": e.source,
        "kind": "line", "text": e.message, "tone": e.tone, "rows": [],
    } for e in assessment.activity]
    rows.sort(key=lambda r: (r["seq"], r["at"] or ""))
    return rows


def snapshot(assessment: Assessment, *, session_closed: bool = False) -> Dict[str, Any]:
    """Everything the web dashboard shows about one assessment, as plain data.

    `session_closed` marks the copy written when the TUI quits: a run that was still
    going then can never continue, and the web shows it as interrupted.
    """
    run = assessment.run
    template_id = assessment.selected_template or assessment.template_id
    gate = _pending_gate(assessment)
    return redact_all({
        "schema": SCHEMA,
        "uid": uid_for(assessment),
        "session": lists.SESSION_ID,
        "label": assessment.label,
        "assessment_id": assessment.assessment_id,
        "target": assessment.target,
        "target_url": assessment.target_url,
        "target_kind": assessment.target_kind,
        "template": {
            "id": template_id,
            "name": template_name(template_id) if template_id else "",
            "confirmed": bool(assessment.selected_template),
        },
        "api_spec": _api_spec(assessment),
        "operator": assessment.operator,
        "client": assessment.client,
        "mode": assessment.mode,
        "methodology": list(assessment.methodology),
        "report_version": assessment.report_version,
        "created_at": _iso(assessment.created_at),
        "status": _status(assessment, gate),
        "waiting_gate": gate,
        "waiting_request_id": _request_id(gate),
        "waiting_for": _waiting_for(assessment, gate),
        "stopped_reason": run.stopped,
        "session_closed": session_closed,
        "run": {
            "phase": run.phase,
            "started_at": _iso(run.started_at),
            "finished_at": _iso(run.finished_at),
            "completed": run.completed,
            "requests": run.requests,
            "progress": {bar: run.progress.get(bar, 0) for bar in PROGRESS_BARS},
            "report_path": run.report_path,
        },
        "login": _login(assessment),
        "plan": [{"key": t.key, "label": t.label, "status": task_status(t.key, run)}
                 for t in assessment.plan],
        "scope": _scope(assessment),
        "verdicts": [{
            "method": v.method, "path": v.path, "allowed": v.allowed, "reason": v.reason,
            "at": _iso(v.created_at),
        } for v in assessment.verdicts],
        "approvals": [{
            "request_id": a.request_id, "risk": a.risk, "action": a.action, "target": a.target,
            "method": a.method, "path": a.path, "purpose": a.purpose, "impact": a.impact,
            "command": a.command, "command_hash": a.command_hash,
        } for a in assessment.approvals],
        "decisions": [{
            "request_id": d.request_id, "decision": d.decision, "operator": d.operator,
            "reason": d.reason, "command_hash": d.command_hash, "at": _iso(d.created_at),
        } for d in assessment.decisions],
        "findings": _findings(assessment),
        "timeline": _timeline(assessment),
        "requests": [{"text": r.text, "at": _iso(r.created_at)} for r in assessment.requests],
    })
