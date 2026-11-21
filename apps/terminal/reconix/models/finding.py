"""Normalized findings."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Finding:
    fid: str               # "001"
    severity: str          # CRITICAL | HIGH | MEDIUM | LOW
    title: str
    path: str              # e.g. "/api/orders/{id}"
    validation: str        # CONFIRMED | UNCONFIRMED | INCONCLUSIVE
    description: str
    affected_url: str
    impact: str
    remediation: str
    tool: str
    references: List[str] = field(default_factory=list)
    evidence: List[str] = field(default_factory=list)   # already masked
    evidence_unmasked: List[str] = field(default_factory=list)  # demo-only raw values, shown on "unmask"
    cvss_score: float = 0.0        # CVSS v3.1 base score; 0.0 means "not scored"
    cvss_vector: str = ""          # e.g. "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N"
    category: str = ""             # Web App | API | Network | Secret | Dependency | …
    status: str = "open"           # open | fixed | accepted | false-positive (analyst triage)
    severity_override: str = ""    # analyst-set severity; "" means use the detected one
    triage_note: str = ""          # justification for the status or severity override
    finding_category: str = "INSUFFICIENT_EVIDENCE"
    confidence_level: str = "UNKNOWN"
    evidence_quality: str = "UNKNOWN"
    verification_status: str = "UNKNOWN"
    effective_verification: Optional[Dict[str, Any]] = None
    exploitability: str = "UNKNOWN"
    classification_uncertainty: str = ""
    validation_method: str = ""
    validation_reason: str = ""
    validation_proof: List[str] = field(default_factory=list)
    source_claims: List[str] = field(default_factory=list)

    @property
    def confirmed(self) -> bool:
        return self.display_category == "CONFIRMED_VULNERABILITY"

    @property
    def false_positive(self) -> bool:
        return self.status == "false-positive" or self.finding_category == "FALSE_POSITIVE"

    @property
    def display_category(self) -> str:
        return "FALSE_POSITIVE" if self.false_positive else self.finding_category

    @property
    def needs_review(self) -> bool:
        return self.status == "open" and not self.confirmed and not self.false_positive

    @property
    def effective_severity(self) -> str:
        """The severity to act on: the analyst's override, else the detected one."""
        return self.severity_override or self.severity

    @property
    def cwe(self) -> List[str]:
        """CWE ids pulled out of `references` (e.g. ["CWE-639"])."""
        return [r for r in self.references if r.upper().startswith("CWE-")]

    @property
    def cve(self) -> List[str]:
        """CVE ids pulled out of `references` (e.g. ["CVE-2007-2447"])."""
        return [r for r in self.references if r.upper().startswith("CVE-")]

    @property
    def owasp(self) -> List[str]:
        """OWASP mappings pulled out of `references` (e.g. ["OWASP A01:2021"])."""
        return [r for r in self.references if "OWASP" in r.upper()]
