"""The built-in slash commands. Handlers only call ReconixApp methods."""

from typing import TYPE_CHECKING, Callable, List, Optional

from .. import store
from ..models import Choice
from .registry import Command

if TYPE_CHECKING:
    from ..app import ReconixApp


# --- argument choices ----------------------------------------------------------
def _finding_choices(app: "ReconixApp") -> List[Choice]:
    return [Choice(f.fid.lower(), f"{f.fid}  {f.title}", f.effective_severity)
            for f in store.list_findings()]


def _template_choices(app: "ReconixApp") -> List[Choice]:
    return [Choice(t.id, t.name, t.description, disabled=not t.available)
            for t in store.list_templates()]


def _export_choices(app: "ReconixApp") -> List[Choice]:
    return [Choice(f.id, f.name, f.description, disabled=not f.available)
            for f in store.list_report_formats()]


# --- handlers --------------------------------------------------------------------
def _goto(name: str) -> Callable[["ReconixApp", Optional[str]], None]:
    def run(app: "ReconixApp", arg: Optional[str]) -> None:
        app.goto(name)
    return run


def _open_finding(app: "ReconixApp", fid: Optional[str]) -> None:
    for finding in store.list_findings():
        if finding.fid.lower() == (fid or "").lower():
            app.open_finding(finding.fid)
            return


COMMANDS = (
    Command("help", "Show shortcuts for this screen", lambda app, arg: app.action_help()),
    Command("new", "Start a new assessment (optionally on a target)",
            lambda app, arg: app.new_assessment(arg), aliases=("start",)),
    Command("template", "Pick a template, then type its target",
            lambda app, tid: app.open_template(tid), choices=_template_choices,
            question="Which kind of target?", aliases=("templates",), ask=False),
    Command("plan", "Review and run the test plan", _goto("plan")),
    Command("approval", "Open the approval gate", _goto("approval")),
    Command("status", "Live execution (after the plan runs)", _goto("execution"),
            aliases=("execution",)),
    Command("findings", "List all findings", _goto("findings")),
    Command("finding", "Open one finding…", _open_finding,
            choices=_finding_choices, question="Which finding?",
            empty="No findings yet. They appear as testing finds them."),
    Command("report", "Open the assessment report", _goto("report")),
    Command("export", "Export the report…", lambda app, fmt: app.export_report(fmt),
            choices=_export_choices, question="Export the report as…"),
    Command("summary", "Show the assessment summary", lambda app, arg: app.show_summary()),
    Command("assessments", "List and reopen assessments",
            lambda app, arg: app.open_assessments(), aliases=("list",)),
    Command("audit", "Activity log and audit trail", lambda app, arg: app.show_audit(),
            aliases=("activity", "log")),
    Command("add-on", "Add reference files for the AI (knowledge add-ons)",
            lambda app, path: app.add_on_command(path), aliases=("addon",), ask=False),
    Command("web", "Open the web dashboard in your browser (starts it if needed)",
            lambda app, arg: app.open_web_dashboard(), aliases=("dashboard",)),
    Command("quit", "Quit Reconix", lambda app, arg: app.exit(), aliases=("exit",)),
)
