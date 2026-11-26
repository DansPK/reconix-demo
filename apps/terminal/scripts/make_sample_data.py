"""Write the prepared history the web dashboard shows: one assessment per Lumina system,
plus a few other clients' websites.

Plays the templates through the real store (every gate decided through the same store
functions the TUI uses) with a fake clock, so the files look like a month of work. Only
Lumina's own domains and private addresses are used, with fake, masked evidence. The web
tests read their own frozen copy (web/tests/sample-data), which this script never touches.

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

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "scripts" / "sample" / "openapi-demo.yaml"   # the API run's attached spec
sys.path.insert(0, str(ROOT))

from reconix import store  # noqa: E402
from reconix.models import base  # noqa: E402
from reconix.store import lists, report, seed, snapshot  # noqa: E402

FILE_NAME = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}_[A-Za-z0-9-]{1,64}\.json$")

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
                          confirmation_token=token, typed_target=request.target)
    return True


def play(text: str, *, high: str = "approve", fmt: str = "docx", stop_at: str = "",
         spec: str = "", signed_off: bool = True, triage: tuple = (),
         client: str = "Lumina") -> None:
    """Play one run from `text`.

    `stop_at`: "scope" stops the run at the template/scope gate (nothing approved);
    `spec`: an OpenAPI file attached to the draft scope before it is approved (API runs);
    `client`: the client label ("" keeps the one read from the target, e.g. Contoso).
    """
    if store.get_run().started:
        store.new_assessment()
    store.start_run(text)
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
    if client:
        lists.current().client = client
    for fid, status, note in triage:      # follow-up recorded before the report is made
        FakeClock.current += timedelta(minutes=FakeClock.rng.uniform(2, 9))
        store.triage_finding(fid, status=status, note=note)
    if fmt and store.is_completed():
        store.generate_report(fmt)
        if signed_off:
            store.sign_off_report()  # authored operator decision, separate from generation


def session(moment: datetime, first: int, runs) -> list:
    """One TUI session starting at `moment`, numbered from `first`; returns its snapshots,
    marked closed the way quitting the TUI does."""
    FakeClock.start(moment)                # before reset: the fresh assessment is stamped now
    seed.FIRST_NUMBER = first
    store.reset()
    lists.SESSION_ID = f"{moment:%Y%m%d-%H%M%S}-{random.Random(moment.day).getrandbits(16):04x}"
    for kwargs in runs:
        FakeClock.current += timedelta(minutes=kwargs.pop("gap", 0))
        play(**kwargs)
    out = []
    for assessment in lists.ASSESSMENTS:
        if assessment.run.started:
            data = snapshot.snapshot(assessment, session_closed=True)
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

    # One assessment per Lumina system, each with its own findings. The last Lumina run is the
    # showcase: the www.lumina.com scan the presenter runs (seed.FIRST_NUMBER), already
    # finished here. Other clients' websites follow.
    utc = timezone.utc
    showcase = seed.FIRST_NUMBER
    snapshots = []
    snapshots += session(datetime(2026, 10, 6, 2, 12, tzinfo=utc), 17, [
        dict(text="Review the source repository "
                  "git@git.lumina.com:platform/deploy.git for security issues.",
             triage=(
                 ("002", "fixed", "Registry password rotated and moved to the secret store."),
                 ("005", "accepted", "Covered by the monthly image rebuild."))),
    ])
    snapshots += session(datetime(2026, 10, 9, 7, 40, tzinfo=utc), 18, [
        dict(text="Assess https://careers.lumina.com for web security issues."),
    ])
    snapshots += session(datetime(2026, 10, 14, 3, 5, tzinfo=utc), 19, [
        dict(text="Scan the network host 10.20.0.15 for exposed services.",
             triage=(
                 ("001", "fixed", "Firewall now allows only the application servers."),)),
    ])
    snapshots += session(datetime(2026, 10, 20, 8, 26, tzinfo=utc), 20, [
        dict(text="Assess https://support.lumina.com for web security issues.",
             triage=(
                 ("003", "false-positive", "Served from Lumina and pinned at build."),)),
    ])
    snapshots += session(datetime(2026, 10, 23, 1, 51, tzinfo=utc), 21, [
        dict(text="Test the REST API at https://inventory.lumina.com/v2 for "
                  "security issues.",
             triage=(
                 ("003", "accepted", "Version 1 is switched off with the November release."),)),
    ])
    snapshots += session(datetime(2026, 10, 28, 6, 33, tzinfo=utc), 22, [
        dict(text="Scan the network range 10.20.4.0/24 for exposed services."),
    ])
    snapshots += session(datetime(2026, 11, 3, 2, 12, tzinfo=utc), 23, [
        dict(text="Review the source repository "
                  "git@git.lumina.com:shop/storefront.git for security issues.",
             triage=(
                 ("010", "accepted", "Tracked with the session rework planned for December."),)),
    ])
    snapshots += session(datetime(2026, 11, 6, 3, 5, tzinfo=utc), 24, [
        dict(text="Test the REST API at https://api.lumina.com/v1 for security "
                  "issues.",
             spec=str(SPEC)),
    ])
    snapshots += session(datetime(2026, 11, 10, 8, 26, tzinfo=utc), 25, [
        dict(text="Assess https://loyalty.lumina.com for web security issues.",
             triage=(
                 ("004", "fixed", "Older cipher suites removed at the load balancer."),)),
    ])
    snapshots += session(datetime(2026, 11, 12, 1, 51, tzinfo=utc), 26, [
        dict(text="Review the source repository "
                  "git@git.lumina.com:shop/checkout.git for security issues."),
        dict(text="Test the REST API at https://payments.lumina.com/v1 for "
                  "security issues.",
             high="reject", gap=47),
    ])
    snapshots += session(datetime(2026, 11, 17, 6, 33, tzinfo=utc), 28, [
        dict(text="Assess https://portal.lumina.com for web security issues.",
             triage=(
                 ("006", "fixed", "Directory listing turned off."),)),
        dict(text="Check account.lumina.com",
             stop_at="scope", gap=38),
    ])
    snapshots += session(datetime(2026, 11, 19, 2, 20, tzinfo=utc), 30, [
        dict(text="Review the source repository "
                  "git@git.lumina.com:shop/mobile-app.git for security issues.",
             signed_off=False),
    ])
    snapshots += session(datetime(2026, 11, 24, 2, 4, tzinfo=utc), showcase, [
        dict(text="Assess https://www.lumina.com for web security issues."),
    ])

    # Other clients' websites (stories in store/templates/companies.py), dated before the
    # Lumina history. Played last so every file above stays exactly as it was (the fake
    # clock's random steps are shared across sessions).
    snapshots += session(datetime(2026, 9, 22, 6, 40, tzinfo=utc), 14, [
        dict(text="Assess https://www.contoso.com for web security issues.", client="",
             triage=(
                 ("004", "fixed", "Uploads moved behind signed links."),
                 ("006", "accepted", "Header removal scheduled with the IIS upgrade."))),
    ])
    snapshots += session(datetime(2026, 9, 25, 2, 15, tzinfo=utc), 15, [
        dict(text="Assess https://shop.fabrikam.com for web security issues.", client="",
             triage=(
                 ("005", "fixed", "Directory listing turned off on the media server."),)),
    ])
    snapshots += session(datetime(2026, 10, 1, 8, 5, tzinfo=utc), 16, [
        dict(text="Assess https://www.northwind.com for web security issues.", client="",
             signed_off=False),
    ])

    for data in snapshots:
        path = out_dir / f"{data['uid']}.json"
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{path.name}: {data['status']}, {len(data['findings'])} findings")
    print(f"{len(snapshots)} assessments written to {out_dir}")


if __name__ == "__main__":
    main()
