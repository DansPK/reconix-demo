"""Frame 08 — Security assessment report: summary, severity, key findings, exports."""

from typing import Iterable

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, DataTable, Static

from .base import ReconixScreen
from .. import store, theme
from ..widgets.findings import cvss_text, severity_bars, severity_text, triage_text

# (format id, key, label): a button and a key per report format (PDF, JSON, DOCX), the same
# three that /export offers. The bindings and the buttons are both built from this.
EXPORTS = (("pdf", "p", "PDF"), ("json", "j", "JSON"), ("docx", "w", "DOCX"))


def executive_summary() -> str:
    data = store.report_data()
    counters = store.counters()
    who = f" for {data['client']}" if data["client"] else ""
    return (f"{data['template'] or 'An'} assessment of {data['target']}{who} "
            f"({data['mode']}). {data['summary'].capitalize()}. {counters['blocked']} "
            f"out-of-scope request(s) were blocked by the policy engine; "
            f"{counters['approvals']} risky action(s) ran only after a human approved them.")


def retest_line() -> Text:
    retest = store.retest()
    if not retest:
        return Text("First assessment of this target in this session.", style=theme.DIM)
    counts = retest["counts"]
    return Text.assemble(
        (f"vs {retest['previous_label']}:  ", theme.DIM),
        (f"{counts['new']} new", theme.HIGH), ("  ·  ", theme.DIM),
        (f"{counts['recurring']} recurring", theme.MEDIUM), ("  ·  ", theme.DIM),
        (f"{counts['resolved']} resolved", theme.GREEN))


class ReportScreen(ReconixScreen):
    flow_name = "report"
    mode_name = "REPORT"

    BINDINGS = [
        *(Binding(key, f"export('{fid}')", f"export {label}") for fid, key, label in EXPORTS),
        Binding("c", "chat", "chat"),
        Binding("escape", "back", "back", show=False),
    ]

    def view_state(self) -> object:
        run = store.get_run()
        return (run.completed, bool(run.stopped), run.report_path,
                tuple((f.fid, f.status) for f in store.list_findings()))

    def compose_body(self) -> ComposeResult:
        assessment = store.get_assessment()
        ready = store.is_completed()
        yield Static(Text.assemble(("◆ reconix ", theme.CYAN), (
            f"security assessment report · {assessment.label}", theme.DIM)), classes="ai-label")
        if not ready:
            yield Static(Text(self._not_ready(), style=theme.MEDIUM), classes="panel-note")
        with Vertical(classes="panel") as panel:
            panel.border_title = "▬ SECURITY ASSESSMENT REPORT"
            panel.border_subtitle = Text(" · ".join(assessment.methodology)
                                         or "OWASP WSTG format")
            yield Static(Text("Executive Summary", style=f"bold {theme.TEXT}"))
            yield Static(Text(executive_summary() if store.get_scope() else
                              "No assessment has run yet.", style=theme.MUTED))
            yield Static("")
            yield Static(Text("Findings by Severity", style=f"bold {theme.TEXT}"))
            yield Static(severity_bars(store.severity_counts()))
            yield Static("")
            yield Static(Text("Key Findings", style=f"bold {theme.TEXT}"))
            table = DataTable(id="report-table", cursor_type="none", zebra_stripes=True)
            table.add_columns("ID", "FINDING", "SEVERITY", "CVSS", "VALIDATION", "STATUS",
                              "SOURCE")
            for f in store.key_findings(limit=4):
                table.add_row(
                    Text(f.fid, style=theme.KEY), Text(f.title), severity_text(f),
                    Text(cvss_text(f), style=theme.MUTED),
                    Text(f.validation.title(),
                         style=theme.MEDIUM if f.needs_review else theme.TEAL),
                    triage_text(f), Text(f.tool, style=theme.MUTED),
                )
            yield table
            yield Static("")
            yield Static(Text("Changes since the last assessment", style=f"bold {theme.TEXT}"))
            yield Static(retest_line())
        with Horizontal(classes="actions"):
            yield from self._buttons(ready)
        path = store.get_run().report_path
        footer = (Text.assemble(("✓ report saved: ", theme.GREEN), (path, theme.TEXT),
                                ("  ·  ", theme.DIM), ("/summary", f"bold {theme.TEAL}"),
                                (" to open it", theme.DIM))
                  if path else Text("← back · 1 to restart · ^Q quit", style=theme.DIM))
        yield Static(footer)

    @staticmethod
    def _not_ready() -> str:
        run = store.get_run()
        if run.stopped:
            return (f"The assessment stopped ({run.stopped}), so no report can be exported. "
                    "Partial findings are listed below.")
        return "The report can be exported once the assessment completes."

    @staticmethod
    def _buttons(ready: bool) -> Iterable[Button]:
        formats = {f.id: f for f in store.list_report_formats()}
        for i, (fid, key, label) in enumerate(EXPORTS):
            available = formats[fid].available
            text = f"{key}  {label}" if available else f"{label} (not installed)"
            yield Button(text, id=fid, classes="primary" if i == 0 else "ghost-cyan",
                         disabled=not (ready and available))

    # --- actions ----------------------------------------------------------------------------
    def action_export(self, fmt: str) -> None:
        self.app.export_report(fmt)

    def action_back(self) -> None:
        self.app.go_prev()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        event.stop()
        self.action_export(event.button.id)
