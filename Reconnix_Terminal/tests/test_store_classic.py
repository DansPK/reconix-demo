"""Store additions for the classic flow: the plan gate, stop / reject, the plan rows, the
findings view, the flow line, and how a saved copy reports the plan gate."""

import pytest

from reconix import store
from reconix.store import snapshot

from .support import decide, event_kinds, play_until_gate, run_to


# --- the plan gate ---------------------------------------------------------------------------
def test_testing_waits_for_the_plan_to_run():
    run_to("plan")
    assert store.waiting_gate() == "plan"
    assert store.display_phase() == "plan_pending"
    assert store.phase_progress()["discovery"] == 0          # nothing tested yet
    store.run_plan()
    assert store.is_plan_started()
    assert play_until_gate() == "account"
    assert store.phase_progress()["discovery"] == 100
    assert "plan.run" in event_kinds()


def test_the_plan_runs_only_when_reconix_asks_and_only_once():
    with pytest.raises(store.StoreValidationError):
        store.run_plan()                                     # no run yet
    run_to("scope")
    with pytest.raises(store.StoreValidationError):
        store.run_plan()                                     # the scope comes first
    decide("scope")
    assert play_until_gate() == "plan"
    store.run_plan()
    with pytest.raises(store.StoreValidationError):
        store.run_plan()


# --- stopping and rejecting -----------------------------------------------------------------
def test_stop_keeps_the_findings_so_far_and_plays_nothing_more():
    run_to("approval:approval-001")
    found = len(store.list_findings())
    store.stop_run()
    assert store.is_finished() and not store.is_completed()
    assert store.advance() is None
    assert len(store.list_findings()) == found
    assert store.get_run().stopped == "you stopped it"
    with pytest.raises(store.StoreValidationError):
        store.stop_run()                                     # already stopped


def test_stop_needs_a_running_assessment():
    with pytest.raises(store.StoreValidationError):
        store.stop_run()


def test_reject_scope_stops_before_anything_is_tested():
    run_to("scope")
    store.reject_scope()
    assert store.get_run().stopped == "you rejected the scope"
    assert not store.is_scope_approved()
    assert store.counters()["requests"] == 0
    assert event_kinds()[-2:] == ["scope.rejected", "run.stopped"]
    with pytest.raises(store.StoreValidationError):
        store.reject_scope()                                 # it already stopped


def test_reject_scope_only_at_the_scope_gate():
    run_to("plan")
    with pytest.raises(store.StoreValidationError):
        store.reject_scope()


# --- the plan rows ------------------------------------------------------------------------------
def test_plan_rows_name_phases_login_and_gated_actions():
    assert store.plan_overview() == []                       # no template yet
    run_to("scope")
    rows = store.plan_overview()
    assert [r.num for r in rows] == ["1", "2", "2a", "3", "3a", "3b", "4", "5"]
    assert [r.gate for r in rows] == ["auto", "auto", "login", "auto", "approve", "approve",
                                      "auto", "auto"]
    medium, high = rows[4], rows[5]
    assert (medium.risk, high.risk) == ("MEDIUM", "HIGH")
    assert medium.command.startswith("GET https://staging.example.com/api/orders/")
    assert all(r.status == "pending" for r in rows)
    assert store.gated_count() == 2


def test_plan_rows_follow_the_run():
    run_to("approval:approval-002")
    status = {r.num: r.status for r in store.plan_overview()}
    assert status["1"] == status["2"] == "done"
    assert status["2a"] == "done"                            # logged in
    assert status["3a"] == "done"                            # MEDIUM approved
    assert status["3b"] == "active"                          # waiting for you now
    request = store.get_approval("approval-002")
    store.reject(request.request_id)
    assert {r.num: r.status for r in store.plan_overview()}["3b"] == "rejected"


def test_a_network_plan_has_no_login_row():
    run_to("scope", request="scan 10.0.0.0/24 for open ports")
    assert "login" not in [r.gate for r in store.plan_overview()]


# --- the findings view ---------------------------------------------------------------------------
def test_filters_sorts_and_counts():
    run_to(None)
    ids = lambda rows: [f.fid for f in rows]                 # noqa: E731
    assert ids(store.find_findings()) == ["001", "002", "003"]
    assert ids(store.find_findings("high_up")) == []       # the web demo has no HIGH finding
    assert ids(store.find_findings("medium")) == ["001", "002"]
    assert ids(store.find_findings("low")) == ["003"]
    assert ids(store.find_findings("confirmed")) == ["001"]
    assert ids(store.find_findings("needs_review")) == ["002", "003"]
    assert ids(store.find_findings("all", "validation")) == ["001", "002", "003"]
    assert [sid for sid, _ in store.FINDING_SORTS] == ["severity", "validation"]
    assert "info" not in dict(store.FINDING_FILTERS)
    assert store.severity_counts() == {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 2, "LOW": 1}
    assert store.filter_counts()["all"] == 3
    with pytest.raises(store.StoreValidationError):
        store.find_findings("nope")
    with pytest.raises(store.StoreValidationError):
        store.find_findings("all", "nope")
    for removed in ("cvss", "id"):
        with pytest.raises(store.StoreValidationError):
            store.find_findings("all", removed)


def test_triage_moves_findings_between_filters_and_override_counts():
    run_to(None)
    with pytest.raises(store.StoreValidationError):
        store.triage_finding("003", severity="INFO")          # there is no Info severity
    store.triage_finding("003", status="false-positive", severity="MEDIUM")
    assert [f.fid for f in store.find_findings("open")] == ["001", "002"]
    assert [f.fid for f in store.find_findings("triaged")] == ["003"]
    assert [f.fid for f in store.find_findings("medium")] == ["001", "002", "003"]  # override
    assert store.severity_counts()["LOW"] == 0
    assert [f.fid for f in store.key_findings(limit=2)] == ["001", "002"]


# --- the flow line -------------------------------------------------------------------------------
def test_step_states_follow_the_run():
    assert store.step_states() == {}
    run_to("scope")
    assert store.step_states() == {"start": "done", "template": "waiting"}
    decide("scope")
    play_until_gate()
    assert store.step_states()["plan"] == "waiting"
    decide("plan")
    play_until_gate()                                       # account
    assert store.step_states()["execution"] == "waiting"
    decide("account")
    play_until_gate()                                       # the one-time code, on its own
    assert store.step_states()["execution"] == "waiting"
    decide("code")
    play_until_gate()                                       # MEDIUM approval
    assert store.step_states()["approval"] == "waiting"
    run_to_end()
    states = store.step_states()
    assert states["approval"] == states["execution"] == "done"
    store.generate_report("json")
    assert store.step_states()["report"] == "done"


def run_to_end():
    while True:
        decide(store.waiting_gate())
        if play_until_gate() is None:
            return


def test_step_states_mark_where_a_run_stopped():
    run_to("scope")
    store.reject_scope()
    assert store.step_states()["template"] == "stopped"
    store.new_assessment()
    run_to("approval:approval-002")
    store.reject(store.get_approval("approval-002").request_id)
    store.advance()
    states = store.step_states()
    assert states["approval"] == states["execution"] == "stopped"


# --- the saved copy ------------------------------------------------------------------------------
def test_a_saved_copy_names_the_plan_gate_until_the_plan_runs():
    run_to("plan")
    data = snapshot.snapshot(store.get_assessment())
    assert (data["waiting_gate"], data["waiting_for"]) == ("plan", "plan review")
    store.run_plan()
    assert snapshot.snapshot(store.get_assessment())["waiting_gate"] == ""
