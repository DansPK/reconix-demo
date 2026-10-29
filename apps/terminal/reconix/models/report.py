"""Report formats and the end-of-run summary."""

from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class ReportFormat:
    id: str
    name: str
    description: str
    extension: str
    available: bool = True    # False: shown dimmed "(not in demo)"


@dataclass
class AssessmentSummary:
    assessment_id: str
    target: str
    status: str               # "Completed" | "Stopped"
    blocked: int
    confirmed: int
    for_review: int
    report_path: str          # "" until a report is saved
    approvals: List[str] = field(default_factory=list)   # e.g. ["scope", "MEDIUM", "HIGH"]
