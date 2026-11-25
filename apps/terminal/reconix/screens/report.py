"""Frame 08 — Security assessment report: summary, severity, key findings, exports."""

from typing import Iterable, List, Tuple

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, DataTable, Static

from .base import ReconixScreen
from .. import store, theme
from ..widgets.findings import cvss_text, severity_bars, severity_text, triage_text, validation_text

# (format id, key, label): a button and a key per report format (PDF, JSON, DOCX), the same
# three that /export offers. The bindings and the buttons are both built from this.
EXPORTS = (("pdf", "p", "PDF"), ("json", "j", "JSON"), ("docx", "w", "DOCX"))

TITLE_WIDTH = 40          # a longer finding title is cut in the Key Findings table


def _cut(title: str) -> str:
    return title if len(title) <= TITLE_WIDTH else title[:TITLE_WIDTH - 1] + "…"


def key_finding_rows() -> List[Tuple[Text, ...]]:
    """The Key Findings table's rows. Title and tool come from report_data(), masked as in
    every export, so the preview never shows what a saved report wouldn't."""
    masked = ({row["id"]: row for row in store.report_data()["findings"]}
              if store.get_scope() else {})
    rows = []
    for f in store.key_findings(limit=4):
        row = masked.get(f.fid, {})
        rows.append((
            Text(f.fid, style=theme.KEY), Text(_cut(row.get("title") or "—")),
            severity_text(f), Text(cvss_text(f), style=theme.MUTED),
            validation_text(f),
            triage_text(f), Text(row.get("tool") or "—", style=theme.MUTED),
        ))
    return rows


def can_export(fmt: str) -> bool:
    """The run is complete and `fmt` is installed (the store checks both again)."""
    formats = {f.id: f for f in store.list_report_formats()}
    return store.is_completed() and fmt in formats and formats[fmt].available


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
        Binding("a", "sign_off", "sign off"),
        *(Binding(key, f"export('{fid}')", label) for fid, key, label in EXPORTS),
        Binding("c", "chat", "chat"),
        Binding("escape", "back", "back", show=False),
    ]

    def view_state(self) -> object:
        run = store.get_run()
        assessment = store.get_assessment()
        return (run.completed, bool(run.stopped), run.report_path, assessment.report_signed_off,
                assessment.report_generation,
                tuple((f.fid, f.status) for f in store.list_findings()))

    def compose_body(self) -> ComposeResult:
        assessment = store.get_assessment()
        ready = store.is_completed()
        yield Static(Text.assemble(("◆ reconix ", theme.CYAN), (
            f"security assessment report · {assessment.label}", theme.DIM)), classes="ai-label")
        if not ready:
            yield Static(Text(self._not_ready(), style=theme.MEDIUM), classes="panel-note")
        elif assessment.run.report_path:
            review = "APPROVED · downloads unlocked" if assessment.report_signed_off else "PENDING · press a to sign off"
            yield Static(Text(f"Report v{assessment.report_generation} · READY · Review {review}",
                              style=theme.MUTED))
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
            for row in key_finding_rows():
                table.add_row(*row)
            yield table
            yield Static("")
            yield Static(Text("Changes since the last assessment", style=f"bold {theme.TEXT}"))
            yield Static(retest_line())
        with Horizontal(classes="actions export-actions"):
            yield Static(Text("Export", style=f"bold {theme.MUTED}"), classes="export-label")
            yield from self._buttons()
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
    def _buttons() -> Iterable[Button]:
        """One chip per format, read like the footer: the key, then what it does."""
        formats = {f.id: f for f in store.list_report_formats()}
        for i, (fid, key, label) in enumerate(EXPORTS):
            enabled = can_export(fid)                        # the same rule as the keys
            name = label if formats[fid].available else f"{label} · not installed"
            text = Text.assemble(
                (key, f"bold {theme.CYAN if enabled else theme.DIM}"), "  ",
                (name, theme.TEXT if enabled else theme.DIM))
            yield Button(text, id=fid, classes="export" + (" -main" if i == 0 else ""),
                         disabled=not enabled)

    # --- actions ----------------------------------------------------------------------------
    def action_sign_off(self) -> None:
        try:
            store.sign_off_report()
        except store.StoreValidationError as error:
            self.notify(str(error), severity="warning", markup=False)
            return
        self.app.refresh_view()

    def action_export(self, fmt: str) -> None:
        self.app.export_report(fmt)

    def action_back(self) -> None:
        self.app.go_prev()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        event.stop()
        self.action_export(event.button.id)
