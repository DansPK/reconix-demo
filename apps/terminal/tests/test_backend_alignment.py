"""Current backend semantics at the static store boundary; no network or tools."""

import json
import re
from pathlib import Path

import pytest

from reconix import store
from reconix.store import lists
from reconix.store.findings import confirmed_count
from reconix.store.snapshot import snapshot
from reconix.widgets.findings import for_display, validation_text

from .support import run_to
from .test_static_data import _HOST, _is_reserved


def test_authored_proof_is_distinct_from_scanner_claims():
    run_to(None)
    finding = store.get_finding("004")
    assert finding.confirmed
    assert finding.effective_verification["status"] == "VERIFIED"
    assert finding.validation_proof and finding.source_claims
    saved = next(f for f in snapshot(lists.current())["findings"] if f["id"] == "004")
    assert saved["evidence_quality"] == "HIGH"
    assert "4532 9859 9256 5466" not in json.dumps(saved["effective_verification"])
    finding.effective_verification = None
    assert "legacy, not verified" in validation_text(finding).plain


def test_static_source_patterns_do_not_claim_runtime_exploitation():
    run_to(None, "review git@git.example.com:shop/storefront.git")
    for finding in store.list_findings():
        assert not finding.confirmed
        assert finding.finding_category == "POTENTIAL_VULNERABILITY"
        assert finding.effective_verification["status"] == "UNVERIFIED"
        assert finding.exploitability == "PLAUSIBLE"
    assert confirmed_count() == 0
    assert not store.find_findings("confirmed")
    assert all(f["validation"] != "CONFIRMED" for f in store.report_data()["findings"])


def test_new_classification_proof_fields_are_masked_for_display():
    run_to(None)
    finding = store.get_finding("004")
    finding.validation_proof = ["Authorization: Bearer secret-access-token"]
    finding.effective_verification["proof_lines"] = list(finding.validation_proof)
    rendered = for_display(finding)
    assert "secret-access-token" not in str(rendered.validation_proof)
    assert "secret-access-token" not in str(rendered.effective_verification)


def test_report_generation_and_review_are_separate_decisions():
    with pytest.raises(store.StoreValidationError):
        store.sign_off_report()
    run_to(None)
    store.generate_report("json")
    version = snapshot(lists.current())["reports"][0]
    assert version["report_status"] == "READY"
    assert version["review_status"] == "PENDING" and not version["signed_off"]
    store.sign_off_report()
    assert snapshot(lists.current())["reports"][0]["signed_off"]
    store.generate_report("json")
    assert not snapshot(lists.current())["reports"][0]["signed_off"]
    assert snapshot(lists.current())["reports"][0]["version"] == 2
    store.sign_off_report()
    store.triage_finding("004", note="Priority remediation scheduled.")
    assert not snapshot(lists.current())["reports"]
    assert next(t for t in store.plan_tasks() if t.key == "report").status == "active"
    with pytest.raises(store.StoreValidationError):
        store.sign_off_report()


def test_classified_false_positive_needs_no_vulnerability_review():
    run_to(None)
    finding = store.get_finding("004")
    finding.finding_category = "FALSE_POSITIVE"
    assert finding.false_positive
    assert not finding.confirmed and not finding.needs_review
    assert finding not in store.find_findings("confirmed")
    assert finding not in store.find_findings("needs_review")


def test_checked_in_snapshots_keep_reserved_hosts_and_report_review_examples():
    folder = Path(__file__).resolve().parents[1] / "web" / "sample-data"
    reports = []
    for path in folder.glob("*.json"):
        text = path.read_text(encoding="utf-8")
        # These exact generated report filenames are artifacts, not hostnames. The
        # original runtime snapshot guard remains unchanged and checks every host.
        text = re.sub(r"\bRCX-\d+\.(?:docx|pdf)\b", "report-file", text)
        unexpected = sorted({m.group(1) for m in _HOST.finditer(text)
                             if not _is_reserved(m.group(1))})
        assert not unexpected, (path.name, unexpected)
        reports.extend(json.loads(text).get("reports", []))
    assert any(r["signed_off"] for r in reports)
    assert any(not r["signed_off"] for r in reports)
