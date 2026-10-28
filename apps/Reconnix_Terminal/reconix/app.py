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
from .commands import COMMANDS, Command, find, parse
from .screens import ChoiceScreen, CommandBarScreen, HelpScreen, StartScreen
from .shell import (
    ActionsMixin, DialogsMixin, KnowledgeMixin, NavigationMixin,
    RunHostMixin, WebDashboardMixin,
)
from .widgets import ActivityStatus


class ReconixApp(NavigationMixin, RunHostMixin, ActionsMixin, DialogsMixin,
                 KnowledgeMixin, WebDashboardMixin, App):
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
        # Quick jumps for presenting — hidden to keep the footer clean.
        Binding("1", "jump('start')", "start", show=False),
        Binding("2", "jump('template')", "template", show=False),
        Binding("3", "jump('plan')", "plan", show=False),
        Binding("4", "jump('approval')", "approval", show=False),
        Binding("5", "jump('execution')", "execution", show=False),
        Binding("6", "jump('findings')", "findings", show=False),
        Binding("7", "jump('detail')", "detail", show=False),
        Binding("8", "jump('report')", "report", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.selected_finding: str = ""          # finding id shown on the Detail screen
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

    def action_toggle_activity(self) -> None:
        self.activity_expanded = not self.activity_expanded
        for status in self.screen.query(ActivityStatus):
            status.set_expanded(self.activity_expanded)

    def action_command_bar(self) -> None:
        self.open_dialog(CommandBarScreen(), self._on_command_bar)

    def _on_command_bar(self, line: Optional[str]) -> None:
        if line:                     # runs after the bar has closed
            self.run_command_line(line)

    # --- slash commands ------------------------------------------------------------------------
    def run_command_line(self, text: str) -> bool:
        """Run `/name [arg]`. Returns False (and warns) for an unknown command."""
        name, arg = parse(text)
        command = find(COMMANDS, name)
        if command is None and "/" in name:
            return self.submit_request(text)   # a local path (/home/me/app), not a command
        if command is None:
            self.notify(f"Unknown command /{name}. Type / to see the list.",
                        severity="warning", markup=False)
            return False
        self._remember(text)
        self.run_command(command, arg)
        return True

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
