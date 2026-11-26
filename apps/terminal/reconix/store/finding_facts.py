"""Fabricated classification and bounded proof for the scripted assessment fixtures.

Only explicitly authored evidence earns verification. A scanner claim, dependency
fingerprint or source-code pattern never establishes runtime exploitability.
"""

from typing import List

from ..models import Finding

# These fixture records contain direct response/handshake comparisons, not just tool claims.
_VERIFIED = {
    "web_url": {"001": "manual_review", "004": "http_response_comparison"},
    "api": {"001": "authorization_comparison"},
    "network": {"001": "http_response_comparison", "002": "tls_handshake"},
    "source": {},
}


def classify_fixtures(template: str, findings: List[Finding], target: str = "") -> None:
    """Attach current backend-shaped facts to authored fixtures in the store only."""
    from .templates.lumina import has_story     # here: templates imports this module

    own_story = has_story(template, target)
    for finding in findings:
        finding.source_claims = [f"{finding.tool}: {finding.title}"]
        if own_story:       # its facts follow the authored validation, not the built-in ids
            method = ("manual_review" if finding.validation == "CONFIRMED" and template != "source"
                      else "")
        else:
            method = _VERIFIED.get(template, {}).get(finding.fid)
        if method:
            finding.finding_category = "CONFIRMED_VULNERABILITY"
            finding.confidence_level = "HIGH"
            finding.evidence_quality = "HIGH"
            finding.verification_status = "CONFIRMED"
            finding.exploitability = "DEMONSTRATED"
            finding.validation_method = method
            finding.validation_reason = "The recorded comparison demonstrates the reported behavior."
            # Keep proof bounded and masked. The fabricated customer table remains solely
            # in the existing evidence/reveal fields, never in a new proof field.
            finding.validation_proof = list(finding.evidence[:2])
            finding.effective_verification = {
                "status": "VERIFIED", "verifier": method,
                "subject": {"label": finding.path},
                "proof_lines": list(finding.validation_proof),
                "legacy": False,
            }
        elif not own_story and template == "web_url" and finding.fid == "003":
            finding.finding_category = "SECURITY_HARDENING_RECOMMENDATION"
            finding.confidence_level = "MEDIUM"
            finding.evidence_quality = "MEDIUM"
            finding.verification_status = "INCONCLUSIVE"
            finding.validation_reason = "Cookie attributes were recorded; exploitability was not established."
            finding.effective_verification = {
                "status": "INCONCLUSIVE", "reason": finding.validation_reason,
                "proof_lines": [], "legacy": False,
            }
        else:
            finding.finding_category = "POTENTIAL_VULNERABILITY"
            finding.confidence_level = "MEDIUM"
            finding.evidence_quality = "MEDIUM"
            finding.verification_status = "UNCONFIRMED"
            finding.exploitability = "PLAUSIBLE"
            finding.classification_uncertainty = (
                "Source patterns require review; runtime reachability was not tested."
                if template == "source" else
                "The scanner observation requires an independent validation step."
            )
            finding.validation_reason = finding.classification_uncertainty
            finding.effective_verification = {
                "status": "UNVERIFIED", "reason": finding.validation_reason,
                "proof_lines": [], "legacy": False,
            }
