"""The assessment report: its contents, the formats, and writing it to ./reports/.

Three formats: PDF (printed from the styled HTML report, report_html.py), JSON (exactly
`report_data()`) and DOCX (the editable Word document). Reports never contain the test account.
Evidence is already masked in the findings.
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List

from ..models import AssessmentSummary, ReportFormat
from ..models.base import utc_now
from . import lists
from .activity import log_event
from .approvals import get_approval, list_approval_decisions
from .assessment import get_assessment
from .errors import StoreValidationError
from .findings import confirmed_count, findings_line, list_findings, review_count
from .redact import redact_all
from .report_docx import HAS_DOCX, write_docx
from .report_pdf import HAS_PDF, write_pdf
from .retest import retest
from .scope import blocked_count, get_scope, is_scope_approved, list_verdicts
from .templates import selected_template
from .transcript import add_activity, add_chat

REPORTS_DIR = Path("reports")   # relative to where reconix runs; tests point it elsewhere
SAFE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")

BINARY_FORMATS = {"docx", "pdf"}

REPORT_FORMATS = (
    ReportFormat("pdf", "PDF", "The styled report as a PDF", "pdf", available=HAS_PDF),
    ReportFormat("json", "JSON", "Machine-readable export", "json"),
    ReportFormat("docx", "DOCX", "Editable Word document", "docx", available=HAS_DOCX),
)

REPORT_SECTIONS = (
    "Executive summary", "Methodology", "Evidence and validation results", "References",
    "Approved scope and limitations", "Findings and severity", "Impact and remediation",
)


def list_report_formats() -> List[ReportFormat]:
    return list(REPORT_FORMATS)


def list_report_sections() -> List[str]:
    return list(REPORT_SECTIONS)


def _format(format_id: str) -> ReportFormat:
    fmt = next((f for f in REPORT_FORMATS if f.id == format_id), None)
    if fmt is None:
        raise StoreValidationError(f"Unknown report format {format_id}.")
    if not fmt.available:
        raise StoreValidationError(f"{fmt.name} reports aren't in this demo.")
    return fmt


def _iso(moment) -> str:
    return moment.isoformat(timespec="seconds") if moment else ""


def report_data() -> Dict[str, Any]:
    """Everything a report shows, as plain data (the JSON export is exactly this).

    Every string goes through `redact_all`, like the saved copy, so free text the operator
    typed (a triage note, a tool or path in the scope) can't carry a secret into a report.
    """
    assessment = get_assessment()
    run = lists.current().run
    scope = get_scope()
    template = selected_template()
    approvals = []
    for decision in list_approval_decisions():
        request = get_approval(decision.request_id)
        approvals.append({
            "action": request.action, "target": request.target, "risk": request.risk,
            "decision": decision.decision, "operator": decision.operator,
            "reason": decision.reason, "at": decision.created_at.isoformat(timespec="seconds"),
        })
    return redact_all({
        "assessment_id": assessment.assessment_id,
        "target": assessment.target_url,
        "template": template.name if template else "",
        "client": assessment.client,
        "mode": assessment.mode,
        "operator": assessment.operator,
        "methodology": list(assessment.methodology),
        "report_version": assessment.report_version,
        "window": {"started": _iso(run.started_at), "finished": _iso(run.finished_at)},
        "generated_at": utc_now().isoformat(timespec="seconds"),
        "summary": findings_line(),
        "scope": {
            "approved": is_scope_approved(),
            "kind": scope.kind,
            "allowed_actions": list(scope.allowed_actions),
            "allowed_methods": list(scope.allowed_methods),
            "excluded_paths": list(scope.excluded_paths),
            "allowed_ports": list(scope.allowed_ports),   # network scopes only
            "time_limit_minutes": scope.time_limit_minutes,
            "tools": list(scope.tools),
        },
        "blocked_requests": [
            {"request": f"{v.method} {v.path}", "reason": v.reason}
            for v in list_verdicts() if not v.allowed
        ],
        "approvals": approvals,
        "findings": [
            {
                "id": f.fid, "severity": f.severity, "title": f.title, "path": f.path,
                "validation": f.validation, "description": f.description,
                "affected_url": f.affected_url, "evidence": list(f.evidence),
                "impact": f.impact, "references": list(f.references),
                "remediation": f.remediation, "tool": f.tool,
                "cvss_score": f.cvss_score, "cvss_vector": f.cvss_vector,
                "category": f.category, "cwe": f.cwe, "owasp": f.owasp, "cve": f.cve,
                "status": f.status, "severity_override": f.severity_override,
                "effective_severity": f.effective_severity, "triage_note": f.triage_note,
            }
            for f in list_findings()
        ],
        "retest": retest(),
        "sections": list(REPORT_SECTIONS),
    })


def _display_path(path: Path) -> str:
    return str(path) if path.is_absolute() else f"./{path.as_posix()}"


def _report_path(assessment_id: str, extension: str) -> Path:
    """REPORTS_DIR/<id>.<ext>, refusing any id that could leave the folder."""
    if not SAFE_NAME.fullmatch(assessment_id):
        raise StoreValidationError("The assessment id can't be used as a file name.")
    folder = REPORTS_DIR.resolve()
    path = (folder / f"{assessment_id}.{extension}").resolve()
    if path.parent != folder:
        raise StoreValidationError("Reports can only be saved in the reports folder.")
    return REPORTS_DIR / path.name


def _render_json(data: Dict[str, Any]) -> str:
    """The JSON report: exactly `report_data()`."""
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def generate_report(format_id: str) -> str:
    """Write the report and return its path as shown to the operator."""
    run = lists.current().run
    if not run.completed:
        raise StoreValidationError("The report is available once the assessment is complete.")
    fmt = _format(format_id)
    data = report_data()
    path = _report_path(data["assessment_id"], fmt.extension)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    if fmt.id in BINARY_FORMATS:
        (write_pdf if fmt.id == "pdf" else write_docx)(data, path)
    else:
        path.write_text(_render_json(data), encoding="utf-8")
    shown = _display_path(path)
    run.report_path = shown
    run.progress["report"] = 100
    add_activity("USER", f"Report format: {fmt.name}")
    add_activity("SYS", f"Report saved · {shown}", tone="ok")
    add_chat("text", "reconix", f"Report saved: {shown}.", tone="ok")
    log_event("report.generated", shown)
    return shown


def assessment_summary() -> AssessmentSummary:
    run = lists.current().run
    assessment = get_assessment()
    approvals = ["scope"] if is_scope_approved() else []
    for decision in list_approval_decisions():
        if decision.decision == "APPROVED":
            approvals.append(get_approval(decision.request_id).risk)
    return AssessmentSummary(
        assessment_id=assessment.assessment_id or assessment.planned_id,
        target=assessment.target,
        status="Stopped" if run.stopped else "Completed" if run.completed else "Running",
        blocked=blocked_count(),
        confirmed=confirmed_count(),
        for_review=review_count(),
        report_path=run.report_path,
        approvals=approvals,
    )
