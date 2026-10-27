"""Write realistic sample assessments for the web dashboard (development and tests).

Plays the four templates through the real store (every gate decided through the same
store functions the TUI uses) with a fake clock, so the files look like a week of work:
completed runs with reports, extra scanner findings, a run stopped by a rejected HIGH
approval, and one still waiting at a HIGH approval. Only example domains and fake,
masked evidence are used. No secret is written (the store's snapshot leaves them out).

    python scripts/make_sample_data.py [OUT_DIR]      # default: web/sample-data
"""

import json
import os
import random
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Optional

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "scripts" / "sample" / "openapi-demo.yaml"   # the API run's attached spec
sys.path.insert(0, str(ROOT))

from reconix import store  # noqa: E402
from reconix.models import Finding, base  # noqa: E402
from reconix.store import lists, report, snapshot  # noqa: E402
from reconix.store.findings import SEVERITY_ORDER, ingest_external  # noqa: E402
from reconix.store.redact import clean, redact  # noqa: E402

FILE_NAME = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}_[A-Za-z0-9-]{1,64}\.json$")

NUCLEI = "\n".join(json.dumps(row) for row in [
    {"template-id": "server-version", "matched-at": "https://{host}/",
     "info": {"name": "Web server version disclosed", "severity": "low",
              "description": "The Server header names the web server and its version."},
     "extracted-results": ["Server: nginx/1.18.0"]},
    {"template-id": "api-docs-exposed", "matched-at": "https://{host}/docs",
     "info": {"name": "API documentation exposed", "severity": "medium",
              "description": "Interactive API documentation is reachable without a login."}},
    {"template-id": "missing-hsts", "matched-at": "https://{host}/",
     "info": {"name": "HSTS header missing", "severity": "low"}},
])

# Scanner rows (nuclei's JSON lines) the script turns into findings itself; only the four
# severities exist, so a row with another one is a mistake in this file (`add_scanner_rows`).
# A run with every severity the scale has, a title that must stay text, and a login in a URL
# (the store masks the login in what it keeps).
NUCLEI_EDGE = "\n".join(json.dumps(row) for row in [
    {"template-id": "admin-console-open", "matched-at": "https://ops:hunter2@{host}/console",
     "info": {"name": "Admin console reachable without authentication", "severity": "critical",
              "description": "The management console answers without a login."}},
    {"template-id": "title-markup", "matched-at": "https://{host}/status",
     "info": {"name": "<b>Status page</b> leaks build details", "severity": "high",
              "description": "The page prints the <i>build number</i> and the host name."}},
    {"template-id": "tech-detect", "matched-at": "https://{host}/",
     "info": {"name": "Web server banner names nginx", "severity": "low"}},
    {"template-id": "robots-txt", "matched-at": "https://{host}/robots.txt",
     "info": {"name": "robots.txt lists internal paths", "severity": "low"},
     "extracted-results": ["Disallow: /internal/"]},
    {"template-id": "old-cert", "matched-at": "https://{host}/",
     "info": {"name": "Certificate expires within 30 days", "severity": "medium"}},
])

# Nine more rows: with the template's own findings one run lists more than ten.
NUCLEI_MANY = "\n".join(json.dumps(row) for row in [
    {"template-id": f"exposed-{name}", "matched-at": f"https://{{host}}/{name}",
     "info": {"name": f"Exposed {name} endpoint", "severity": severity}}
    for name, severity in [("backup", "high"), ("metrics", "medium"), ("debug", "medium"),
                           ("swagger", "low"), ("health", "low"), ("version", "low"),
                           ("status", "low"), ("config", "medium"), ("trace", "low")]
])


def add_scanner_rows(rows_text: str) -> None:
    """Add the findings in `rows_text` (nuclei JSON lines) to the current assessment.

    They get `IMP-NNN` ids, are unconfirmed and are masked like the store masks any text.
    """
    findings = []
    for line in rows_text.splitlines():
        row = json.loads(line)
        info = row["info"]
        severity = info["severity"].upper()
        assert severity in SEVERITY_ORDER, f"not a severity: {severity}"
        url = row["matched-at"]
        path = "/" + url.split("://", 1)[1].split("/", 1)[1] if url.count("/") > 2 else "/"
        findings.append(Finding(
            fid="", severity=severity, title=redact(info["name"]), path=redact(path),
            validation="UNCONFIRMED", description=redact(info.get("description") or
                                                         "Reported by nuclei."),
            affected_url=redact(url), impact="Review the finding and confirm its impact.",
            remediation="See the tool's guidance for remediation.", tool="nuclei",
            evidence=[redact(" ".join(str(e).split()))[:200]
                      for e in row.get("extracted-results", [])],
            references=[clean(str(r)) for r in info.get("reference", [])]))
    ingest_external(findings, prefix="IMP")


def triage_false_positive() -> None:
    store.triage_finding("IMP-003", status="false-positive",
                         note="Banner is a test fixture; the scanner matched a stale cache.")


# --- a clock that moves a few seconds per reading ----------------------------------------------
class FakeClock(datetime):
    current = datetime(2026, 9, 28, 9, 12, tzinfo=timezone.utc)
    rng = random.Random(7)

    @classmethod
    def now(cls, tz=None):
        cls.current += timedelta(seconds=cls.rng.uniform(2.5, 8.0))
        return cls.current if tz else cls.current.replace(tzinfo=None)

    @classmethod
    def start(cls, moment: datetime) -> None:
        cls.current = moment


base.datetime = FakeClock      # every store timestamp comes from base.utc_now()


# --- playing a run -------------------------------------------------------------------------------
def decide(gate: str, *, high: str, spec: str = "") -> bool:
    """Decide `gate`. Returns False to leave the run waiting there."""
    if gate == "template":
        store.select_template(store.get_assessment().template_id)
    elif gate == "scope":
        if spec:                              # the operator attaches the API's OpenAPI spec
            store.attach_api_spec(spec)
        store.approve_scope()
    elif gate == "plan":
        store.run_plan()
    elif gate in ("account", "code"):         # the login the tools need, then its code
        values = {}
        for field in store.current_auth_challenge().fields:
            values[field.id] = ("482913" if field.otp
                                else "sample-only-password" if field.secret else "tester.a")
        store.provide_auth(values)
    else:
        request = store.get_approval(gate.split(":", 1)[1])
        if request.risk != "HIGH":
            store.approve(request.request_id, command_hash=request.command_hash)
        elif high == "wait":
            return False
        elif high == "reject":
            store.reject(request.request_id)
        else:
            token = store.request_confirmation(request.request_id, request.command_hash)
            store.approve(request.request_id, command_hash=request.command_hash,
                          confirmation_token=token)
    return True


def play(text: str, *, high: str = "approve", fmt: str = "", rows: str = "",
         stop_at: str = "", running_steps: int = 0, no_findings: bool = False,
         after: Optional[Callable[[], None]] = None, spec: str = "") -> None:
    """Play one run from `text`.

    `stop_at`: "scope" stops the run at the template/scope gate (nothing approved);
    `running_steps`: leave the run Running after that many played steps once the plan runs;
    `no_findings`: drop every finding (a completed run that found nothing);
    `after`: a callable run last (triage a finding, for instance);
    `spec`: an OpenAPI file attached to the draft scope before it is approved (API runs).
    """
    if store.get_run().started:
        store.new_assessment()
    store.start_run(text)
    played = 0
    while True:
        step = store.advance()
        if step is None:
            break
        if step.kind == "gate" and store.waiting_gate() == step.name:
            if stop_at == "scope" and step.name in ("template", "scope"):
                store.stop_run()
                break
            if not decide(step.name, high=high, spec=spec):
                break
        elif running_steps and store.get_run().plan_started:
            played += 1
            if played >= running_steps:
                break
    if no_findings:
        run = store.get_assessment().run
        store.get_assessment().findings.clear()
        run.revealed.clear()
    if fmt and store.is_completed():
        store.generate_report(fmt)
    if rows:
        add_scanner_rows(rows.replace("{host}", store.get_assessment().target))
    if after:
        after()


def session(moment: datetime, runs, closed: bool = True) -> list:
    """One TUI session starting at `moment`; returns its saved snapshots.

    `closed` marks the copies the way quitting the TUI does (the latest session stays open).
    """
    FakeClock.start(moment)                # before reset: the fresh assessment is stamped now
    store.reset()
    lists.SESSION_ID = f"{moment:%Y%m%d-%H%M%S}-{random.Random(moment.day).getrandbits(16):04x}"
    for kwargs in runs:
        FakeClock.current += timedelta(minutes=kwargs.pop("gap", 0))
        play(**kwargs)
    out = []
    for assessment in lists.ASSESSMENTS:
        if assessment.run.started:
            data = snapshot.snapshot(assessment, session_closed=closed)
            data["saved_at"] = FakeClock.now(timezone.utc).isoformat(timespec="seconds")
            out.append(data)
    return out


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web" / "sample-data"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.iterdir():
        if FILE_NAME.match(old.name):
            old.unlink()
    work = Path(tempfile.mkdtemp(prefix="reconix-sample-"))
    os.chdir(work)                         # reports land in ./reports of a scratch folder
    report.REPORTS_DIR = Path("reports")

    utc = timezone.utc
    snapshots = []
    snapshots += session(datetime(2026, 9, 28, 9, 12, tzinfo=utc), [
        dict(text="Review the source repository git@git.example.com:shop/storefront.git "
                  "for security issues.", fmt="docx"),
    ])
    snapshots += session(datetime(2026, 9, 30, 16, 5, tzinfo=utc), [
        dict(text="Test the REST API at https://api.example.com/v1 for security issues.",
             fmt="docx", spec=str(SPEC)),
    ])
    snapshots += session(datetime(2026, 10, 3, 10, 15, tzinfo=utc), [
        dict(text="Scan the network host 192.0.2.10 for exposed services.", fmt="json"),
        dict(text="Test the REST API at https://api.example.com/v1 for security issues.",
             high="reject", rows=NUCLEI, gap=12),
    ])
    snapshots += session(datetime(2026, 10, 5, 14, 3, tzinfo=utc), [
        dict(text="Assess https://staging.example.com for web security issues.", fmt="docx",
             rows=NUCLEI.split("\n")[0]),
        dict(text="Review the source repository git@git.example.com:shop/storefront.git "
                  "for security issues.", high="wait", gap=6),
    ], closed=False)

    # Runs for the edge cases (appended last: the sessions above keep their stamps):
    #   2026-09-29  a login in the target URL (masked wherever it is kept), one finding of
    #               every severity, a title with markup that must stay text, and a finding
    #               triaged as a false positive; then a run with more than ten findings
    #               (the Findings view's second page)
    #   2026-10-01  two completed runs that found nothing, and one stopped at the scope gate
    #               (no Scope Manifest, no plan, no findings: the Limitations of a report)
    #   2026-10-02  a second repository review, its report in JSON (a finding two runs share)
    #   2026-10-04  a run still Running in a session left open (the TUI is on it now)
    snapshots += session(datetime(2026, 9, 29, 11, 20, tzinfo=utc), [
        dict(text="Assess https://ops:hunter2@portal.example.com for web security issues.",
             rows=NUCLEI_EDGE, after=triage_false_positive),
        dict(text="Test the REST API at https://api.example.org/v2 for security issues.",
             rows=NUCLEI_MANY, gap=9),
    ])
    snapshots += session(datetime(2026, 10, 1, 8, 30, tzinfo=utc), [
        dict(text="Assess https://quiet.example.com for web security issues.", no_findings=True),
        dict(text="Assess https://calm.example.com for web security issues.", no_findings=True,
             gap=7),
        dict(text="Check portal.example.net", stop_at="scope", gap=5),
    ])
    snapshots += session(datetime(2026, 10, 2, 13, 40, tzinfo=utc), [
        dict(text="Review the source repository git@git.example.com:shop/checkout.git "
                  "for security issues.", fmt="json"),
    ])
    snapshots += session(datetime(2026, 10, 4, 15, 0, tzinfo=utc), [
        dict(text="Assess https://live.example.com for web security issues.", running_steps=12),
    ], closed=False)

    for data in snapshots:
        path = out_dir / f"{data['uid']}.json"
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{path.name}: {data['status']}, {len(data['findings'])} findings")
    print(f"{len(snapshots)} assessments written to {out_dir}")


if __name__ == "__main__":
    main()
