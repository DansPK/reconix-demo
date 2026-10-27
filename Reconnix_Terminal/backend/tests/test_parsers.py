"""Offline unit tests for output parsers (no MCP/LLM/network needed)."""

import json

from harness.models import Severity
from harness.utils.parsers import (
    parse_commix,
    parse_gobuster,
    parse_nikto,
    parse_nmap,
    parse_nuclei,
    parse_sqlmap,
    parse_whatweb,
)

NMAP_OUTPUT = """
Starting Nmap 7.94 ( https://nmap.org )
Nmap scan report for scanme.nmap.org (45.33.32.156)
Host is up (0.17s latency).
PORT      STATE    SERVICE VERSION
22/tcp    open     ssh     OpenSSH 6.6.1p1
80/tcp    open     http    Apache httpd 2.4.7
443/tcp   closed   https
9929/tcp  filtered nping-echo
"""


def test_parse_nmap_open_ports_are_not_findings():
    # There is no Info severity: open ports are observations, so nothing is stored.
    assert parse_nmap(NMAP_OUTPUT, scan_id=1) == []


def test_parse_nuclei_jsonl():
    lines = [
        json.dumps(
            {
                "template-id": "CVE-2021-44228",
                "info": {
                    "name": "Apache Log4j RCE",
                    "severity": "critical",
                    "description": "Log4Shell",
                    "classification": {"cve-id": ["CVE-2021-44228"], "cvss-score": 10.0},
                },
                "matched-at": "http://target/api",
            }
        ),
        "garbage line that is not json",
        json.dumps(
            {
                "template-id": "tech-detect",
                "info": {"name": "Tech Detect", "severity": "info"},
                "matched-at": "http://target/",
            }
        ),
    ]
    findings = parse_nuclei("\n".join(lines), scan_id=7)
    assert len(findings) == 1          # the info-level template is not a finding
    crit = next(f for f in findings if f.severity is Severity.CRITICAL)
    assert crit.cve_id == "CVE-2021-44228"
    assert crit.cvss_score == 10.0
    assert crit.location == "http://target/api"
    assert crit.scan_id == 7


def test_parse_sqlmap_vulnerable():
    output = """
    sqlmap identified the following injection point(s) with a total of 42 HTTP(s) requests:
    ---
    Parameter: id (GET)
        Type: boolean-based blind
        Type: time-based blind
    ---
    """
    findings = parse_sqlmap(output, scan_id=3)
    assert len(findings) == 1
    assert findings[0].severity is Severity.HIGH
    assert "id" in findings[0].title
    assert findings[0].verified is True


def test_parse_sqlmap_not_vulnerable():
    output = "all tested parameters do not appear to be injectable."
    assert parse_sqlmap(output, scan_id=3) == []


def test_parse_whatweb():
    out = "http://t:8081 [200 OK] HTTPServer[Express], JQuery, Title[OWASP Juice Shop], IP[192.168.210.1]"
    assert parse_whatweb(out, scan_id=1) == []     # a fingerprint is not a finding


def test_parse_nikto_filters_metadata_and_rates_headers():
    out = (
        "+ Target IP:          192.168.210.1\n"
        "+ /: Suggested security header missing: content-security-policy.\n"
        "+ /.htpasswd: Contains authorization information.\n"
        "+ /ftp/: This might be interesting.\n"
        "+ Start Time:         2026-10-01\n"
    )
    f = parse_nikto(out, scan_id=2)
    titles = [x.title for x in f]
    assert not any("Target IP" in t for t in titles)   # metadata filtered
    assert not any("Start Time" in t for t in titles)
    header = next(x for x in f if "content-security-policy" in x.title)
    assert header.severity is Severity.LOW             # missing header -> low
    assert not any("interesting" in t for t in titles)  # informational line: no finding


def test_parse_commix_detects_and_clean():
    assert parse_commix("the parameter 'x' is vulnerable to command injection", 3)[0].severity is Severity.CRITICAL
    assert parse_commix("no injection found", 3) == []


def test_parse_gobuster():
    out = "/admin (Status: 200)\n/secret (Status: 301)\nnoise line"
    assert parse_gobuster(out, scan_id=4) == []     # discovered paths are not findings


def test_severity_has_no_info():
    assert [s.value for s in Severity] == ["critical", "high", "medium", "low"]
    assert Severity.coerce("info") is None
    assert Severity.coerce("") is None
    assert Severity.coerce("bogus") is None
    assert Severity.coerce(" High ") is Severity.HIGH


def test_parse_zap_skips_informational():
    from harness.utils.parsers import parse_zap
    out = "[Informational] Modern Web Application (Medium) — http://t:8081/\n    CWE-1\n"
    assert parse_zap(out, scan_id=9) == []


def test_parse_zap():
    from harness.utils.parsers import parse_zap
    out = (
        "ZAP alerts for http://t:8081: 4\n"
        "[Medium] Content Security Policy (CSP) Header Not Set (High) — http://t:8081\n"
        "    CWE-693\n"
        "[Medium] Cross-Domain Misconfiguration (Medium) — http://t:8081/styles.css\n"
        "    evidence=Access-Control-Allow-Origin: *  CWE-264\n"
        "[Low] Timestamp Disclosure - Unix (Low) — http://t:8081/styles.css\n"
        "    evidence=1666666667  CWE-497\n"
        "[Medium] Cross-Domain Misconfiguration (Medium) — http://t:8081/styles.css\n"  # dup -> collapsed
        "    evidence=Access-Control-Allow-Origin: *  CWE-264\n"
    )
    f = parse_zap(out, scan_id=9)
    assert len(f) == 3  # 4th is a dup of #2
    csp = next(x for x in f if "Content Security Policy" in x.title)
    assert csp.severity is Severity.MEDIUM and csp.cve_id == "CWE-693"
    cors = next(x for x in f if "Cross-Domain" in x.title)
    assert "Access-Control-Allow-Origin" in cors.evidence and cors.cve_id == "CWE-264"
