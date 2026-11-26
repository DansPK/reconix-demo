"""Source Code template: a static review of a repository."""

from ...models import Finding, ScopeManifest, Template
from ...models.parser import ParsedTarget
from . import lumina
from .base import RunBundle, RunProfile, approval, build_rest, make_plan

TOOLS = ["Semgrep", "gitleaks", "trivy", "grype", "osv-scanner", "syft"]
PHASE_TOOLS = {
    'scanning': ('Semgrep', 'gitleaks', 'trivy', 'grype', 'osv-scanner', 'syft'),
    'validation': ('Semgrep',),
}

SPEC = Template("source", "Source Code", "Static review of a repository",
                target_hint="a git repo URL or a local path",
                example="https://git.lumina.com/lumina/app.git")


def build_scope(parsed: ParsedTarget) -> ScopeManifest:
    return ScopeManifest(
        kind="source", target_url=parsed.target_url, assessment_type="Source Code",
        allowed_actions=["Dependency scan", "secret scan", "static analysis"],
        allowed_methods=["read"],
        excluded_paths=[".git", "node_modules", "vendor", "secrets"],
        time_limit_minutes=0,  # no limit unless the operator sets one
        tools=list(TOOLS),
    )


def _findings(ref: str) -> list:
    return [
        Finding(
            "001", "HIGH", "Hardcoded database password", "app/config/settings.py", "CONFIRMED",
            description="A database password is committed in plaintext in the settings module.",
            affected_url=f"{ref} · app/config/settings.py:42",
            impact="Anyone with repo access gets production database credentials.",
            remediation="Load secrets from the environment or a secret manager; rotate the key.",
            tool="gitleaks", references=["CWE-798", "OWASP A07:2021"],
            cvss_score=7.5, cvss_vector="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
            category="Secret",
            evidence=["settings.py:42  DB_PASSWORD = \"••••••••••••\"  (masked)"],
        ),
        Finding(
            "002", "MEDIUM", "SQL built by string concatenation", "app/db/queries.py",
            "UNCONFIRMED",
            description="A query is assembled with f-strings from a request parameter.",
            affected_url=f"{ref} · app/db/queries.py:88",
            impact="May allow SQL injection if the parameter is attacker-controlled.",
            remediation="Use parameterized queries / an ORM binding instead of string building.",
            tool="Semgrep", references=["CWE-89", "OWASP A03:2021"],
            cvss_score=6.3, cvss_vector="CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:L",
            category="Source Code",
            evidence=["queries.py:88  f\"SELECT * FROM orders WHERE id = {order_id}\""],
        ),
        Finding(
            "003", "LOW", "Vulnerable dependency", "requirements.txt", "INCONCLUSIVE",
            description="A pinned dependency has a known advisory in this version.",
            affected_url=f"{ref} · requirements.txt",
            impact="The known issue may be reachable depending on how the library is used.",
            remediation="Upgrade to the patched release and re-run the dependency scan.",
            tool="osv-scanner", references=["CWE-1104"],
            cvss_score=3.7, cvss_vector="CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N",
            category="Dependency",
            evidence=["requests==2.19.1  → advisory GHSA-•••• (upgrade advised)"],
        ),
    ]


def build_run(assessment) -> RunBundle:
    ref = assessment.target
    scope = build_scope(ParsedTarget("source", ref, ref, "source repository", "source", True))
    findings = _findings(ref)
    profile = RunProfile(
        target_kind="source repository", tools=scope.tools,
        discovery_tool="Semgrep",
        discovery_card=("Discovery · repository",
                        (("Files", "312"), ("Languages", "Python, JS"), ("Dependencies", "48"))),
        discovery_requests=(0, 0),
        blocked=("read", ".git/config"),
        scan_card=("Scan · $tools",
                   (("Potential issues", "3"), ("Secrets flagged", "1"))),
        scan_requests=(0, 0, 0),
        candidate_note="A hardcoded credential was flagged in app/config/settings.py. Proposing "
                       "a controlled read to review the masked evidence; "
                       "credential validity remains unknown.",
        candidate_log="Candidate F-001 · hardcoded secret",
        medium=approval(
            "approval-001", risk="MEDIUM", action="Read the flagged line (read-only)",
            target="read {path}:42", method="read", path="app/config/settings.py",
            param="File",
            purpose="Confirm the flagged line is a credential, not a false positive",
            impact="Low. Reads one file in the repo, changes nothing",
            command="read {path} lines 40-44"),
        high=approval(
            "approval-002", risk="HIGH", action="secret_validation",
            target="review the masked credential evidence in {path}", method="read",
            path="app/config/settings.py", param="File",
            purpose="Review the source evidence without trying the credential",
            impact="Offline source review only; credential validity is not tested",
            command="review the masked credential evidence in {path} offline"),
        findings=findings,
        analysis_steps=("Analyzing results", "Matching dependencies to advisories",
                        "Correlating duplicate findings", "Masking sensitive evidence"),
        scan_tool="Semgrep",
        plan=(("discovery", "Inventory the code"),
              ("scanning", "Static, secret & dependency scans"),
              ("validation", "Review findings"),
              ("analysis", "Correlate & dedupe findings"),
              ("report", "Generate report")),
        methodology=("OWASP ASVS", "CWE Top 25"),
    )
    profile = lumina.for_target("source", ref, ref, profile)
    return RunBundle(scope=scope, script=build_rest(profile),
                     approvals=[profile.medium, profile.high], findings=profile.findings,
                     plan=make_plan(profile.plan, PHASE_TOOLS),
                     methodology=list(profile.methodology))
