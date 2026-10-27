"""Web URL template: a web application reached over HTTP(S)."""

from ...models import Finding, ScopeManifest, Template
from ...models.parser import ParsedTarget
from .base import RunBundle, RunProfile, approval, build_rest, make_plan

SPEC = Template("web_url", "Web URL", "Web application at a URL",
                target_hint="the site's URL", example="https://shop.example.com")


def build_scope(parsed: ParsedTarget) -> ScopeManifest:
    return ScopeManifest(
        kind="web_url", target_url=parsed.target_url, assessment_type="Web URL",
        allowed_actions=["Discovery", "vulnerability scanning", "limited validation"],
        allowed_methods=["GET", "POST"],
        excluded_paths=["/admin"],
        time_limit_minutes=30,
        tools=["Nuclei", "OWASP ZAP"],
    )


def _findings(url: str) -> list:
    return [
        Finding(
            "001", "MEDIUM", "Broken object-level authorization", "/api/orders/{id}", "CONFIRMED",
            description="An order record owned by test account B was returned to test account A.",
            affected_url=f"{url}/api/orders/10483",
            impact="Users could read other customers' order details.",
            remediation="Enforce server-side ownership checks on every order lookup.",
            tool="OWASP ZAP",
            references=["OWASP A01:2021", "OWASP API1:2023", "CWE-639"],
            cvss_score=6.5, cvss_vector="CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N",
            category="Web App",
            evidence=["HTTP 200 · order_id: 10483",
                      "owner: usr_••••42 · email: b•••@example.com",
                      "token: •••••••••• (masked)"],
        ),
        Finding(
            "002", "MEDIUM", "Reflected input in search page", "/search", "UNCONFIRMED",
            description="A marker string sent in the q parameter came back unencoded in the page.",
            affected_url=f"{url}/search?q=",
            impact="May allow cross-site scripting if the reflection is exploitable.",
            remediation="Apply context-aware output encoding and a strict Content-Security-Policy.",
            tool="Nuclei", references=["OWASP A03:2021", "CWE-79"],
            cvss_score=6.1, cvss_vector="CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
            category="Web App",
            evidence=["GET /search?q=rcx-marker-7 → marker reflected in body (unencoded)"],
        ),
        Finding(
            "003", "LOW", "Session cookie missing SameSite", "/login", "INCONCLUSIVE",
            description="The session cookie set at login has no SameSite attribute.",
            affected_url=f"{url}/login",
            impact="Weakens protection against cross-site request forgery.",
            remediation="Set SameSite=Lax (or Strict) on the session cookie.",
            tool="OWASP ZAP", references=["OWASP A05:2021", "CWE-1275"],
            cvss_score=3.1, cvss_vector="CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N",
            category="Web App",
            evidence=["Set-Cookie: session=••••••••; Secure; HttpOnly"],
        ),
    ]


def build_run(assessment) -> RunBundle:
    url, host = assessment.target_url, assessment.target
    scope = build_scope(ParsedTarget("web_url", host, url, "web application", "web_url", True))
    findings = _findings(url)
    profile = RunProfile(
        target_kind="web application", tools=scope.tools,
        discovery_tool="OWASP ZAP",
        discovery_card=("Discovery · $tool",
                        (("Public pages", "18"), ("Forms", "4"), ("API endpoints", "6"))),
        discovery_requests=(312, 241),
        blocked=("GET", "/admin"),
        scan_card=("Scan · $tools",
                   (("Potential issues", "3"), ("Needs login", "/api/orders/*"))),
        scan_requests=(387, 166, 94),
        login_area="/api/orders/*",
        login_2fa=True,                    # the demo target sends a code after the password
        candidate_note="Suspected issue on /api/orders/{id}: possible missing object-level "
                       "access check. Proposing limited validation.",
        candidate_log="Candidate F-001 · access control",
        medium=approval(
            "approval-001", risk="MEDIUM", action="Baseline request (read-only)",
            target="GET {path}", method="GET", path="/api/orders/10482", param="Path",
            purpose="Record the normal response for the test account's own order",
            impact="Low. One read request, no data changes",
            command=f"GET {url}{{path}} as test account A"),
        high=approval(
            "approval-002", risk="HIGH", action="limited_validation",
            target="GET {path} (test account B)", method="GET",
            path="/api/orders/10483", param="Path",
            purpose="Check if account A can read an order owned by account B",
            impact="May read synthetic test data. 1 request, no changes",
            command=f"GET {url}{{path}} as test account A"),
        findings=findings,
        analysis_steps=("Analyzing results", "Retrieving relevant OWASP and CWE guidance",
                        "Correlating duplicate findings", "Masking sensitive evidence"),
        plan=(("discovery", "Crawl & map endpoints"),
              ("scanning", "Scan for vulnerabilities"),
              ("validation", "Validate access controls"),
              ("analysis", "Correlate & dedupe findings"),
              ("report", "Generate report")),
        methodology=("OWASP WSTG", "OWASP Top 10 (2021)"),
    )
    return RunBundle(scope=scope, script=build_rest(profile),
                     approvals=[profile.medium, profile.high], findings=findings,
                     login_2fa=profile.login_2fa, plan=make_plan(profile.plan),
                     methodology=list(profile.methodology))
