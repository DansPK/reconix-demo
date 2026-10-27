"""Pop-ups the app opens for commands and screens: assessments, triage, import, exports,
the audit trail and the summary. (/web lives in `web.py`.)"""

from functools import partial
from typing import List, Optional

from rich.console import RenderableType
from rich.text import Text

from .. import browser, store, theme
from ..models import Choice
from ..screens import ChoiceScreen
from ..screens.choice import details_body


class DialogsMixin:
    """Mixed into ReconixApp."""

    # --- assessments ----------------------------------------------------------------------------
    def open_assessments(self) -> None:
        cards = store.list_assessments()
        choices = [Choice(str(c.index), f"{c.label} · {c.target}",
                          f"{c.template} · {c.status} · {c.findings} finding(s)",
                          tag="CURRENT" if c.current else "") for c in cards]
        choices.append(Choice("new", "New assessment", "Start fresh; these stay listed.",
                              separated=True))
        current = next((i for i, c in enumerate(cards) if c.current), 0)
        self.open_dialog(ChoiceScreen("◆ ASSESSMENTS", "Reopen an assessment, or start a new one:",
                                      choices, default=current, chip="Assessments"),
                         self._assessments_closed)

    def _assessments_closed(self, result: Optional[str]) -> None:
        if result == "new":
            self.new_assessment()
        elif result is not None and result.isdigit():
            cards = store.list_assessments()
            if not cards[int(result)].current:
                self.switch_assessment(int(result))

    # --- findings: triage and import --------------------------------------------------------------
    def triage_finding(self, fid: str) -> None:
        try:
            finding = store.get_finding(fid)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        choices = [Choice(key, store.TRIAGE_LABELS[key]) for key in store.TRIAGE_STATUS]
        current = (store.TRIAGE_STATUS.index(finding.status)
                   if finding.status in store.TRIAGE_STATUS else 0)
        self.open_dialog(ChoiceScreen(f"TRIAGE · {fid}", f"Set the status of {fid} · "
                                      f"{finding.title}:", choices, default=current,
                                      chip="Triage"),
                         partial(self._triaged, fid))

    def _triaged(self, fid: str, status: Optional[str]) -> None:
        if not status:
            return
        try:
            store.triage_finding(fid, status=status)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.refresh_view()

    # --- report exports ------------------------------------------------------------------------
    def export_report(self, fmt: Optional[str]) -> None:
        try:
            path = store.generate_report((fmt or "").lower())
        except (store.StoreValidationError, OSError) as exc:
            self._warn(exc)
            return
        self.refresh_view()
        self.open_dialog(ChoiceScreen(
            "✓ REPORT SAVED", f"Saved {path}. Open it now?",
            [Choice("open", "Open it", "In your browser, or the default app for the format."),
             Choice("close", "Close")], chip="Report"),
            lambda choice: self._open_report(path) if choice == "open" else None)

    def _open_report(self, path: str) -> None:
        if browser.open_path(path):
            self.notify(f"Opening {path}…", title="Report", markup=False)
        else:
            self.notify(f"Couldn't open it. The report is saved at {path}.", title="Report",
                        severity="warning", markup=False)

    # --- read-only views --------------------------------------------------------------------------
    def show_audit(self) -> None:
        """The activity log, the audit trail and any feedback typed at questions."""
        activity = [(e.created_at.strftime("%H:%M:%S"), f"[{e.source}] {e.message}",
                     theme.TONE.get(e.tone, theme.MUTED)) for e in store.list_activity()[-40:]]
        events = [(e.created_at.strftime("%H:%M:%S"),
                   f"{e.kind} · {e.detail}" if e.detail else e.kind, theme.MUTED)
                  for e in store.list_events()[-40:]] or [("", "No actions recorded yet.",
                                                          theme.DIM)]
        sections = [("Activity log", activity), ("Audit trail", events)]
        feedback = store.list_feedback()
        if feedback:
            sections.append(("Your feedback", [(f.gate, f.text, theme.MUTED) for f in feedback]))
        self.open_dialog(ChoiceScreen("▤ ACTIVITY & AUDIT TRAIL", "", [Choice("close", "Close")],
                                      body=details_body(sections), chip="Audit"))

    def show_summary(self) -> None:
        summary = store.assessment_summary()
        choices: List[Choice] = []
        if summary.report_path:
            choices.append(Choice("open", "Open the report", summary.report_path))
        choices.append(Choice("close", "Close"))
        self.open_dialog(ChoiceScreen("◆ ASSESSMENT SUMMARY", "", choices,
                                      body=self._summary_body(), chip="Summary"),
                         lambda choice: self._open_report(summary.report_path)
                         if choice == "open" else None)

    @staticmethod
    def _summary_body() -> List[RenderableType]:
        summary = store.assessment_summary()
        color = {"Completed": theme.GREEN, "Stopped": theme.CRITICAL}.get(summary.status,
                                                                          theme.CYAN)
        approvals = (f"{len(summary.approvals)} ({', '.join(summary.approvals)})"
                     if summary.approvals else "none")
        body = details_body([("Assessment", [
            ("id", summary.assessment_id, theme.KEY),
            ("target", summary.target or "—", theme.TEXT),
            ("status", summary.status, color),
            ("findings", f"{summary.confirmed} confirmed · {summary.for_review} for review",
             theme.TEXT),
            ("human approvals", approvals, theme.MUTED),
            ("blocked actions", f"{summary.blocked} (out of scope)", theme.MUTED),
            ("report", summary.report_path or "not exported yet (8 or /export)", theme.MUTED),
        ])])
        body += [Text(""), Text("Plan → Approve scope → Run plan → Test → Validate → Report",
                                style=f"bold {theme.CYAN}")]
        return body
