"""Reconix TUI — main application.

An interactive, keyboard-first demo of the Reconix security-testing flow, built with
Textual. One screen per step: Start → Template → Plan → Approval → Execution → Findings →
Detail → Report. The assessment run (reconix/store, played by flow.RunController) keeps
going while you move between screens and stops at each gate until you decide. Navigate
with the arrow keys and Enter, type `/` for commands, and press `?` for the keys.

The app's behaviour lives in `reconix/shell/` (navigation, run hosting, actions, dialogs);
this module wires it together.
"""

from typing import Dict, Optional

from textual.app import App
from textual.binding import Binding

from . import store, theme
from .commands import COMMANDS, Command, CommandCheck, check_command_line, parse
from .screens import ChoiceScreen, CommandBarScreen, HelpScreen, StartScreen
from .shell import (
    ActionsMixin, DialogsMixin, KnowledgeMixin, LlmMixin, NavigationMixin,
    RunHostMixin, WebDashboardMixin,
)
from .widgets import ActivityStatus, RunLog


class ReconixApp(NavigationMixin, RunHostMixin, ActionsMixin, DialogsMixin,
                 KnowledgeMixin, LlmMixin, WebDashboardMixin, App):
    """Reconix — AI-Powered Security Testing Assistant (demo)."""

    CSS_PATH = "reconix.tcss"
    TITLE = "reconix"
    ENABLE_COMMAND_PALETTE = False   # Reconix has its own "/" command system

    BINDINGS = [
        Binding("right", "nav_next", "next", show=False),
        Binding("left", "nav_prev", "back", show=False),
        # "/" stays non-priority so a focused Input still receives it as text.
        Binding("slash", "command_bar", "commands", key_display="/"),
        Binding("question_mark", "help", "help", key_display="?"),
        Binding("ctrl+q", "quit", "quit"),
        Binding("ctrl+o", "toggle_activity", "expand steps", show=False),
        # Priority, so Ctrl+C stops a run (it asks first) on every flow screen, also with the
        # Start prompt focused; in a dialog or a field with selected text it is left to them.
        Binding("ctrl+c", "stop_assessment", "stop", show=False, priority=True),
        Binding("ctrl+y", "copy_selection", "copy", show=False),
        # Quick jumps for presenting — hidden to keep the footer clean. On Alt, never on a
        # bare digit: a menu's digits pick a choice, and the same key must not mean "show
        # me screen N" on one screen and "decide this gate" on the next.
        Binding("alt+1", "jump('start')", "start", show=False),
        Binding("alt+2", "jump('template')", "template", show=False),
        Binding("alt+3", "jump('plan')", "plan", show=False),
        Binding("alt+4", "jump('approval')", "approval", show=False),
        Binding("alt+5", "jump('execution')", "execution", show=False),
        Binding("alt+6", "jump('findings')", "findings", show=False),
        Binding("alt+7", "jump('detail')", "detail", show=False),
        Binding("alt+8", "jump('report')", "report", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.selected_finding: str = ""          # finding id shown on the Detail screen
        self.finding_unmasked: bool = False      # Detail screen: raw evidence revealed (demo)
        self.pending_prompt: str = ""            # draft for the Start prompt ("Chat about this")
        self.template_pick: Optional[str] = None  # template chosen with /template <id>
        self.findings_filter: str = "all"        # Findings list view (kept across screens)
        self.findings_sort: str = "severity"
        self.activity_expanded = False           # Ctrl+O: list the steps Reconix finished
        self._init_run_host()
        self._init_web()

    def get_css_variables(self) -> Dict[str, str]:
        # The stylesheet's $variables come from theme.py, the one place colors are defined.
        return {**super().get_css_variables(), **theme.CSS_TOKENS}

    def on_mount(self) -> None:
        self.push_screen(StartScreen())

    def on_unmount(self) -> None:
        # Quitting ends the session: mark the saved copies so the web dashboard shows an
        # unfinished run as interrupted rather than still waiting.
        self.controller.stop()
        self.stop_web_dashboard()
        store.close_session()

    # --- global keys ---------------------------------------------------------------------------
    def action_help(self) -> None:
        if isinstance(self.screen, HelpScreen):
            self.pop_screen()
        else:
            self.push_screen(HelpScreen.for_screen(self.screen))

    def action_copy_selection(self) -> None:
        """Ctrl+Y: copy the selected text (drag to select) to the clipboard. Ctrl+C is Stop,
        so copy is its own key. Paste works in any input."""
        text = self.screen.get_selected_text()
        if text:
            self.copy_to_clipboard(text)
            self.notify(f"Copied {len(text)} characters.", title="Clipboard", timeout=2)
        else:
            self.notify("Select text first (drag with the mouse), then Ctrl+Y.", title="Copy",
                        timeout=3)

    def action_toggle_activity(self) -> None:
        self.activity_expanded = not self.activity_expanded
        for status in self.screen.query(ActivityStatus):
            status.set_expanded(self.activity_expanded)
        for log in self.screen.query(RunLog):          # the live output's thinking blocks
            log.set_expanded(self.activity_expanded)

    def action_command_bar(self) -> None:
        self.open_dialog(CommandBarScreen(), self._on_command_bar)

    def _on_command_bar(self, line: Optional[str]) -> None:
        if line:                     # runs after the bar has closed
            self.run_command_line(line)

    # --- slash commands ------------------------------------------------------------------------
    def check_command(self, text: str) -> CommandCheck:
        """Is `/name [arg]` a command that can run? Runs nothing."""
        return check_command_line(COMMANDS, text, self)

    @staticmethod
    def is_path_line(text: str) -> bool:
        """`/home/me/app` is a local path, not a command (its "name" holds a slash)."""
        return "/" in parse(text)[0]

    def run_command_line(self, text: str) -> bool:
        """Run `/name [arg]`. Returns False (and warns) when the line can't run."""
        if self.is_path_line(text):
            return self.submit_request(text)   # a local path (/home/me/app), not a command
        check = self.check_command(text)
        if not check.ok:
            self.notify(check.error, severity="warning", markup=False)
            return False
        self.run_checked(text, check)
        return True

    def run_checked(self, text: str, check: CommandCheck) -> None:
        """Run a line `check_command` already passed (kept in the history like the bar's)."""
        self._remember(text)
        self.run_command(check.command, check.arg)

    def run_command(self, command: Command, arg: Optional[str] = None) -> None:
        """Run a command; if it needs a choice that wasn't typed, ask with a menu."""
        if command.choices is None or not command.ask:
            command.run(self, arg)
            return
        choices = command.choices(self)
        if arg and arg.lower() in {c.id for c in choices}:
            command.run(self, arg.lower())
            return
        if not choices:
            self.notify(command.empty or "Nothing to choose from yet.", severity="warning")
            return

        def chosen(choice_id: Optional[str]) -> None:
            if choice_id:
                command.run(self, choice_id)

        question = command.question or command.description
        self.open_dialog(
            ChoiceScreen(command.description, question, choices, chip=f"/{command.name}"), chosen,
        )


def main() -> None:
    ReconixApp().run()


if __name__ == "__main__":
    main()
