"""The dashboard plan: named tasks per template, their status read live from the run."""

from reconix import store

from .support import ASK_REQUEST, run_to


def test_there_is_no_plan_before_a_template_is_chosen():
    store.start_run(ASK_REQUEST)                # a bare hostname waits for the template
    assert store.plan_tasks() == []


def test_the_plan_is_named_for_the_chosen_template():
    run_to("scope")
    tasks = store.plan_tasks()
    assert [task.label for task in tasks] == [
        "Reconnaissance", "Content discovery", "Vulnerability scanning",
        "Finding validation",
    ]
    # Nothing has run yet (scope not approved), so every task is pending.
    assert all(task.status == "pending" for task in tasks)


def test_each_template_names_its_own_plan():
    store.start_run("Review the repository at git@github.com:acme/app.git")
    # The repo picked Source Code at once, so its plan is there from the start.
    assert [task.label for task in store.plan_tasks()][:2] == [
        "Index repository", "Static analysis scan"]


def test_tasks_track_the_run_as_it_moves_through_the_phases():
    # The API template still signs in, so it pauses at a login gate mid-run (the default
    # web_url scan is now unauthenticated and never stops there).
    run_to("account", "test the API at https://api.example.com/v1")
    status = {task.key: task.status for task in store.plan_tasks()}
    assert status["discovery"] == "done"      # discovery finished before the login gate
    assert status["scanning"] == "active"     # scanning is underway
    assert status["validation"] == "pending"
    assert status["report"] == "pending"


def test_report_task_is_active_when_complete_then_done_once_generated():
    # analysis + report are no longer web_url plan tasks; a network scan keeps the full tail.
    run_to(None, "scan 10.0.0.0/24 for open ports")
    status = {task.key: task.status for task in store.plan_tasks()}
    assert status["discovery"] == status["scanning"] == "done"
    assert status["validation"] == status["analysis"] == "done"
    assert status["report"] == "active"       # complete, report not generated yet
    store.generate_report("json")
    assert {t.key: t.status for t in store.plan_tasks()}["report"] == "done"

