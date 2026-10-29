"""Frame 06 — Findings list (filterable, sortable, arrow-key selectable; triage)."""

from typing import Optional

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.widgets import DataTable, Static
from textual.widgets.data_table import RowDoesNotExist

from .base import ReconixScreen
from .choice import ChoiceScreen
from .. import store, theme
from ..models import Choice
from ..widgets import SeverityStrip
from ..widgets.findings import reference_text, severity_text, triage_text, validation_text


def _status_label() -> str:
    run = store.get_run()
    if run.completed:
        return "assessment complete"
    if run.stopped:
        return "assessment stopped"
    return "testing in progress" if run.started else "no assessment yet"


class FindingsListScreen(ReconixScreen):
    flow_name = "findings"
    mode_name = "FINDINGS"

    BINDINGS = [
        Binding("enter", "open", "open finding"),
        Binding("f", "filter", "filter"),
        Binding("s", "sort", "sort"),
        Binding("t", "triage", "triage"),
        Binding("c", "chat", "chat"),
        Binding("escape", "back", "back", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._shown = ""     # the ids and statuses last drawn, to redraw only on change

    def compose_body(self) -> ComposeResult:
        yield Static(id="findings-label", classes="ai-label")
        yield SeverityStrip(id="sev-strip")
        yield Static(id="view-line", classes="muted")
        table = DataTable(id="findings-table", cursor_type="row", zebra_stripes=True)
        table.add_columns("ID", "SEVERITY", "TITLE", "PATH / COMPONENT", "TOOL", "CVE / CWE",
                          "VALIDATION", "STATUS")
        yield table
        yield Static(id="findings-empty", classes="panel-note")
        yield Static(Text("↑/↓ select · ↵ open · f filter · s sort · t triage · c chat · "
                          "→ report", style=theme.DIM), classes="muted")

    def on_mount(self) -> None:
        self._fill(keep=self.app.selected_finding)

    def refresh_live(self) -> None:
        if self._signature() != self._shown:
            self._fill()

    @staticmethod
    def _signature() -> str:
        return "|".join(f"{f.fid}:{f.status}:{f.effective_severity}"
                        for f in store.list_findings())

    # --- table ------------------------------------------------------------------------------
    def _fill(self, keep: Optional[str] = None) -> None:
        """Rebuild rows for the current filter and sort, keeping the cursor on `keep`."""
        table = self.query_one("#findings-table", DataTable)
        if keep is None:
            keep = self._cursor_key()
        table.clear()
        findings = store.list_findings()
        rows = store.find_findings(self.app.findings_filter, self.app.findings_sort)
        for f in rows:
            table.add_row(
                Text(f.fid, style=theme.KEY), severity_text(f), Text(f.title),
                Text(f.path, style=theme.MUTED), Text(f.tool, style=theme.TEAL),
                reference_text(f), validation_text(f), triage_text(f), key=f.fid,
            )
        confirmed = sum(1 for f in findings if not f.needs_review)
        self.query_one("#findings-label", Static).update(Text.assemble(
            ("◆ reconix ", theme.CYAN),
            (f"{_status_label()} · {len(findings)} findings · {confirmed} confirmed",
             theme.DIM)))
        self.query_one("#sev-strip", SeverityStrip).show(store.severity_counts())
        self.query_one("#view-line", Static).update(Text.assemble(
            ("filter: ", theme.DIM), (store.filter_label(self.app.findings_filter), theme.TEAL),
            ("  ·  sort: ", theme.DIM), (store.sort_label(self.app.findings_sort), theme.TEAL),
            (f"  ·  showing {len(rows)} of {len(findings)}", theme.DIM)))
        table.display = bool(rows)
        empty = self.query_one("#findings-empty", Static)
        empty.display = not rows
        if not findings:
            empty.update(Text.assemble(
                ("No findings yet — they appear here as testing finds them.", theme.MUTED)))
        else:
            empty.update(Text.assemble(
                ("No findings match this filter — press ", theme.MUTED),
                ("f", f"bold {theme.TEXT}"), (" to change it.", theme.MUTED)))
        self._shown = self._signature()
        if rows:
            self._move_to(keep)
            table.focus()

    def _cursor_key(self) -> Optional[str]:
        table = self.query_one("#findings-table", DataTable)
        if table.row_count == 0:
            return None
        return table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value

    def _move_to(self, key: Optional[str]) -> None:
        table = self.query_one("#findings-table", DataTable)
        for candidate in (key, self.app.selected_finding):
            if not candidate:
                continue
            try:
                table.move_cursor(row=table.get_row_index(candidate))
                return
            except RowDoesNotExist:
                continue
        table.move_cursor(row=0)

    # --- actions ----------------------------------------------------------------------------
    def action_open(self) -> None:
        key = self._cursor_key()
        if key is not None:
            self.app.open_finding(key)

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        if event.row_key.value is not None:
            self.app.open_finding(event.row_key.value)

    def action_filter(self) -> None:
        counts = store.filter_counts()
        ids = [fid for fid, _ in store.FINDING_FILTERS]
        current = self.app.findings_filter
        choices = [
            Choice(fid, f"{label} · {counts[fid]}" + ("  (current)" if fid == current else ""))
            for fid, label in store.FINDING_FILTERS
        ]

        def answer(filter_id: Optional[str]) -> None:
            if filter_id:
                self.app.findings_filter = filter_id
                self._fill()

        self.app.push_screen(ChoiceScreen(
            "Filter findings", "Show which findings?", choices,
            default=ids.index(current), chip="Filter",
        ), answer)

    def action_sort(self) -> None:
        ids = [sid for sid, _ in store.FINDING_SORTS]
        self.app.findings_sort = ids[(ids.index(self.app.findings_sort) + 1) % len(ids)]
        self._fill()

    def action_triage(self) -> None:
        key = self._cursor_key()
        if key is None:
            self.notify("No finding selected.", severity="warning")
            return
        self.app.triage_finding(key)

    def action_back(self) -> None:
        self.app.go_prev()
