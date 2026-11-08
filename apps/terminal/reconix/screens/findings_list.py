"""Frame 06 — Findings list (filterable, sortable, arrow-key selectable; triage)."""

from typing import List, Optional

from rich.cells import cell_len
from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.events import Resize
from textual.widgets import DataTable, Static
from textual.widgets.data_table import RowDoesNotExist

from .base import ReconixScreen
from .choice import ChoiceScreen
from .. import store, theme
from ..models import Choice
from ..widgets import SeverityStrip
from ..wording import counted
from ..widgets.findings import (
    for_display, reference_text, severity_text, triage_text, validation_text,
)

# Triage (STATUS) and VALIDATION sit right after TITLE so they stay visible without scrolling
# right on a narrow terminal; PATH / TOOL / CVE can scroll off to the right.
_COLUMNS = ("ID", "SEVERITY", "TITLE", "STATUS", "VALIDATION", "PATH / COMPONENT",
            "TOOL", "CVE / CWE")


def _status_label() -> str:
    run = store.get_run()
    if run.completed:
        return "assessment complete"
    if run.stopped:
        return "testing stopped · what it found before the stop"
    return "testing in progress" if run.started else "no assessment yet"


def _empty_note() -> str:
    """Why the list is empty, by where the run is (a stopped run finds nothing more)."""
    run = store.get_run()
    if run.stopped:
        return (f"Testing stopped ({run.stopped}) before anything was found — no findings "
                "were recorded. /new starts another assessment.")
    if run.completed:
        return "The assessment completed with no findings."
    if run.started:
        return "No findings yet — they appear here as testing finds them."
    return "No findings yet — start an assessment and they appear here as testing finds them."


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
        # The focused table would take ←/→ (it scrolls sideways), so the flow keys the hint
        # advertises ("→ report") never reached the app: they win here; Shift+←/→ scroll.
        # → goes to the Report (a finding's detail opens with Enter, not →).
        Binding("right", "report", "report", show=False, priority=True),
        Binding("left", "back", "back", show=False, priority=True),
        Binding("shift+right", "scroll_table(1)", "scroll right", show=False),
        Binding("shift+left", "scroll_table(-1)", "scroll left", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._shown = ""     # the ids and statuses last drawn, to redraw only on change

    def compose_body(self) -> ComposeResult:
        yield Static(id="findings-label", classes="ai-label")
        yield SeverityStrip(id="sev-strip")
        yield Static(id="view-line", classes="muted")
        table = DataTable(id="findings-table", cursor_type="row", zebra_stripes=True)
        table.add_columns(*_COLUMNS)
        yield table
        yield Static(id="findings-empty", classes="panel-note")
        # One line at 80 columns: f / s / t / c are in the footer already
        yield Static(Text("↑/↓ select · ↵ open · ← back · → report · Shift+←/→ more columns",
                          style=theme.DIM), id="findings-hint", classes="muted")

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
        # Re-add the columns each fill so an auto-sized column shrinks back when titles get
        # shorter (DataTable grows a column to its widest cell but never shrinks it on clear).
        table.clear(columns=True)
        findings = store.list_findings()
        rows = store.find_findings(self.app.findings_filter, self.app.findings_sort)
        display = [for_display(f) for f in rows]     # mask every shown field (display only)
        titles = self._title_cells(table, display)   # capped with … only when they wouldn't fit
        for name in _COLUMNS:
            # TITLE takes the width that ends the visible columns exactly at the edge
            width = self._title_width if name == "TITLE" else None
            table.add_column(name, width=width)
        for f, d, title in zip(rows, display, titles):
            table.add_row(
                Text(d.fid, style=theme.KEY), severity_text(d), title,
                triage_text(d), validation_text(d), Text(d.path, style=theme.MUTED),
                Text(d.tool, style=theme.TEAL), reference_text(d), key=f.fid,
            )
        confirmed = sum(1 for f in findings if not f.needs_review)
        self.query_one("#findings-label", Static).update(Text.assemble(
            ("◆ reconix ", theme.CYAN),
            (f"{_status_label()} · {counted(len(findings), 'finding')} · {confirmed} confirmed",
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
            empty.update(Text(_empty_note(), style=theme.MUTED))
        else:
            empty.update(Text.assemble(
                ("No findings match this filter — press ", theme.MUTED),
                ("f", f"bold {theme.TEXT}"), (" to change it.", theme.MUTED)))
        self._shown = self._signature()
        if rows:
            self._move_to(keep)
            table.focus()
            self.call_after_refresh(self._refit)

    def _refit(self) -> None:
        """Fill again when the table's visible width changed after layout (a vertical
        scrollbar that came or went), so the columns still end exactly at the edge."""
        table = self.query_one("#findings-table", DataTable)
        refits = getattr(self, "_refits", 0)
        if table.scrollable_content_region.width != getattr(self, "_fitted_width", 0) \
                and refits < 2:
            self._refits = refits + 1
            self._fill()
        else:
            self._refits = 0

    def on_resize(self, event: Resize) -> None:
        """Re-fit the title column to the new width (it is capped only when it wouldn't fit)."""
        if self.is_mounted:
            self._fill()

    def _title_cells(self, table: DataTable, display: list) -> List[Text]:
        """The TITLE cells, each cut with `…` only when ID+SEVERITY+TITLE+STATUS+VALIDATION
        would overflow the visible width, so triage and validation never scroll off the right.

        The full (already-masked) title is kept wherever it fits (and always on the detail).
        """
        titles = [d.title for d in display]
        cells = [Text(t) for t in titles]            # plain Text: the title is never markup
        visible = table.scrollable_content_region.width
        self._fitted_width = visible                 # checked again once laid out (_refit)
        self._title_width: Optional[int] = None      # auto width unless set below
        if visible <= 0 or not titles:
            return cells                             # not laid out yet: on_resize re-fits
        pad = table.cell_padding * 2

        def column(header: str, values: List[str]) -> int:
            return max([len(header)] + [cell_len(v) for v in values]) + pad

        fixed = (column("ID", [d.fid for d in display])
                 + column("SEVERITY", [severity_text(d).plain for d in display])
                 + column("STATUS", [triage_text(d).plain for d in display])
                 + column("VALIDATION", [validation_text(d).plain for d in display]))
        rest = (column("PATH / COMPONENT", [d.path for d in display])
                + column("TOOL", [d.tool for d in display])
                + column("CVE / CWE", [reference_text(d).plain for d in display]))
        budget = visible - fixed - pad               # characters left for the title content
        widest = max(cell_len(t) for t in titles)
        if widest + pad + fixed + rest <= visible:
            return cells                             # the whole table fits: nothing to do
        budget = max(budget, 1)
        # The TITLE column fills the visible width exactly, so the next column (PATH) starts
        # past the right edge and is never drawn half cut ("P│"); Shift+→ scrolls to it.
        self._title_width = budget
        return [Text(t if cell_len(t) <= budget else t[:budget - 1] + "…") for t in titles]

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

    def action_report(self) -> None:
        self.app.goto("report")

    def action_scroll_table(self, direction: int) -> None:
        table = self.query_one("#findings-table", DataTable)
        if direction > 0:
            table.scroll_right(animate=False)
        else:
            table.scroll_left(animate=False)
