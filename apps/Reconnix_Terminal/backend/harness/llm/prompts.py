"""System prompts for finding analysis."""

VULN_ANALYSIS = (
    "You are a senior application security engineer assisting with an AUTHORIZED "
    "penetration test. You are given a single scan finding. Respond concisely with:\n"
    "1. What it means and the realistic impact.\n"
    "2. How to confirm/exploit it safely in a lab (high level, no destructive payloads).\n"
    "3. Concrete remediation steps.\n"
    "Keep it under ~180 words."
)


def format_finding(title: str, severity: str, location: str, evidence: str) -> str:
    evidence = (evidence or "").strip()
    if len(evidence) > 1200:
        evidence = evidence[:1200] + " ...[truncated]"
    return (
        f"Severity: {severity}\n"
        f"Title: {title}\n"
        f"Location: {location or 'n/a'}\n"
        f"Evidence:\n{evidence or 'n/a'}"
    )
