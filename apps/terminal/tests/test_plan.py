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
        "Map the site", "Scan for weaknesses", "Validate findings",
        "Correlate & dedupe findings", "Generate report",
    ]
    # Nothing has run yet (scope not approved), so every task is pending.
    assert all(task.status == "pending" for task in tasks)


def test_each_template_names_its_own_plan():
    store.start_run("Review the repository at git@github.com:acme/app.git")
    # The repo picked Source Code at once, so its plan is there from the start.
    assert [task.label for task in store.plan_tasks()][:2] == [
        "Inventory the code", "Static, secret & dependency scans"]


def test_tasks_track_the_run_as_it_moves_through_the_phases():
    # Explicitly select a cookie tool to exercise the optional login pause.
    run_to("account", "test the API at https://api.example.com/v1 with Postman")
    status = {task.key: task.status for task in store.plan_tasks()}
    assert status["discovery"] == "done"      # discovery finished before the login gate
    assert status["scanning"] == "active"     # scanning is underway
    assert status["validation"] == "pending"
    assert status["report"] == "pending"


def test_report_task_is_active_when_complete_then_done_once_generated():
    # Every template includes analysis and report; exercise the network run.
    run_to(None, "scan 10.0.0.0/24 for open ports")
    status = {task.key: task.status for task in store.plan_tasks()}
    assert status["discovery"] == status["scanning"] == "done"
    assert status["validation"] == status["analysis"] == "done"
    assert status["report"] == "active"       # complete, report not generated yet
    store.generate_report("json")
    assert {t.key: t.status for t in store.plan_tasks()}["report"] == "done"

