"""Network template: hosts, ports and exposed services on a range or host."""

import ipaddress
from typing import List, NamedTuple, Tuple

from ...models import ApprovalRequest, Finding, ScopeManifest, Template
from ...models.parser import ParsedTarget
from ..errors import StoreValidationError
from ..targets import as_network
from .base import RunBundle, RunProfile, approval, build_rest, make_plan

SPEC = Template("network", "Network", "Hosts, ports, and exposed services",
                target_hint="an IPv4 address or range, or a hostname", example="10.0.0.0/24")

ALLOWED_PORTS = [22, 80, 443, 8080, 8443]

# Hosts outside any range the run is given (RFC 5737), for the probe the policy blocks.
OUTSIDE_HOSTS = ("198.51.100.9", "203.0.113.9")


class Ports(NamedTuple):
    """The ports the demo services answer on, all from the allowed list.

    With few ports allowed, several services share one (only port 80 allowed: the console,
    TLS and SSH findings are all on 80). Odd for a real host, but never outside the scope.
    """

    console: int
    tls: int
    ssh: int


def build_scope(parsed: ParsedTarget) -> ScopeManifest:
    return ScopeManifest(
        kind="network", target_url=parsed.target_url, assessment_type="Network",
        allowed_actions=["Host discovery", "port scan", "service detection"],
        allowed_methods=["TCP connect"],
        excluded_paths=[],       # network scope uses allowed_ports + the target range
        time_limit_minutes=30,
        tools=["nmap", "testssl.sh"],
        allowed_ports=list(ALLOWED_PORTS),
    )


# --- where the demo services are ---------------------------------------------------------
def sample_host(target: str) -> str:
    """The host the findings are on: the target itself, or a range's first usable host."""
    network = as_network(target)
    if network is None:
        return target                                   # a hostname
    if network.num_addresses == 1:
        return str(network.network_address)
    return str(next(network.hosts()))


def outside_host(target: str) -> str:
    """A host outside the target, so the policy has something to block."""
    network = as_network(target)
    for host in OUTSIDE_HOSTS:
        if network is None or ipaddress.ip_address(host) not in network:
            return host
    # Only a range far wider than targets.WIDEST_RANGE allows holds both.
    raise StoreValidationError(f"{target} is too wide to test.")


def pick_ports(allowed: List[int]) -> Ports:
    """The usual service ports when `allowed` has them, else its first port.

    `allowed`: the ports the operator named, then the approved scope's. Empty means the
    template's own list.
    """
    allowed = list(allowed) or ALLOWED_PORTS

    def pick(preferred: int) -> int:
        return preferred if preferred in allowed else allowed[0]

    return Ports(console=pick(8443), tls=pick(443), ssh=pick(22))


def _findings(host: str, ports: Ports) -> list:
    console, tls, ssh = ports
    return [
        Finding(
            "001", "HIGH", "Management console exposed", f"{host}:{console}/manager",
            "CONFIRMED",
            description=f"A Tomcat Manager console answered on {console} and accepted a "
                        "login form.",
            affected_url=f"https://{host}:{console}/manager",
            impact="If credentials are weak, an attacker could deploy code to the host.",
            remediation="Restrict the console to an admin network or disable it.",
            tool="nmap", references=["CWE-284", "OWASP A05:2021"],
            cvss_score=7.3, cvss_vector="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L",
            category="Network",
            evidence=[f"{console}/tcp open ssl/http Apache Tomcat",
                      "GET /manager/html → 401 WWW-Authenticate: Basic"],
        ),
        Finding(
            "002", "MEDIUM", "Deprecated TLS 1.0 offered", f"{host}:{tls}", "UNCONFIRMED",
            description="The HTTPS service still negotiates TLS 1.0.",
            affected_url=f"https://{host}:{tls}",
            impact="Weak protocol versions expose traffic to downgrade attacks.",
            remediation="Disable TLS 1.0/1.1 and prefer TLS 1.2+ with modern ciphers.",
            tool="testssl.sh", references=["CWE-327"],
            cvss_score=5.9, cvss_vector="CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N",
            category="Network",
            evidence=["TLS 1.0   offered (NOT ok)", "TLS 1.2   offered (OK)"],
        ),
        Finding(
            "003", "LOW", "SSH banner reveals version", f"{host}:{ssh}", "INCONCLUSIVE",
            description="The SSH service banner discloses its exact version.",
            affected_url=f"{host}:{ssh}",
            impact="Version disclosure helps an attacker match known exploits.",
            remediation="Suppress the detailed banner where the SSH server allows it.",
            tool="nmap", references=["CWE-200"],
            cvss_score=3.7, cvss_vector="CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N",
            category="Network",
            evidence=[f"{ssh}/tcp open ssh OpenSSH 8.2p1 (banner shown)"],
        ),
    ]


def _approvals(host: str, ports: Ports) -> Tuple[ApprovalRequest, ApprovalRequest]:
    console = f"{host}:{ports.console}"
    medium = approval(
        "approval-001", risk="MEDIUM", action="Banner and TLS check (read-only)",
        target="TCP {path}", method="TCP", path=console, param="Host:port",
        purpose="Record the service banner and TLS versions on the console port",
        impact="Low. Connects once, sends no credentials",
        command="connect {path} · read banner + TLS")
    high = approval(
        "approval-002", risk="HIGH", action="single_login_probe",
        target="TCP {path}/manager", method="TCP", path=console, param="Host:port",
        purpose="Try one known default credential against the management console",
        impact="One authentication attempt. No change to the host",
        command="POST {path}/manager/html · one default credential")
    return medium, high


def align_to_scope(assessment) -> None:
    """Rebuild the findings and approvals on the approved ports (see templates.align_to_scope)."""
    host = sample_host(assessment.target)
    ports = pick_ports(assessment.scope.allowed_ports)
    findings = {f.fid: f for f in _findings(host, ports)}
    approvals = {a.request_id: a for a in _approvals(host, ports)}
    assessment.findings = [findings.get(f.fid, f) for f in assessment.findings]
    assessment.approvals = [approvals.get(a.request_id, a) for a in assessment.approvals]


def build_run(assessment) -> RunBundle:
    target = assessment.target
    scope = build_scope(ParsedTarget("network", target, target, "network range", "network",
                                     True))
    host = sample_host(target)
    ports = pick_ports(assessment.requested_ports)
    findings = _findings(host, ports)
    medium, high = _approvals(host, ports)
    profile = RunProfile(
        target_kind="network range", tools=scope.tools,
        discovery_tool="nmap",
        discovery_card=("Discovery · $tool",
                        (("Live hosts", "6"), ("Open ports", "11"), ("Services", "7"))),
        discovery_requests=(0, 0),
        blocked=("TCP", outside_host(target)),
        scan_card=("Services · $tool",
                   (("Web", "2"), ("SSH", "1"), ("Management console", "1"))),
        scan_requests=(0, 0, 0),
        candidate_note="The management console may accept weak credentials. Proposing a "
                       "single, controlled login check.",
        candidate_log="Candidate F-001 · exposed console",
        medium=medium,
        high=high,
        findings=findings,
        analysis_steps=("Analyzing results", "Matching services to known CVEs",
                        "Correlating duplicate findings", "Masking sensitive evidence"),
        scan_tool="nmap",
        plan=(("discovery", "Host discovery"),
              ("scanning", "Port & service scan"),
              ("validation", "Validate exposures"),
              ("analysis", "Correlate & dedupe findings"),
              ("report", "Generate report")),
        methodology=("NIST SP 800-115", "PTES"),
    )
    return RunBundle(scope=scope, script=build_rest(profile),
                     approvals=[profile.medium, profile.high], findings=findings,
                     plan=make_plan(profile.plan), methodology=list(profile.methodology))
