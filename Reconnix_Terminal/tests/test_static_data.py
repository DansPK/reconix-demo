"""The demo data each template plays, checked for every kind of target it accepts.

Every template is run to the end on its usual targets and on the edge cases the operator
can type (a range, a range that holds the probe host, a local path, a git URL, named ports
and tools). The data must stay valid, in scope, honest about its tools and CVSS scores,
reserved for documentation, and free of the test password.
"""

import ipaddress
import json
import re

import pytest

from reconix import store
from reconix.models.parser import ParsedTarget
from reconix.store import lists
from reconix.store.approvals import command_digest
from reconix.store.findings_view import VALIDATION_ORDER
from reconix.store.parser import TOOL_NAMES
from reconix.store.snapshot import snapshot
from reconix.store.templates import MODULES
from reconix.store.templates.network import outside_host, pick_ports, sample_host
from reconix.store.tools import approved_tool

from .cvss import band, base_score
from .support import TEST_PASSWORD, decide, play_until_gate, run_to, run_to_end

# (template, request, client label). Each request picks its template, or the run asks and
# `decide` takes the suggestion.
CASES = [
    ("web_url", "Assess https://staging.example.com for web security issues.", "Example"),
    ("web_url", "Assess https://shop.example.com/store for web issues", "Example"),
    ("web_url", "https://shop.example.com test with sqlmap", "Example"),
    ("api", "test the API at https://api.example.com/v1", "Example"),
    ("network", "port scan 192.0.2.10", "192.0.2.10"),
    ("network", "scan 10.0.0.0/24 for open ports", "10.0.0.0/24"),
    ("network", "scan 198.51.100.0/24 for open ports", "198.51.100.0/24"),
    ("network", "192.0.2.10 scan port 80 with nmap", "192.0.2.10"),
    ("source", "review repo https://git.example.com/acme/app.git for secrets", "Example"),
    ("source", "review git@git.example.com:shop/storefront.git", "Example"),
    ("source", "static review of /home/me/shop-app", "Shop App"),
]
IDS = [request for _, request, _ in CASES]

RESERVED_DOMAINS = ("example.com", "example.org", "example.net")
RESERVED_NETWORKS = [ipaddress.ip_network(n) for n in (
    "192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24",   # RFC 5737 documentation
    "10.0.0.0/8", "127.0.0.0/8",                           # private, loopback
)]


def _all_template_tools():
    tools = set(TOOL_NAMES.values())
    for template_id, module in MODULES.items():
        tools.update(module.build_scope(
            ParsedTarget(template_id, "x.example.com", "https://x.example.com", "", template_id,
                         True)).tools)
    return sorted(tools, key=len, reverse=True)


TEMPLATE_TOOLS = _all_template_tools()


@pytest.fixture(params=CASES, ids=IDS)
def completed(request):
    template_id, text, client = request.param
    run_to(None, text)
    assert store.is_completed(), f"{text!r} stopped: {store.get_run().stopped!r}"
    assert lists.current().template_id == template_id
    return template_id, text, client


def _revealed():
    return store.list_findings()


# --- values ------------------------------------------------------------------------------
def test_every_value_is_in_its_allowed_set(completed):
    findings = _revealed()
    assert len(findings) == 3
    assert len({f.fid for f in findings}) == 3
    for finding in findings:
        assert finding.severity in store.SEVERITY_ORDER
        assert finding.validation in VALIDATION_ORDER
        assert finding.status in store.TRIAGE_STATUS
    approvals = lists.current().approvals
    assert [a.risk for a in approvals] == ["MEDIUM", "HIGH"]
    assert len({a.request_id for a in approvals}) == len(approvals)
    statuses = {task.key: task.status for task in store.plan_tasks()}
    assert statuses.pop("report") == "active"            # done once a report is exported
    assert set(statuses.values()) == {"done"}


def test_cvss_scores_match_their_vectors_and_severity(completed):
    for finding in _revealed():
        score = base_score(finding.cvss_vector)
        assert finding.cvss_score == score, (finding.fid, finding.cvss_vector, score)
        assert finding.severity == band(score), (finding.fid, score)


# --- scope ---------------------------------------------------------------------------------
def _policy_target(kind: str, path: str):
    if kind == "network":
        return "TCP", path.split("/")[0]                      # host:port
    if kind == "source":
        return "read", path.split(":")[0]                     # file (no line number)
    return "GET", path


def test_findings_and_approvals_are_inside_the_approved_scope(completed):
    kind = store.get_scope().kind
    for finding in _revealed():
        method, target = _policy_target(kind, finding.path)
        verdict = store.check_request(method, target)
        assert verdict.allowed, (finding.fid, finding.path, verdict.reason)
    for request in lists.current().approvals:
        assert store.check_request(request.method, request.path).allowed, request.path
    assert "/24:" not in json.dumps(snapshot(lists.current()))   # no range used as a host


def test_exactly_the_one_probe_is_blocked(completed):
    blocked = [v for v in store.list_verdicts() if not v.allowed]
    assert len(blocked) == 1
    assert store.counters()["blocked"] == 1


# --- tools ---------------------------------------------------------------------------------
def test_only_approved_tools_are_named(completed):
    approved = store.get_scope().tools
    for finding in _revealed():
        assert finding.tool in approved, (finding.fid, finding.tool, approved)
    lines = [e.message for e in store.list_activity()] + [c.text for c in store.list_chat()]
    for tool in TEMPLATE_TOOLS:
        if any(tool.casefold() == a.casefold() for a in approved):
            continue
        named = [line for line in lines
                 if re.search(rf"(?<![\w.-]){re.escape(tool)}(?![\w-])", line, re.IGNORECASE)]
        assert not named, (tool, approved, named)


def test_tools_named_in_the_request_replace_the_templates():
    run_to(None, "https://shop.example.com test with sqlmap")
    assert store.get_scope().tools == ["sqlmap"]
    assert {f.tool for f in _revealed()} == {"sqlmap"}
    assert store.login_kind() == ""                     # sqlmap needs no target login
    assert any("Selected tools: sqlmap." in c.text for c in store.list_chat())


def test_tools_edited_at_the_scope_gate_are_the_ones_named():
    store.start_run("port scan 192.0.2.10")
    assert play_until_gate() == "scope"
    store.edit_scope(tools=["testssl.sh"])
    decide("scope")
    run_to_end()
    assert {f.tool for f in _revealed()} == {"testssl.sh"}
    assert any(e.message == "Executing permitted scan · testssl.sh"
               for e in store.list_activity())


# --- network ports and hosts ------------------------------------------------------------------
def test_ports_named_in_the_request_are_the_ones_used():
    run_to(None, "192.0.2.10 scan port 80 with nmap")
    assert store.is_completed()
    assert store.get_scope().allowed_ports == [80]
    for finding in _revealed():
        assert finding.path.startswith("192.0.2.10:80"), finding.path
    for request in lists.current().approvals:
        assert request.path == "192.0.2.10:80"


def test_ports_edited_at_the_scope_gate_move_the_findings_and_approvals():
    store.start_run("scan 10.0.0.0/24 for open ports")
    assert play_until_gate() == "scope"
    store.edit_scope(allowed_ports=["80", "443"])        # the console port (8443) is gone
    decide("scope")
    run_to_end()
    assert store.is_completed()
    paths = {f.fid: f.path for f in _revealed()}
    assert paths == {"001": "10.0.0.1:80/manager", "002": "10.0.0.1:443", "003": "10.0.0.1:80"}
    for request in lists.current().approvals:
        assert request.path == "10.0.0.1:80"
        assert request.command_hash == command_digest(request.command)   # rebuilt, not stale


@pytest.mark.parametrize("target, host, outside", [
    ("192.0.2.10", "192.0.2.10", "198.51.100.9"),
    ("10.0.0.0/24", "10.0.0.1", "198.51.100.9"),
    ("198.51.100.0/24", "198.51.100.1", "203.0.113.9"),
    ("203.0.113.0/24", "203.0.113.1", "198.51.100.9"),
    ("scanme.example.com", "scanme.example.com", "198.51.100.9"),
])
def test_network_hosts(target, host, outside):
    assert sample_host(target) == host
    assert outside_host(target) == outside


@pytest.mark.parametrize("requested, ports", [
    ([], (8443, 443, 22)),
    ([80], (80, 80, 80)),
    ([443, 8443], (8443, 443, 443)),
])
def test_network_ports(requested, ports):
    assert tuple(pick_ports(requested)) == ports


def test_approved_tool():
    assert approved_tool("nmap", ["NMAP", "testssl.sh"]) == "NMAP"
    assert approved_tool("OWASP ZAP", ["sqlmap"]) == "sqlmap"
    assert approved_tool("nmap", []) == "nmap"


# --- what is saved -------------------------------------------------------------------------
_HOST = re.compile(r"(?<![\w.-])((?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9-]+\.)+[a-z]{2,})(?![\w-])",
                   re.IGNORECASE)
_FILES = (".py", ".txt", ".git", ".sh", ".json", ".yml", ".pem")
_NOT_HOSTS = {"reconix.assessment"}                      # the saved copy's schema id


def _is_reserved(host: str) -> bool:
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        if host.lower().endswith(_FILES) or host in _NOT_HOSTS:
            return True                                   # a file name or an id, not a host
        return host.lower().endswith(RESERVED_DOMAINS)
    return any(address in network for network in RESERVED_NETWORKS)


def test_saved_copy_names_only_reserved_hosts_and_no_secret(completed):
    text = json.dumps(snapshot(lists.current()))
    assert TEST_PASSWORD not in text
    hosts = {match.group(1) for match in _HOST.finditer(text)}
    strange = sorted(h for h in hosts if not _is_reserved(h))
    assert not strange, strange


def test_client_label_reads_well(completed):
    _template_id, _text, client = completed
    assert lists.current().client == client
