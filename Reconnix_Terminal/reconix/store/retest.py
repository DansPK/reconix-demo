"""Retest & trend: compare an assessment to the previous run on the same target.

A pure finding comparison, plus the in-session lookups the report and web dashboard use.
When the backend lands, keep these names and read prior runs from storage (the saved
snapshots) instead of the session's in-memory list.
"""

from typing import Any, Dict, List, Optional

from ..models import Assessment, Finding
from . import lists
from .findings import SEVERITY_ORDER


def finding_key(finding: Finding) -> str:
    """A finding's identity across runs: its title and location, normalized."""
    return f"{finding.title.strip().lower()}::{finding.path.strip().lower()}"


def _revealed(assessment: Assessment) -> List[Finding]:
    shown = set(assessment.run.revealed)
    return [f for f in assessment.findings if f.fid in shown]


def compare_findings(previous: List[Finding],
                     current: List[Finding]) -> Dict[str, List[Finding]]:
    """Split findings into new (only now), recurring (both) and resolved (only before)."""
    prev = {finding_key(f): f for f in previous}
    cur = {finding_key(f): f for f in current}
    return {
        "new": [cur[k] for k in cur if k not in prev],
        "recurring": [cur[k] for k in cur if k in prev],
        "resolved": [prev[k] for k in prev if k not in cur],
    }


def previous_assessment(assessment: Optional[Assessment] = None) -> Optional[Assessment]:
    """The most recent other in-session assessment on the same target, created no later."""
    assessment = assessment or lists.current()
    earlier = [a for a in lists.ASSESSMENTS
               if a is not assessment and a.target_url and a.target_url == assessment.target_url
               and a.created_at <= assessment.created_at]
    return max(earlier, key=lambda a: a.created_at) if earlier else None


def _item(finding: Finding) -> Dict[str, Any]:
    return {"id": finding.fid, "title": finding.title,
            "severity": finding.severity, "category": finding.category}


def retest(assessment: Optional[Assessment] = None) -> Optional[Dict[str, Any]]:
    """Compare the assessment to the previous run on the same target.

    Returns None when there is no earlier run to compare against. Otherwise a dict with
    the previous run's label, the new / recurring / resolved counts, and the finding lists.
    """
    assessment = assessment or lists.current()
    previous = previous_assessment(assessment)
    if previous is None:
        return None
    diff = compare_findings(_revealed(previous), _revealed(assessment))
    return {
        "previous_label": previous.label,
        "counts": {bucket: len(items) for bucket, items in diff.items()},
        "new": [_item(f) for f in diff["new"]],
        "recurring": [_item(f) for f in diff["recurring"]],
        "resolved": [_item(f) for f in diff["resolved"]],
    }


def severity_trend(target_url: Optional[str] = None) -> List[Dict[str, Any]]:
    """Severity counts per in-session assessment on the target, oldest first (for a trend)."""
    target = target_url or lists.current().target_url
    runs = sorted((a for a in lists.ASSESSMENTS if a.target_url and a.target_url == target),
                  key=lambda a: a.created_at)
    trend = []
    for assessment in runs:
        counts = {sev: 0 for sev in SEVERITY_ORDER}
        for finding in _revealed(assessment):
            if finding.severity in counts:
                counts[finding.severity] += 1
        trend.append({
            "label": assessment.label,
            "created_at": assessment.created_at.isoformat(timespec="seconds"),
            "counts": counts, "total": sum(counts.values()),
        })
    return trend
