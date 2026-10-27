"""The Findings list's view: filters, sort orders and the counts the screens show.

A backend would take the filter and sort as query parameters. Severity here is the
effective one (an analyst's override wins over the detected severity).
"""

from typing import Dict, List, Tuple

from ..models import Finding
from .errors import StoreValidationError
from .findings import SEVERITY_ORDER, list_findings

FINDING_FILTERS: Tuple[Tuple[str, str], ...] = (
    ("all", "All findings"),
    ("high_up", "Critical & High"),
    ("medium", "Medium"),
    ("low", "Low"),
    ("confirmed", "Confirmed"),
    ("needs_review", "Needs review"),
    ("open", "Open (not triaged)"),
    ("triaged", "Triaged"),
)
FINDING_SORTS: Tuple[Tuple[str, str], ...] = (
    ("severity", "severity"),
    ("validation", "validation"),
)
VALIDATION_ORDER = ("CONFIRMED", "UNCONFIRMED", "INCONCLUSIVE")


def _matches(filter_id: str, finding: Finding) -> bool:
    severity = finding.effective_severity
    if filter_id == "high_up":
        return severity in ("CRITICAL", "HIGH")
    if filter_id in ("medium", "low"):
        return severity == filter_id.upper()
    if filter_id == "confirmed":
        return not finding.needs_review
    if filter_id == "needs_review":
        return finding.needs_review
    if filter_id == "open":
        return finding.status == "open"
    if filter_id == "triaged":
        return finding.status != "open"
    return True


def _severity_rank(finding: Finding) -> int:
    return SEVERITY_ORDER.index(finding.effective_severity)


def find_findings(filter_id: str = "all", sort_id: str = "severity") -> List[Finding]:
    """The revealed findings matching a filter, in a stable sort order."""
    if filter_id not in dict(FINDING_FILTERS):
        raise StoreValidationError(f"Unknown filter {filter_id}.")
    if sort_id not in dict(FINDING_SORTS):
        raise StoreValidationError(f"Unknown sort {sort_id}.")
    rows = [f for f in list_findings() if _matches(filter_id, f)]
    if sort_id == "validation":
        rows.sort(key=lambda f: VALIDATION_ORDER.index(f.validation)
                  if f.validation in VALIDATION_ORDER else len(VALIDATION_ORDER))
    else:
        rows.sort(key=_severity_rank)
    return rows


def filter_label(filter_id: str) -> str:
    return dict(FINDING_FILTERS).get(filter_id, filter_id)


def sort_label(sort_id: str) -> str:
    return dict(FINDING_SORTS).get(sort_id, sort_id)


def filter_counts() -> Dict[str, int]:
    return {fid: len(find_findings(fid)) for fid, _ in FINDING_FILTERS}


def severity_counts() -> Dict[str, int]:
    counts = {severity: 0 for severity in SEVERITY_ORDER}
    for finding in list_findings():
        counts[finding.effective_severity] += 1
    return counts


def key_findings(limit: int = 4) -> List[Finding]:
    """The findings highlighted in the report: most severe first."""
    return find_findings("all", "severity")[:limit]
