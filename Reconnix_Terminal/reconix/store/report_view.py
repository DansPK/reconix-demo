"""What the PDF (report_html.py) and the Word report (report_docx.py) both show, as plain text.

One outline for both, from the same `report.report_data()`: the section headings and their
order, the cover rows, the summary sentence, the severity counts, the findings in severity
order, the scope rows, the governance rows and the fixed notes. The writers only decide how it
looks (HTML escapes it, python-docx writes it), so the two documents never disagree.
"""

from typing import Any, Dict, List, Tuple

# Severity ranked high-to-low; used for ordering and the counts.
SEV_ORDER = ("CRITICAL", "HIGH", "MEDIUM", "LOW")
STATUS_LABEL = {"open": "Open", "fixed": "Fixed", "accepted": "Accepted",
                "false-positive": "False+"}

TITLE = "Security Assessment Report"
CONFIDENTIAL = "CONFIDENTIAL — AUTHORIZED RECIPIENTS ONLY"
GENERATED_NOTE = ("AI-guided assessment; the policy engine, approvals and vault are "
                  "deterministic. Credentials and one-time codes are never stored or shown, and "
                  "evidence is masked at the source.")
DISCLAIMER = ("Testing was limited to the approved actions, methods and time window. Requests to "
              "an excluded path or outside the allowed methods were refused by the policy engine "
              "rather than sent. Findings reflect only what was observed under these constraints.")
FOOTER_TOOL = "Reconix — AI-Powered Security Testing Assistant"

# The numbered sections, in the PDF's order (the retest panel, when there is one, sits between
# the findings summary and the scope, unnumbered).
SECTIONS = (
    ("1", "Executive summary"),
    ("2", "Findings summary"),
    ("3", "Approved scope & limitations"),
    ("4", "Detailed findings"),
    ("5", "Policy & governance"),
)
RETEST_HEADING = "Changes since last assessment"
FINDINGS_HEAD = ("ID", "Finding", "Severity", "CVSS", "Status", "Category")
BLOCKED_HEAD = ("Request", "Reason")
APPROVALS_HEAD = ("Risk", "Action", "Target", "Decision", "Analyst")
NO_FINDINGS_ROW = "No findings were recorded."
NO_BLOCKED = "No requests were blocked."
NO_APPROVALS = "No gated actions were required."

# A piece of the summary sentence: (text, bold).
Segment = Tuple[str, bool]


def section(number: str) -> str:
    """The heading of a numbered section (`section("2")` → "Findings summary")."""
    return dict(SECTIONS)[number]


def short_date(value: Any) -> str:
    """The date part of an ISO timestamp (2026-10-05T05:24:33+00:00 -> 2026-10-05)."""
    return str(value).split("T", 1)[0] if value else "—"


def window(data: Dict[str, Any]) -> str:
    """The engagement window as a date or date range, from the run's timestamps."""
    span = data.get("window") or {}
    start, end = short_date(span.get("started")), short_date(span.get("finished"))
    if start == "—" and end == "—":
        return "Time-boxed"
    return start if start == end else f"{start} → {end}"


def cvss(finding: Dict[str, Any]) -> str:
    """The CVSS base score as text, or an em dash when the finding is not scored."""
    score = finding.get("cvss_score") or 0
    return f"{score:.1f}" if score else "—"


def sev_rank(severity: str) -> int:
    try:
        return SEV_ORDER.index(severity.upper())
    except ValueError:
        return len(SEV_ORDER)


def ordered(findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The findings worst first, then by id: the order of every list in the report."""
    return sorted(findings, key=lambda f: (sev_rank(f["severity"]), f["id"]))


def counts(findings: List[Dict[str, Any]]) -> Dict[str, int]:
    tally = {sev: 0 for sev in SEV_ORDER}
    for finding in findings:
        sev = finding["severity"].upper()
        if sev in tally:
            tally[sev] += 1
    return tally


def count_columns(findings: List[Dict[str, Any]]) -> List[Tuple[str, int]]:
    """The severity tiles (the four severities), then the total."""
    tally = counts(findings)
    cols = [(sev.title(), tally[sev]) for sev in SEV_ORDER]
    return cols + [("Total", len(findings))]


def distribution(findings: List[Dict[str, Any]]) -> List[Tuple[str, int, int]]:
    """(severity, count, percent) for each severity present, worst first."""
    tally = counts(findings)
    total = len(findings) or 1
    return [(sev, tally[sev], round(100 * tally[sev] / total)) for sev in SEV_ORDER if tally[sev]]


def status_label(finding: Dict[str, Any]) -> str:
    state = finding.get("status") or "open"
    return STATUS_LABEL.get(state, state)


def cover_rows(data: Dict[str, Any]) -> List[Tuple[str, str]]:
    return [
        ("Client", data.get("client") or "—"),
        ("Engagement ID", data.get("assessment_id") or "—"),
        ("Assessment window", window(data)),
        ("Report date", short_date(data.get("generated_at"))),
        ("Assessment type", data.get("mode") or "—"),
        ("Report version", f"{data.get('report_version') or '1.0'} — Final"),
    ]


def subtitle(data: Dict[str, Any]) -> str:
    template = data.get("template") or "Security assessment"
    return f"AI-Assisted Authorized Penetration Test — {template}"


def summary(data: Dict[str, Any]) -> List[Segment]:
    """The executive summary's sentence, in pieces (the bold ones are stressed)."""
    findings = ordered(data.get("findings", []))
    tally = counts(findings)
    high_sev = next((sev for sev in SEV_ORDER if tally[sev]), "NONE")
    parts = [f"{tally[sev]} {sev.title()}" for sev in SEV_ORDER if tally[sev]]
    breakdown = ", ".join(parts) if parts else "no findings"
    out: List[Segment] = [
        ("Reconix performed an authorized assessment of ", False),
        (data.get("target") or "the target", True),
        (f" ({data.get('template') or 'assessment'}). It recorded ", False),
        (f"{len(findings)} finding(s)", True),
        (f" — {breakdown}. The highest severity is ", False),
        (high_sev.title(), True),
    ]
    if findings:
        out += [(", led by ", False), (findings[0]["title"], True)]
    out.append((
        f". {len(data.get('blocked_requests', []))} out-of-scope request(s) were blocked by "
        f"policy and {len(data.get('approvals', []))} gated action(s) were approved by a human. "
        "Intrusive actions ran only after explicit, single-use approval.", False))
    return out


def finding_row(finding: Dict[str, Any]) -> List[str]:
    """A row of the findings summary (FINDINGS_HEAD)."""
    return [finding["id"], finding["title"], finding["severity"].title(), cvss(finding),
            status_label(finding), finding.get("category") or "—"]


def finding_meta(finding: Dict[str, Any]) -> List[Tuple[str, str]]:
    """The facts under a finding's title in the detailed findings."""
    maps = (list(finding.get("owasp", [])) + list(finding.get("cwe", []))
            + list(finding.get("cve", [])))
    rows = [
        ("Affected asset", finding.get("affected_url") or "—"),
        ("Location", finding.get("path") or "—"),
        ("Category", finding.get("category") or "—"),
        ("Detected by", finding.get("tool") or "—"),
        ("Mapping", ", ".join(maps) or "—"),
    ]
    if finding.get("cvss_vector"):
        rows.append(("CVSS vector", finding["cvss_vector"]))
    return rows


def scope_rows(data: Dict[str, Any]) -> List[Tuple[str, str]]:
    """The approved scope, in the PDF's order (the ports only for a network scope)."""
    scope = data["scope"]
    rows = [
        ("Approval status", "Approved" if scope.get("approved") else "Not approved"),
        ("Standards", " · ".join(data.get("methodology", [])) or "—"),
        ("Allowed actions", ", ".join(scope.get("allowed_actions", [])) or "—"),
        ("Allowed methods", ", ".join(scope.get("allowed_methods", [])) or "—"),
        ("Excluded paths", ", ".join(scope.get("excluded_paths", [])) or "none"),
    ]
    if scope.get("allowed_ports"):
        rows.append(("Allowed ports", ", ".join(str(p) for p in scope["allowed_ports"])))
    rows += [
        ("Time limit", f"{scope.get('time_limit_minutes', 0)} minutes"),
        ("Tools", ", ".join(scope.get("tools", [])) or "—"),
    ]
    return rows


def blocked_rows(data: Dict[str, Any]) -> List[List[str]]:
    return [[b["request"], b["reason"]] for b in data.get("blocked_requests", [])]


def approval_rows(data: Dict[str, Any]) -> List[List[str]]:
    return [[a["risk"].title(), a["action"], a["target"], a["decision"].title(),
             a.get("operator") or "—"] for a in data.get("approvals", [])]


def footers(data: Dict[str, Any]) -> Tuple[str, str]:
    """The first page's footer and the last page's."""
    engagement = data.get("assessment_id") or "—"
    generated = short_date(data.get("generated_at"))
    return (f"Confidential · {engagement} · Generated {generated}",
            f"{engagement} · End of report")
