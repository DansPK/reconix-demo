"""Each Lumina system's own scripted results, so no two assessments share a finding.

A template's built-in story stays with its main target (www, api, 10.0.0.10, storefront.git);
`for_target` swaps in the story of another known Lumina system.
"""

from dataclasses import replace
from typing import Callable, Tuple

from ...models import ApprovalRequest, Finding
from . import lumina_more
from .base import RunProfile, approval

_WRITE = ("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N", 8.1)
_READ_OPEN = ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", 7.5)
_INTERCEPT = ("CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N", 7.4)
_FORGE = ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N", 7.5)
_XSS = ("CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N", 5.4)
_REPLAY = ("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N", 5.3)
_MINOR = ("CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N", 3.7)


def _finding(fid: str, severity: str, title: str, path: str, validation: str, where: str,
             cvss: Tuple[str, float], tool: str, category: str, refs: Tuple[str, ...],
             description: str, impact: str, fix: str, *evidence: str) -> Finding:
    return Finding(fid, severity, title, path, validation, description=description,
                   affected_url=where, impact=impact, remediation=fix, tool=tool,
                   references=list(refs), cvss_vector=cvss[0], cvss_score=cvss[1],
                   category=category, evidence=list(evidence))


def _probe(risk: str, action: str, method: str, path: str, purpose: str, impact: str,
           target: str, command: str, param: str = "Path") -> ApprovalRequest:
    return approval("approval-001" if risk == "MEDIUM" else "approval-002", risk=risk,
                    action=action, method=method, path=path, param=param, purpose=purpose,
                    impact=impact, target=target, command=command)


def _portal(url: str) -> dict:
    return dict(
        findings=[
            _finding("001", "HIGH", "Partner invoices readable across accounts",
                     "/account/invoices/{id}", "CONFIRMED", f"{url}/account/invoices/20871",
                     _READ_OPEN, "Nuclei", "Web App", ("OWASP A01:2021", "CWE-639"),
                     "The invoice page checks that an invoice exists but not who it belongs to.",
                     "Anyone who guesses an invoice number can read a partner's prices, billing "
                     "address and payment status.",
                     "Check that the invoice belongs to the signed-in partner on every request.",
                     "GET /account/invoices/20871 without a session → HTTP 200",
                     "invoice INV-20871 · billed to: M••••• Trading · total 1,840 USD"),
            _finding("002", "MEDIUM", "Stored script in support ticket subject",
                     "/support/tickets", "UNCONFIRMED", f"{url}/support/tickets", _XSS, "dalfox",
                     "Web App", ("OWASP A03:2021", "CWE-79"),
                     "A ticket subject containing markup is written to the ticket list unencoded.",
                     "A partner could run script in a support agent's browser.",
                     "Encode the subject on output and restrict inline script with a CSP.",
                     "POST /support/tickets · subject marker came back unencoded in the list"),
            _finding("003", "LOW", "Password reset page reveals registered emails",
                     "/password/reset", "INCONCLUSIVE", f"{url}/password/reset", _MINOR, "httpx",
                     "Web App", ("OWASP A07:2021", "CWE-204"),
                     "The reset page answers differently for known and unknown addresses.",
                     "Helps an attacker list which partners have an account.",
                     "Return the same message and timing for every address.",
                     "known address → 812 bytes · unknown address → 774 bytes"),
            *lumina_more.rows("portal", url, 4),
        ],
        discovery_card=("Discovery · $tool", (("Public pages", "9"), ("Forms", "6"),
                                              ("API endpoints", "11"))),
        discovery_requests=(184, 133), scan_requests=(261, 118, 57),
        extra_discovery=("Crawled 15 pages · 11 API endpoints mapped",
                         "Technology fingerprint: Apache · PHP · Laravel"),
        scan_card=("Scan · $tools", (("Potential issues", "6"), ("Access", "unauthenticated"))),
        candidate_note="An invoice opened without a session on /account/invoices/{id}. "
                       "Proposing limited validation.",
        candidate_log="Candidate F-001 · invoice access",
        medium=_probe("MEDIUM", "Baseline request (read-only)", "GET", "/account/invoices/20871",
                      "Record how the invoice page answers without a session",
                      "Low. One read-only request, no data changes", "GET {path}",
                      f"GET {url}{{path}} (no authentication)"),
    )


def _careers(url: str) -> dict:
    return dict(
        findings=[],
        discovery_card=("Discovery · $tool", (("Public pages", "12"), ("Forms", "1"),
                                              ("API endpoints", "0"))),
        discovery_requests=(74, 41), scan_requests=(139, 62, 28),
        extra_discovery=("Crawled 12 pages · 1 application form mapped",
                         "Technology fingerprint: nginx · static site"),
        scan_card=("Scan · $tools", (("Potential issues", "0"), ("Access", "unauthenticated"))),
        candidate_note="The scanners raised nothing. Proposing one read-only request to confirm "
                       "the job filter handles unexpected input.",
        candidate_log="No candidates · confirming input handling",
        medium=_probe("MEDIUM", "Input handling check (read-only)", "GET",
                      "/jobs?team=engineering", "Confirm the job filter encodes its input",
                      "Low. One read-only request, no data changes", "GET {path}",
                      f"GET {url}{{path}} (no authentication)"),
    )


def _payments(url: str) -> dict:
    return dict(
        findings=[
            _finding("001", "HIGH", "Refund amount accepted from the client", "/v1/refunds",
                     "UNCONFIRMED", f"{url}/v1/refunds", _WRITE, "schemathesis", "API",
                     ("OWASP API3:2023", "CWE-915"),
                     "The refund endpoint appears to trust the amount in the request body instead "
                     "of the captured payment.",
                     "A merchant token could ask for more money back than was paid.",
                     "Compute the refundable amount on the server from the captured payment.",
                     "POST /v1/refunds · schema lists amount as client-supplied, with no maximum"),
            _finding("002", "MEDIUM", "Webhook accepts replayed events", "/v1/webhooks/bank",
                     "UNCONFIRMED", f"{url}/v1/webhooks/bank", _REPLAY, "Nuclei", "API",
                     ("OWASP API2:2023", "CWE-294"),
                     "A signed event can be delivered twice; its timestamp is not checked.",
                     "An old payment notification could be processed again.",
                     "Reject events older than five minutes and store processed event ids.",
                     "same event id delivered twice → HTTP 200 both times"),
            *lumina_more.rows("payments", url, 3),
        ],
        discovery_card=("Discovery · API", (("Endpoints", "17"), ("Auth scheme", "Bearer"),
                                            ("GraphQL", "no"))),
        discovery_requests=(58, 77), scan_requests=(102, 64, 31),
        scan_card=("Scan · $tools", (("Potential issues", "3"), ("Needs token", "/v1/refunds"))),
        login_area="/v1/refunds",
        candidate_note="The refund endpoint may trust an amount sent by the client. "
                       "Proposing limited validation.",
        candidate_log="Candidate F-001 · refund amount",
        medium=_probe("MEDIUM", "Baseline request (read-only)", "GET", "/v1/refunds/limits",
                      "Record the documented refund limits", "Low. One read request",
                      "GET {path} (merchant token)", f"GET {url}{{path}} as merchant token"),
        high=_probe("HIGH", "refund_limit_check", "POST", "/v1/refunds",
                    "Check in dry-run mode whether an amount above the payment is accepted",
                    "Dry run only. 1 request, no money moves", "POST {path} (dry run)",
                    f"POST {url}{{path}} with dry_run set"),
    )


def _checkout_repo(ref: str) -> dict:
    return dict(
        findings=[
            _finding("001", "HIGH", "Payment webhook signature not verified",
                     "src/webhooks/payment.js", "CONFIRMED", f"{ref} · src/webhooks/payment.js:57",
                     _FORGE, "Semgrep", "Source Code", ("CWE-345", "OWASP A08:2021"),
                     "The handler parses the event body without checking its signature header.",
                     "A forged event could mark an unpaid order as paid.",
                     "Verify the signature over the raw body before parsing it.",
                     "payment.js:57  event body parsed before any signature check"),
            _finding("002", "MEDIUM", "Cart total computed with floating point",
                     "src/cart/total.js", "UNCONFIRMED", f"{ref} · src/cart/total.js:31", _REPLAY,
                     "Semgrep", "Source Code", ("CWE-682", "OWASP A04:2021"),
                     "Prices are added as floating-point numbers before rounding.",
                     "Rounding can leave the charged total a cent away from the order total.",
                     "Keep prices as integer cents throughout.",
                     "total.js:31  running total += price * quantity (floating point)"),
            _finding("003", "LOW", "Container image runs as root", "Dockerfile", "INCONCLUSIVE",
                     f"{ref} · Dockerfile:1", _MINOR, "trivy", "Source Code",
                     ("CWE-250", "OWASP A05:2021"),
                     "The image never switches to an unprivileged user.",
                     "A flaw in the service would give an attacker root inside the container.",
                     "Add a dedicated user and a USER instruction.",
                     "Dockerfile  FROM node:22-slim · no USER instruction"),
            *lumina_more.rows("checkout", ref, 4),
        ],
        discovery_card=("Discovery · repository", (("Files", "146"), ("Languages", "JavaScript"),
                                                   ("Dependencies", "73"))),
        scan_card=("Scan · $tools", (("Potential issues", "6"), ("Secrets flagged", "0"))),
        candidate_note="src/webhooks/payment.js parses events before checking a signature. "
                       "Proposing a controlled read of the handler.",
        candidate_log="Candidate F-001 · unsigned webhook",
        **_source_reads("src/webhooks/payment.js", 57,
                        "Confirm the handler has no signature check",
                        "Review the handler's callers offline"))


def _mobile_repo(ref: str) -> dict:
    return dict(
        findings=[
            _finding("001", "HIGH", "TLS certificate check disabled in release build",
                     "lib/net/http-client.js", "CONFIRMED",
                     f"{ref} · lib/net/http-client.js:24", _INTERCEPT, "Semgrep", "Source Code",
                     ("CWE-295", "OWASP A02:2021"),
                     "The HTTP client accepts any certificate, including in release builds.",
                     "Someone on the same Wi-Fi could read a shopper's traffic.",
                     "Remove the callback and pin the production certificate.",
                     "http-client.js:24  rejectUnauthorized: false (no debug-build check)"),
            _finding("002", "LOW", "Verbose request logging left enabled",
                     "lib/net/logger.js", "INCONCLUSIVE", f"{ref} · lib/net/logger.js:12",
                     _MINOR, "Semgrep", "Source Code", ("CWE-532", "OWASP A09:2021"),
                     "Request bodies are written to the device log.",
                     "Personal details may remain in logs on a shared device.",
                     "Log request bodies in debug builds only.",
                     "logger.js:12  request body written to the device log"),
            *lumina_more.rows("mobile", ref, 3),
        ],
        discovery_card=("Discovery · repository", (("Files", "228"), ("Languages", "JavaScript"),
                                                   ("Dependencies", "39"))),
        scan_card=("Scan · $tools", (("Potential issues", "5"), ("Secrets flagged", "0"))),
        candidate_note="lib/net/http-client.js accepts any certificate. "
                       "Proposing a controlled read of the client setup.",
        candidate_log="Candidate F-001 · certificate check",
        **_source_reads("lib/net/http-client.js", 24,
                        "Confirm the callback is not limited to debug builds",
                        "Review the build flavors offline"))


def _source_reads(path: str, line: int, confirm: str, review: str) -> dict:
    return dict(
        medium=_probe("MEDIUM", "Read the flagged line (read-only)", "read", path, confirm,
                      "Low. Reads one file in the repo, changes nothing",
                      f"read {{path}}:{line}", f"read {{path}} lines {line - 2}-{line + 2}",
                      "File"),
        high=_probe("HIGH", "source_review", "read", path, review,
                    "Offline source review only; nothing is executed",
                    "review {path} and its callers", "review {path} and its callers offline",
                    "File"))


def _web(system: str, findings: int, pages: int, stack: str, note: str, candidate: str,
         probe: str) -> Callable[[str], dict]:
    """A web story whose findings all come from `lumina_more`."""
    def story(url: str) -> dict:
        return dict(
            findings=lumina_more.rows(system, url),
            discovery_card=("Discovery · $tool", (("Public pages", str(pages)), ("Forms", "5"),
                                                  ("API endpoints", "8"))),
            discovery_requests=(pages * 9, pages * 6), scan_requests=(pages * 12, 98, 43),
            extra_discovery=(f"Crawled {pages + 7} pages · 8 API endpoints mapped",
                             f"Technology fingerprint: {stack}"),
            scan_card=("Scan · $tools", (("Potential issues", str(findings)),
                                         ("Access", "unauthenticated"))),
            candidate_note=f"{note} Proposing limited validation.",
            candidate_log=f"Candidate F-001 · {candidate}",
            medium=_probe("MEDIUM", "Baseline request (read-only)", "GET", probe,
                          "Record the normal response to compare with the checks",
                          "Low. One read-only request, no data changes", "GET {path}",
                          f"GET {url}{{path}} (no authentication)"))
    return story


def _api(system: str, findings: int, endpoints: int, area: str, note: str, candidate: str,
         probe: str) -> Callable[[str], dict]:
    def story(url: str) -> dict:
        return dict(
            findings=lumina_more.rows(system, url),
            discovery_card=("Discovery · API", (("Endpoints", str(endpoints)),
                                                ("Auth scheme", "Bearer"), ("GraphQL", "no"))),
            discovery_requests=(endpoints * 4, endpoints * 5), scan_requests=(148, 91, 36),
            scan_card=("Scan · $tools", (("Potential issues", str(findings)),
                                         ("Needs token", area))),
            login_area=area, candidate_note=f"{note} Proposing limited validation.",
            candidate_log=f"Candidate F-001 · {candidate}",
            medium=_probe("MEDIUM", "Baseline request (read-only)", "GET", probe,
                          "Record the documented response", "Low. One read request",
                          "GET {path} (test token)", f"GET {url}{{path}} as test token"),
            high=_probe("HIGH", "access_check", "POST", area,
                        "Check whether the endpoint accepts a request without credentials",
                        "Uses a test item and changes nothing. 1 request", "POST {path}",
                        f"POST {url}{{path}} (no credentials, test item)"))
    return story


def _repo(system: str, files: int, languages: str, dependencies: int, findings: int,
          secrets: int, path: str, line: int, note: str, candidate: str) -> Callable[[str], dict]:
    def story(ref: str) -> dict:
        return dict(
            findings=lumina_more.rows(system, ref),
            discovery_card=("Discovery · repository", (("Files", str(files)),
                            ("Languages", languages), ("Dependencies", str(dependencies)))),
            scan_card=("Scan · $tools", (("Potential issues", str(findings)),
                                         ("Secrets flagged", str(secrets)))),
            candidate_note=f"{note} Proposing a controlled read of the file.",
            candidate_log=f"Candidate F-001 · {candidate}",
            **_source_reads(path, line, "Confirm the flagged line is not a false positive",
                            "Review the callers offline"))
    return story


def _net(system: str, findings: int, services: Tuple[Tuple[str, str], ...], live: str, port: int,
         note: str, candidate: str) -> Callable[[str], dict]:
    def story(host: str) -> dict:
        place = f"{host}:{port}"
        return dict(
            findings=lumina_more.rows(system, host),
            discovery_card=("Discovery · $tool", (("Live hosts", live),
                            ("Open ports", str(findings)), ("Services", str(findings)))),
            scan_card=("Services · $tool", services),
            candidate_note=f"{note} Proposing one controlled connection check.",
            candidate_log=f"Candidate F-001 · {candidate}",
            medium=_probe("MEDIUM", "Banner check (read-only)", "TCP", place,
                          "Record the service banner", "Low. Connects once, sends no credentials",
                          "TCP {path}", "connect {path} · read banner", "Host:port"),
            high=_probe("HIGH", "reachability_check", "TCP", place,
                        "Confirm the service accepts a connection from this network",
                        "One connection. No login is tried", "TCP {path}",
                        "connect {path} · close", "Host:port"))
    return story


_STORIES = {
    ("web_url", "portal.lumina.com"): _portal,
    ("web_url", "careers.lumina.com"): _careers,
    ("api", "payments.lumina.com"): _payments,
    ("source", "git@git.lumina.com:shop/checkout.git"): _checkout_repo,
    ("source", "git@git.lumina.com:shop/mobile-app.git"): _mobile_repo,
    ("source", "git@git.lumina.com:shop/storefront.git"): _repo(
        "storefront", 187, "JavaScript, CSS", 64, 10, 1, "server/routes/exec.js", 17,
        "server/routes/exec.js builds a shell command from a request value.",
        "command injection"),
    ("source", "git@git.lumina.com:platform/deploy.git"): _repo(
        "platform", 92, "YAML, Shell", 17, 5, 1, "k8s/rbac.yml", 14,
        "k8s/rbac.yml gives the build account cluster-wide rights.", "deployment rights"),
    ("web_url", "loyalty.lumina.com"): _web(
        "loyalty", 5, 21, "nginx · Ruby on Rails",
        "The points transfer form may trust the sender account it is given.",
        "points transfer", "/points/transfer"),
    ("web_url", "support.lumina.com"): _web(
        "support", 3, 46, "nginx · Python · Django",
        "The help search repeats its term inside a script block.", "help search",
        "/help/search?q=delivery"),
    # Other clients' websites (rows in companies.py).
    ("web_url", "www.contoso.com"): _web(
        "contoso", 6, 34, "IIS · .NET Framework",
        "Booking confirmations open from a short reference without a session.",
        "booking access", "/bookings/CTX-48210"),
    ("web_url", "shop.fabrikam.com"): _web(
        "fabrikam", 5, 58, "nginx · PHP · Magento",
        "Order pages open for order numbers that belong to other shoppers.",
        "order access", "/orders/700318"),
    ("web_url", "www.northwind.com"): _web(
        "northwind", 5, 27, "Apache · Java · Spring",
        "The trade price list update may accept another buyer's account number.",
        "price list access", "/trade/prices/NW-2207"),
    ("api", "inventory.lumina.com"): _api(
        "inventory", 4, 31, "/v2/stock/adjust",
        "The stock adjustment endpoint may accept requests without credentials.",
        "stock adjustment", "/v2/items/LUM-TEST-01"),
    ("network", "10.20.0.15"): _net(
        "office", 4, (("Database", "1"), ("File share", "1"), ("Web", "1")), "1", 5432,
        "A database port answers from the office network.", "database exposure"),
    ("network", "10.20.4.0/24"): _net(
        "warehouse", 3, (("Remote desktop", "1"), ("Web", "2")), "14", 3389,
        "Remote desktop answers from the warehouse network.", "remote desktop"),
}


def has_story(template: str, target: str) -> bool:
    return (template, target) in _STORIES


def for_target(template: str, target: str, where: str, profile: RunProfile) -> RunProfile:
    """`profile`, or the story of `target` when it is another known Lumina system."""
    if (template, target) == ("api", "api.lumina.com"):     # its built-in story, with more to it
        findings = [*profile.findings, *lumina_more.rows("api", where, len(profile.findings) + 1)]
        return replace(profile, findings=findings,
                       scan_card=(profile.scan_card[0], (("Potential issues", str(len(findings))),
                                                         profile.scan_card[1][1])))
    story = _STORIES.get((template, target))
    if story is None:
        return profile
    return replace(profile, exploit_fid="", exploit_beat=(), **story(where))
