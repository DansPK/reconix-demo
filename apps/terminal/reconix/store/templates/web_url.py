"""Web URL template: a web application reached over HTTP(S)."""

from ...models import Finding, ScopeManifest, Template
from ...models.parser import ParsedTarget
from .base import RunBundle, RunProfile, approval, build_rest, make_plan
from ..scenario import card, log, say

SPEC = Template("web_url", "Web URL", "Web application at a URL",
                target_hint="the site's URL", example="https://shop.lumina.com")


def build_scope(parsed: ParsedTarget) -> ScopeManifest:
    return ScopeManifest(
        kind="web_url", target_url=parsed.target_url, assessment_type="Web URL",
        allowed_actions=["Discovery", "vulnerability scanning", "limited validation"],
        allowed_methods=["GET", "POST"],
        excluded_paths=["/admin"],
        time_limit_minutes=30,
        tools=["Nuclei", "OWASP ZAP"],
    )


# Finding 004 shows an "extracted sample" to make the SQL-injection impact concrete. The rows are
# fabricated customers (reserved/placeholder data); the masked table bullets out the sensitive cells
# and is what the saved report keeps, while the raw table (shown only when the analyst presses
# "unmask") carries the real values. Local parts never contain a dot so the saved-copy host guard
# only ever sees the email domain.
_DUMP = (
    ('Sophea Chan', 'sophea_chan@gmail.com', '+855 12 684 207', 'Visa', '4532 9859 9256 5466', '08/27', 'Sophea1995'),
    ('Dara Kim', 'darakim88@gmail.com', '+855 11 904 221', 'Mastercard', '5425 3516 6185 6644', '11/26', 'darakim@18'),
    ('Srey Mom', 'sreymom_k@yahoo.com', '+855 96 774 310', 'Visa', '4716 0591 7325 9790', '03/28', 'sreymom123'),
    ('Vicheka Sok', 'vichekasok@outlook.com', '+855 92 448 177', 'Amex', '3714 438189 90163', '05/27', 'vicheka_99'),
    ('Rathana Long', 'rathana_long@gmail.com', '+855 15 903 562', 'Visa', '4485 9003 3143 7951', '09/25', 'rathana2020'),
    ('Bopha Nou', 'bophanou@gmail.com', '+855 78 112 845', 'Discover', '6011 0956 9380 8432', '12/27', 'bopha0808'),
    ('Chanthou Meas', 'chanthou_m@hotmail.com', '+855 17 657 203', 'Mastercard', '5500 9288 8207 9706', '07/26', 'chanthou88'),
    ('Pisey Heng', 'piseyheng@gmail.com', '+855 70 334 918', 'Visa', '4024 8785 8944 1206', '02/28', 'Pisey2016!'),
    ('Vuthy Sam', 'vuthy_sam@yahoo.com', '+855 10 220 746', 'Visa', '4929 2513 7840 8263', '10/26', 'vuthysam007'),
    ('Kunthea Yin', 'kuntheayin@gmail.com', '+855 86 905 114', 'Mastercard', '5168 5906 4207 5615', '04/27', 'kunthea2019'),
    ('Makara Chea', 'makara_chea@outlook.com', '+855 99 471 028', 'Visa', '4539 3594 3327 6963', '06/25', 'makara#23'),
    ('Vanna Prak', 'admin@lumina.com', '+855 23 900 004', 'Visa', '4716 8423 5693 9621', '01/29', 'Lumina@2024'),
)
_B = "•"   # the bullet used for masking across the demo
_DB_NAME = "lumina_shop"
_TOTAL_ROWS = 48_215
_COLUMNS = ("id", "name", "email", "phone", "card", "exp", "password")


def _dump_cells(masked: bool) -> list:
    """Per-column text for each sampled customer row — raw, or with the sensitive cells bulleted
    out. The brand rides with the raw card number; a masked card keeps only its last four."""
    rows = []
    for i, (name, email, phone, brand, card_no, exp, pw) in enumerate(_DUMP, 1):
        if masked:
            email = email[0] + _B * 3 + "@" + email.split("@")[1]
            phone = " ".join(phone.split()[:2]) + " " + _B * 3
            card = _B * 4 + " " + card_no.replace(" ", "")[-4:]
            exp = _B * 2 + "/" + _B * 2
            pw = _B * 6
        else:
            card = f"{brand} {card_no}"
        rows.append((str(i), name, email, phone, card, exp, pw))
    return rows


def _dump_table(masked: bool) -> list:
    """A sampled SQL dump, boxed like sqlmap's --dump output (a Database/Table banner over ruled
    columns). Masked is what the saved report keeps; the raw table — full card and cracked
    password — appears only behind the detail screen's unmask."""
    rows = _dump_cells(masked)
    widths = [max(len(_COLUMNS[c]), *(len(r[c]) for r in rows)) for c in range(len(_COLUMNS))]
    rule = "+" + "+".join("-" * (w + 2) for w in widths) + "+"

    def row(cells) -> str:
        return "| " + " | ".join(v.ljust(widths[c]) for c, v in enumerate(cells)) + " |"

    tail = (f"... {_TOTAL_ROWS - len(rows):,} more rows · passwords were unsalted MD5, "
            "cracked offline in seconds")
    return [
        f"Database: {_DB_NAME}   Table: customers   [{_TOTAL_ROWS:,} entries]",
        rule, row(_COLUMNS), rule,
        *(row(r) for r in rows),
        rule, tail,
    ]


# The attacker's two probes before the dump: confirm the injection, then pivot to customers.
_PROBE = [
    "GET /api/v1/products?q=cotton' OR '1'='1-- -   ->  HTTP 200 · all 48,215 rows (no auth)",
    "GET /api/v1/products?q=cotton' UNION SELECT * FROM customers-- -   ->  HTTP 200 · 48,215 rows",
]


def _findings(url: str) -> list:
    return [
        Finding(
            "001", "HIGH", "Unauthenticated access to order records", "/api/orders/{id}", "CONFIRMED",
            description="The order endpoint returns any order by its ID with no authentication. A "
                        "request carrying no session cookie or API key returned an order that "
                        "belongs to another customer.",
            affected_url=f"{url}/api/orders/10483",
            impact="Anyone on the internet can read every customer's orders just by changing the "
                   "ID: the items, totals, and the delivery name, phone and address.",
            remediation="Require authentication on the order endpoints and enforce a per-user "
                        "ownership check on every lookup; return 404 for orders the caller "
                        "does not own.",
            tool="OWASP ZAP",
            references=["OWASP A01:2021", "OWASP API1:2023", "CWE-639"],
            cvss_score=7.5, cvss_vector="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
            category="Web App",
            evidence=["GET /api/orders/10483  (no Authorization header) -> HTTP 200",
                      "returned order owner: d•••@gmail.com · "
                      "+855 •• ••• •••",
                      "no session cookie or API key was sent with the request"],
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
        Finding(
            "004", "CRITICAL", "SQL injection in catalog search", "/api/v1/products", "CONFIRMED",
            description="The storefront catalog search is reachable without signing in, and the "
                        "search term (the q parameter on GET /api/v1/products) is concatenated "
                        "straight into a SQL query. A single always-true payload — ' OR 1=1 -- — "
                        "made the search return every row, and a UNION payload pulled the customer "
                        "table, confirming full read access to the database.",
            affected_url=f"{url}/api/v1/products?q=",
            impact="An unauthenticated attacker can read the entire customer database: names, "
                   "emails, phone numbers, delivery addresses, saved card numbers, and password "
                   "hashes. The passwords are stored as unsalted MD5 and crack back to plaintext "
                   "in seconds.",
            remediation="Use parameterized queries / prepared statements for every database call "
                        "and run the app with a least-privilege database account. Store passwords "
                        "with a slow salted hash (bcrypt or argon2), and never keep full card "
                        "numbers, tokenize payments instead.",
            tool="Nuclei",
            references=["OWASP A03:2021", "CWE-89"],
            cvss_score=9.8, cvss_vector="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
            category="Web App",
            evidence=[*_PROBE, *_dump_table(masked=True)],
            evidence_unmasked=[*_PROBE, *_dump_table(masked=False)],
        ),
        Finding(
            "005", "HIGH", "Outdated JavaScript dependency with a known CVE",
            "/assets/js/vendor.min.js", "UNCONFIRMED",
            description="The bundled front-end code ships lodash 4.17.15, which has a known "
                        "prototype-pollution advisory (CVE-2020-8203).",
            affected_url=f"{url}/assets/js/vendor.min.js",
            impact="The known flaw may be reachable depending on how the library is used, "
                   "enabling client-side tampering or denial of service.",
            remediation="Upgrade lodash to 4.17.21 or later and re-run the dependency scan.",
            tool="Nuclei",
            references=["OWASP A06:2021", "CWE-1321", "CVE-2020-8203"],
            cvss_score=8.1, cvss_vector="CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H",
            category="Dependency",
            evidence=["vendor.min.js → lodash v4.17.15 fingerprinted",
                      "advisory CVE-2020-8203 · fixed in 4.17.21"],
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
        extra_discovery=("Crawled 24 pages · 6 API endpoints mapped",
                         "Technology fingerprint: nginx · MySQL · lodash"),
        blocked=("GET", "/admin"),
        scan_card=("Scan · $tools",
                   (("Potential issues", "5"), ("Access", "unauthenticated"))),
        scan_requests=(387, 166, 94),
        login_area="/api/v1/*",
        login_2fa=False,                   # unauthenticated scan: no login, no one-time code
        candidate_note="Suspected SQL injection on /api/v1/products: the q search parameter may "
                       "reach the database directly, and the endpoint needs no login. Proposing "
                       "limited validation.",
        candidate_log="Candidate F-004 · SQL injection",
        medium=approval(
            "approval-001", risk="MEDIUM", action="Baseline request (read-only)",
            target="GET {path}", method="GET",
            path="/api/v1/products?q=cotton+socks", param="Path",
            purpose="Record a normal search response to compare against the injection probes",
            impact="Low. One read-only search request, no data changes",
            command=f"GET {url}{{path}} (no authentication)"),
        # The HIGH action stays defined (not dropped), but gate_high=False keeps it out of this
        # demo's plan steps: the operator approves only the one MEDIUM gate, and the impact proof
        # (exploit_beat) plays straight after it.
        high=approval(
            "approval-002", risk="HIGH", action="Confirm the exposure",
            target="GET {path}", method="GET",
            path="/api/v1/products?q='+OR+1=1--",
            param="Path",
            purpose="Prove the injection returns the whole table with an always-true condition",
            impact="Returns every customer row from the database. 1 request, no changes",
            command=f"GET {url}{{path}} (no authentication)"),
        gate_high=False,
        findings=findings,
        analysis_steps=("Correlating findings", "Mapping to OWASP & CWE",
                        "Masking sensitive evidence"),
        # The reviewable plan shows only the assessment phases; the run still correlates findings
        # and produces the report, but those are not steps the operator plans/approves.
        plan=(("recon", "Reconnaissance"),
              ("discovery", "Content discovery"),
              ("scanning", "Vulnerability scanning"),
              ("validation", "Finding validation")),
        methodology=("OWASP WSTG", "OWASP Top 10 (2021)"),
        exploit_fid="004",
        exploit_beat=(
            say("SQL injection confirmed on /api/v1/products. The q parameter reaches the "
                "database directly, and the endpoint needs no login.", tone="warn", pause=1.5),
            say("Extending the plan to prove impact: reading a sample of the customer table "
                "and testing the stored password hashes offline.", pause=1.6),
            log("AI", "Extracting a sample of the users table and cracking the hashes offline",
                pause=1.2),
            card("Exploitation - impact proof", ("Rows readable", "48,215"),
                 ("Sample pulled", "12"), ("Hashes cracked", "12/12")),
        ),
    )
    return RunBundle(scope=scope, script=build_rest(profile),
                     approvals=[profile.medium], findings=findings,
                     login_2fa=profile.login_2fa, plan=make_plan(profile.plan),
                     methodology=list(profile.methodology))
