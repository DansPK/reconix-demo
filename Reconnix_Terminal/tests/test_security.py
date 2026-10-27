"""Secrets, tampering, injection and file safety."""

import dataclasses
import json
import zipfile

import pytest

from reconix import store
from reconix.models import Secret
from reconix.models.scope import PolicyVerdict
from reconix.store import lists, report
from reconix.store.report_html import render_html

from .support import ASK_REQUEST, TEST_PASSWORD, play_until_gate, run_to, run_to_end

HIGH = "approval-002"


# --- secrets -------------------------------------------------------------------------------
def test_a_secret_never_prints_itself():
    secret = Secret(TEST_PASSWORD)
    assert TEST_PASSWORD not in repr(secret) + str(secret) + f"{secret}"
    assert secret.reveal() == TEST_PASSWORD


def test_the_stored_account_never_shows_the_password():
    run_to(None)
    account = lists.current().vault[-1]
    assert TEST_PASSWORD not in repr(account)
    assert TEST_PASSWORD not in repr(dataclasses.asdict(account))


# --- approvals ------------------------------------------------------------------------------
def test_a_request_changed_after_it_was_shown_is_refused():
    run_to("approval:approval-001")
    request = store.get_approval("approval-001")
    shown_hash = request.command_hash
    request.command = request.command.replace("10482", "99999")
    with pytest.raises(store.StoreValidationError, match="changed"):
        store.approve("approval-001", command_hash=shown_hash)


def test_only_the_newest_confirmation_token_works():
    run_to(f"approval:{HIGH}")
    request = store.get_approval(HIGH)
    first = store.request_confirmation(HIGH, request.command_hash)
    second = store.request_confirmation(HIGH, request.command_hash)
    with pytest.raises(store.StoreValidationError):
        store.approve(HIGH, command_hash=request.command_hash, confirmation_token=first)
    store.approve(HIGH, command_hash=request.command_hash, confirmation_token=second)


def test_a_high_token_is_not_given_for_a_medium_action():
    run_to("approval:approval-001")
    request = store.get_approval("approval-001")
    with pytest.raises(store.StoreValidationError):
        store.request_confirmation("approval-001", request.command_hash)


def test_the_password_cant_be_given_at_the_code_step():
    run_to("code")
    before = list(lists.current().vault)
    with pytest.raises(store.StoreValidationError, match="digits"):
        store.provide_auth({"identity": "intruder", "secret": "other-password"})
    assert lists.current().vault == before and not store.is_code_verified()


def test_a_template_is_chosen_once():
    run_to("template", ASK_REQUEST)
    store.select_template("web_url")
    with pytest.raises(store.StoreValidationError):
        store.select_template("web_url")


# --- reports --------------------------------------------------------------------------------------
@pytest.mark.parametrize("bad_id", ["../../escape", "a/b", ".hidden", "", "x" * 80])
def test_reports_never_leave_the_reports_folder(reports_dir, bad_id):
    run_to(None)
    lists.current().assessment_id = bad_id
    with pytest.raises(store.StoreValidationError):
        store.generate_report("json")
    assert not any(reports_dir.parent.parent.glob("escape*"))


def test_json_report_is_valid_and_has_no_secret(reports_dir):
    run_to(None)
    store.generate_report("json")
    data = json.loads((reports_dir / "RCX-DEMO-001.json").read_text())
    assert TEST_PASSWORD not in json.dumps(data)


KEY_BODY = "MIIBOgIBAAJBAKs3cr3tKeyB0dyL1ne"


def _secrets_everywhere_a_report_prints() -> None:
    """The test password in a blocked request, an approval's reason and operator and the scope's
    tools and excluded paths, and a private key stored one evidence entry per line."""
    store.start_run(store.DEMO_REQUEST)
    assert play_until_gate() == "scope"
    store.edit_scope(tools=["Nuclei", f"api_key={TEST_PASSWORD}"],
                     excluded_paths=["/admin", f"/backup?token={TEST_PASSWORD}"])
    store.approve_scope()
    run_to_end()
    current = lists.current()
    current.verdicts += [
        PolicyVerdict("GET", f"https://admin:{TEST_PASSWORD}@staging.example.com/x", False,
                      "Host outside approved scope"),
        PolicyVerdict("GET", f"/export?token={TEST_PASSWORD}", False,
                      f"Path outside approved scope (password={TEST_PASSWORD})"),
    ]
    current.decisions[0] = dataclasses.replace(
        current.decisions[0], reason=f"ok, Authorization: Bearer {TEST_PASSWORD}",
        operator=f"https://analyst:{TEST_PASSWORD}@sso.example.com")
    current.findings[0].evidence[:] = ["GET /backup/key.pem → 200",
                                       "-----BEGIN RSA PRIVATE KEY-----", KEY_BODY,
                                       "-----END RSA PRIVATE KEY-----"]


def test_no_report_shows_a_secret_from_the_scope_the_policy_or_the_approvals(reports_dir):
    _secrets_everywhere_a_report_prints()
    texts = {"html (the PDF)": render_html(store.report_data())}
    store.generate_report("json")
    texts["json"] = (reports_dir / "RCX-DEMO-001.json").read_text("utf-8")
    if report.HAS_DOCX:
        store.generate_report("docx")
        with zipfile.ZipFile(reports_dir / "RCX-DEMO-001.docx") as docx:
            texts["docx"] = "".join(docx.read(n).decode("utf-8") for n in docx.namelist()
                                    if n.endswith((".xml", ".rels")))
    for name, text in texts.items():
        assert TEST_PASSWORD not in text, name
        assert KEY_BODY not in text, name
        assert "staging.example.com/x" in text, name           # the blocked row is there
        assert "(private key)" in text, name
    data = json.loads(texts["json"])
    assert data["scope"]["tools"] == ["Nuclei", "api_key=••••"]
    assert data["approvals"][0]["operator"] == "https://••••@sso.example.com"
    assert data["findings"][0]["evidence"] == ["GET /backup/key.pem → 200",
                                               "•••• (private key)"]
    if report.HAS_DOCX:
        assert "/backup?token=••••" in texts["docx"]
        assert "https://••••@sso.example.com" in texts["docx"]


def test_the_saved_copy_masks_a_private_key_split_over_evidence_entries():
    from reconix.store import snapshot

    _secrets_everywhere_a_report_prints()
    saved = json.dumps(snapshot.snapshot(lists.current()), ensure_ascii=False)
    assert KEY_BODY not in saved and TEST_PASSWORD not in saved


# --- review round 2 ---------------------------------------------------------------------------
@pytest.mark.parametrize("target", ["/admin%00", "/admin%00x", "/admin%09", "/admin%0a",
                                     "/public/..;/admin"])
def test_encoded_control_chars_and_matrix_params_cannot_reach_an_excluded_path(target):
    run_to("account")                                  # web_url scope, excluded /admin
    assert not store.check_request("GET", target).allowed


def test_edit_scope_refuses_after_approval():
    run_to("account")                                  # scope already approved by now
    with pytest.raises(store.StoreValidationError):
        store.edit_scope(excluded_paths=[])


def test_edit_scope_network_refuses_empty_ports():
    store.start_run("scan 10.0.0.0/24 for open ports")
    assert play_until_gate() == "scope"                # the range picked Network
    with pytest.raises(store.StoreValidationError):
        store.edit_scope(allowed_ports=[])
