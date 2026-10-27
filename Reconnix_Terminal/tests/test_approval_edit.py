"""Editing where a gated action runs ("Edit params"), in every template, through the store."""

import pytest

from reconix import store
from reconix.store import lists
from reconix.store.approvals import command_digest
from reconix.store.snapshot import snapshot

from .support import decide, play_until_gate, run_to, run_to_end

# (request, a value the policy allows, values it blocks, a value of the wrong shape)
TEMPLATES = [
    pytest.param(store.DEMO_REQUEST, "/api/orders/10490",
                 ["/admin/users", "/admin;x=1", "/a%2fb"],
                 "https://staging.example.com/api/orders/1", id="web_url"),
    pytest.param("test the API at https://api.example.com/v1", "/v1/orders/9000",
                 ["/internal/metrics", "/admin"], "v1/orders/9000", id="api"),
    pytest.param("Assess 10.0.0.0/24", "10.0.0.9:443",
                 ["10.0.0.9:3306", "198.51.100.9:8443", "10.0.0.0/24:8443"], "10.0.0.9",
                 id="network"),
    pytest.param("review repo https://git.example.com/acme/app.git", "app/config/local.py",
                 [".git/config", "secrets/key.pem", "../../etc/passwd", "app/../../x"],
                 "/etc/passwd", id="source"),
]
FIRST, SECOND = "approval-001", "approval-002"


def snapshot_of(request_id: str):
    request = store.get_approval(request_id)
    return request.path, request.target, request.command, request.command_hash


def event_kinds():
    return [event.kind for event in store.list_events()]


# --- a valid edit ----------------------------------------------------------------------------
@pytest.mark.parametrize("request_text, good, blocked, wrong_shape", TEMPLATES)
def test_an_edit_rebuilds_the_exact_request(request_text, good, blocked, wrong_shape):
    run_to(f"approval:{FIRST}", request_text)
    old_hash = store.get_approval(FIRST).command_hash
    request = store.edit_approval(FIRST, good)
    assert request.path == good
    assert good in request.target and good in request.command
    assert "{path}" not in request.target + request.command
    assert request.command_hash == command_digest(request.command) != old_hash
    assert request.risk == "MEDIUM" and store.get_approval(FIRST).method == request.method
    assert "approval.edited" in event_kinds()
    assert any(e.message.startswith("Edited ") for e in store.list_activity())
    with pytest.raises(store.StoreValidationError):          # what was shown before
        store.approve(FIRST, command_hash=old_hash)
    store.approve(FIRST, command_hash=request.command_hash)
    run_to_end()
    assert store.is_completed()


# --- refused edits change nothing ----------------------------------------------------------------
@pytest.mark.parametrize("request_text, good, blocked, wrong_shape", TEMPLATES)
def test_the_policy_refuses_an_edit_outside_the_scope(request_text, good, blocked, wrong_shape):
    run_to(f"approval:{FIRST}", request_text)
    before, verdicts = snapshot_of(FIRST), len(store.list_verdicts())
    for value in blocked:
        with pytest.raises(store.StoreValidationError, match="Blocked by policy"):
            store.edit_approval(FIRST, value)
    assert snapshot_of(FIRST) == before
    assert len(store.list_verdicts()) == verdicts        # a refused edit isn't a request
    assert "approval.edit_refused" in event_kinds()


@pytest.mark.parametrize("request_text, good, blocked, wrong_shape", TEMPLATES)
def test_a_value_of_the_wrong_shape_is_refused(request_text, good, blocked, wrong_shape):
    run_to(f"approval:{FIRST}", request_text)
    before = snapshot_of(FIRST)
    for value in (wrong_shape, "", "   ", good + " x", good[:3] + "\t" + good[3:],
                  "/" + "a" * 200, "https://evil.example.net/x"):
        with pytest.raises(store.StoreValidationError):
            store.edit_approval(FIRST, value)
    assert snapshot_of(FIRST) == before


# --- when an edit is allowed -------------------------------------------------------------------
def test_edits_only_at_the_plan_or_the_actions_own_gate():
    run_to("scope")
    assert not store.can_edit(FIRST)
    with pytest.raises(store.StoreValidationError):
        store.edit_approval(FIRST, "/api/orders/10490")      # the scope isn't approved yet
    decide("scope")
    assert play_until_gate() == "plan"
    assert store.can_edit(FIRST) and store.can_edit(SECOND)
    decide("plan")
    assert play_until_gate() == "account"                   # testing has started
    assert not store.can_edit(FIRST)
    decide("account")
    run_until(f"approval:{FIRST}")
    assert store.can_edit(FIRST) and not store.can_edit(SECOND)   # only the one asked
    with pytest.raises(store.StoreValidationError):
        store.edit_approval(SECOND, "/api/orders/10491")
    decide(f"approval:{FIRST}")
    with pytest.raises(store.StoreValidationError, match="already decided"):
        store.edit_approval(FIRST, "/api/orders/10490")


def run_until(gate: str) -> None:
    """Play on, deciding every other gate, until `gate` is waiting."""
    while True:
        waiting = play_until_gate()
        assert waiting is not None, f"the run ended before {gate}"
        if waiting == gate:
            return
        decide(waiting)


def test_an_edit_on_the_plan_is_what_the_gate_asks_later():
    run_to("plan")
    edited = store.edit_approval(SECOND, "/api/orders/10499")
    decide("plan")
    run_until(f"approval:{SECOND}")
    shown = store.get_approval(SECOND)
    assert shown.path == "/api/orders/10499" and shown.command_hash == edited.command_hash
    row = next(r for r in store.plan_overview() if r.label == shown.action)
    assert "/api/orders/10499" in row.command


def test_the_same_value_changes_nothing():
    run_to(f"approval:{FIRST}")
    before = snapshot_of(FIRST)
    store.edit_approval(FIRST, before[0])
    assert snapshot_of(FIRST) == before
    assert "approval.edited" not in event_kinds()


def test_an_unknown_or_uneditable_action_is_refused():
    run_to(f"approval:{FIRST}")
    with pytest.raises(store.StoreValidationError):
        store.edit_approval("approval-999", "/x")
    lists.current().approvals[0].param_label = ""
    with pytest.raises(store.StoreValidationError, match="nothing to edit"):
        store.edit_approval(FIRST, "/api/orders/10490")


# --- HIGH risk: an edit voids the confirmation ------------------------------------------------
def test_an_edit_voids_an_open_high_confirmation():
    run_to(f"approval:{SECOND}")
    request = store.get_approval(SECOND)
    token = store.request_confirmation(SECOND, request.command_hash)
    edited = store.edit_approval(SECOND, "/api/orders/10499")
    assert edited.risk == "HIGH"                              # an edit never lowers the risk
    with pytest.raises(store.StoreValidationError):
        store.approve(SECOND, command_hash=edited.command_hash, confirmation_token=token)
    fresh = store.request_confirmation(SECOND, edited.command_hash)
    store.approve(SECOND, command_hash=edited.command_hash, confirmation_token=fresh)
    assert store.is_approved(SECOND)


# --- what is saved ---------------------------------------------------------------------------
def test_the_saved_copy_has_the_edited_request_and_no_patterns():
    run_to(f"approval:{FIRST}")
    store.edit_approval(FIRST, "/api/orders/10490")
    saved = next(a for a in snapshot(lists.current())["approvals"]
                 if a["request_id"] == FIRST)
    assert saved["path"] == "/api/orders/10490"
    assert saved["command_hash"] == store.get_approval(FIRST).command_hash
    assert set(saved) == {"request_id", "risk", "action", "target", "method", "path",
                          "purpose", "impact", "command", "command_hash"}
