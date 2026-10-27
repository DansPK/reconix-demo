"""Frame 07 — Finding detail (evidence + analysis, triage, previous / next)."""

from typing import List, Optional, Tuple

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.widgets import Static

from .base import ReconixScreen
from .. import store, theme
from ..models import Finding
from ..widgets.findings import cvss_text, severity_text, triage_text, validation_text


def _heading(text: str, color: str) -> Static:
    return Static(Text(text, style=f"bold {color}"))


def _para(text: str, color: str = theme.MUTED) -> Static:
    return Static(Text(text, style=color))


class FindingDetailScreen(ReconixScreen):
    flow_name = "detail"
    mode_name = "DETAIL"

    BINDINGS = [
        Binding("t", "triage", "triage"),
        Binding("r", "report", "report"),
        Binding("c", "chat", "chat"),
        Binding("left_square_bracket", "step(-1)", "previous finding", show=False),
        Binding("right_square_bracket", "step(1)", "next finding", show=False),
        Binding("left", "to_list", "back to list"),
        Binding("escape", "to_list", "back", show=False),
    ]

    def _finding(self) -> Optional[Finding]:
        try:
            return store.get_finding(self.app.selected_finding)
        except store.StoreValidationError:
            return None

    def view_state(self) -> object:
        f = self._finding()
        return (f.fid, f.status, f.effective_severity, f.triage_note) if f else None

    def compose_body(self) -> ComposeResult:
        f = self._finding()
        if f is None:
            yield Static(Text.assemble(("← findings", theme.CYAN), ("  ·  no finding selected — "
                                                                    "open one from the list",
                                                                    theme.DIM)),
                         id="breadcrumb")
            return
        order, inside = self._order()
        position = order.index(f.fid) + 1
        where = (f"({position} of {len(order)})" if inside
                 else f"(outside filter · {position} of {len(order)})")
        yield Static(Text.assemble(
            ("← findings", theme.CYAN), ("  /  ", theme.BORDER), (f.fid, f"bold {theme.MUTED}"),
            (f"  {where}", theme.DIM), ("  ·  [ prev  ·  ] next", theme.DIM),
        ), id="breadcrumb")
        with Vertical(classes="panel", id="detail-header"):
            yield Static(Text.assemble(severity_text(f), "   ", (f.title, f"bold {theme.TEXT}"),
                                       "      ", validation_text(f), "   ", triage_text(f)))
            refs = " · ".join(f.cve + f.cwe + f.owasp) or "—"
            yield Static(Text.assemble(
                (f"{f.fid} · {f.path} · detected by {f.tool}", theme.MUTED), "    ",
                (f"CVSS {cvss_text(f)} · {refs}", theme.KEY)))
        with Horizontal(id="detail-cols"):
            with Vertical(classes="panel") as evidence:
                evidence.border_title = "▤ EVIDENCE"
                evidence.border_subtitle = Text(f.tool)     # imported text: never markup
                yield _heading("Affected URL", theme.DIM)
                yield _para(f.affected_url, theme.CYAN)
                yield Static("")
                yield _heading("Evidence (masked)", theme.DIM)
                for line in f.evidence:
                    yield _para(line, theme.STRING)
                yield Static("")
                if f.needs_review:
                    note = (f"○ {f.validation.title()} — needs analyst review. Press t to set "
                            "its status.", theme.MEDIUM)
                else:
                    note = ("✓ Confirmed during the run by the limited validation you "
                            "approved.", theme.TEAL)
                yield Static(Text(*note), classes="panel-note")
            with Vertical(classes="panel") as analysis:
                analysis.border_title = "✦ AI ANALYSIS"
                analysis.border_subtitle = "grounded in OWASP · CWE · NVD"
                yield _heading("Description", theme.TEXT)
                yield _para(f.description)
                yield Static("")
                yield _heading("Impact", theme.HIGH)
                yield _para(f.impact)
                yield Static("")
                yield _heading("Remediation", theme.TEAL)
                yield _para(f.remediation)
                yield Static("")
                yield _heading("Classification", theme.LOW)
                yield _para(f"{f.category or '—'} · {f.cvss_vector or 'not scored'}")
                for ref in f.references:
                    yield Static(Text.assemble(("• ", theme.DIM), (ref, theme.KEY)))
                if f.triage_note:
                    yield Static("")
                    yield _heading("Triage note", theme.MEDIUM)
                    yield _para(f.triage_note)

    # --- previous / next in the Findings list order -----------------------------------------
    def _order(self) -> Tuple[List[str], bool]:
        """Finding ids in the list's filter+sort order, and whether this finding is in it."""
        app = self.app
        order = [f.fid for f in store.find_findings(app.findings_filter, app.findings_sort)]
        if app.selected_finding in order:
            return order, True
        # Opened via /finding, or triaged out of the filter: walk everything instead.
        return [f.fid for f in store.find_findings("all", app.findings_sort)], False

    def action_step(self, delta: int) -> None:
        if self._finding() is None:
            return
        order, _ = self._order()
        position = order.index(self.app.selected_finding) + delta
        if not 0 <= position < len(order):
            self.app.bell()          # at an end: no wrap-around
            return
        self.app.open_finding(order[position])

    def action_triage(self) -> None:
        if self._finding() is not None:
            self.app.triage_finding(self.app.selected_finding)

    def action_chat(self) -> None:
        """Chat about the open finding; the draft names it (plain text, never markup)."""
        finding = self._finding()
        self.chat_about(f"About {finding.fid} {finding.title}: " if finding else "")

    def action_report(self) -> None:
        self.app.goto("report")

    def action_to_list(self) -> None:
        self.app.goto("findings")
