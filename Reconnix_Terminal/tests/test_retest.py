"""Retest & trend: comparing an assessment to the previous run on the same target."""

from reconix import store
from reconix.models import Finding

from .support import run_to


def _finding(title: str, path: str) -> Finding:
    return Finding("x", "HIGH", title, path, "CONFIRMED", "", "", "", "", "")


def test_no_retest_for_a_single_assessment():
    run_to(None)
    assert store.retest() is None


def test_compare_findings_splits_new_recurring_and_resolved():
    previous = [_finding("A", "/a"), _finding("B", "/b")]
    current = [_finding("B", "/b"), _finding("C", "/c")]
    diff = store.compare_findings(previous, current)
    assert [f.title for f in diff["new"]] == ["C"]
    assert [f.title for f in diff["recurring"]] == ["B"]
    assert [f.title for f in diff["resolved"]] == ["A"]


def test_second_run_compares_to_the_first():
    run_to(None)                      # first assessment on staging.example.com
    store.new_assessment()            # keeps the first, starts a fresh one
    run_to(None)                      # second run on the same target
    result = store.retest()
    assert result is not None
    assert result["previous_label"]
    # same template → same findings → all recurring, nothing new or resolved
    assert result["counts"] == {"new": 0, "recurring": 3, "resolved": 0}


def test_severity_trend_lists_each_run_oldest_first():
    run_to(None)
    store.new_assessment()
    run_to(None)
    trend = store.severity_trend()
    assert len(trend) == 2
    assert all(point["total"] == 3 for point in trend)
    assert trend[0]["counts"]["MEDIUM"] == 2 and trend[0]["counts"]["HIGH"] == 0


def test_retest_shows_in_report_data_and_html():
    run_to(None)
    store.new_assessment()
    run_to(None)
    data = store.report_data()
    assert data["retest"]["counts"]["recurring"] == 3
    from reconix.store.report_html import render_html
    assert "Changes since last assessment" in render_html(data)
