"""Base screen: window chrome + body + footer, shared by all flow screens."""

from typing import Optional

from rich.text import Text
from textual.app import ComposeResult
from textual.containers import Vertical, VerticalScroll
from textual.screen import Screen
from textual.widgets import Footer, Static

from .. import store, theme
from ..widgets import ChoiceMenu, FlowProgress, Question, SessionBar


class ReconixScreen(Screen):
    """All flow screens inherit this. Subclasses implement `compose_body`.

    Set `flow_name` to the screen's key in the app flow (it drives the progress
    line), `mode_name` for the help title, and `scroll = False` for a fill body.

    The run plays while any screen is shown: after every step the app calls
    `refresh_view()`. A screen whose layout depends on the run returns that state from
    `view_state()`; when it changes the app rebuilds the screen. Small per-step updates
    (a progress bar, a log) go in `refresh_live()`.
    """

    flow_name: str = ""
    mode_name: str = ""
    scroll: bool = True

    def __init__(self) -> None:
        super().__init__()
        self._view_state: object = None
        self._stale = False          # the layout changed while a dialog covered the screen

    def compose(self) -> ComposeResult:
        self._view_state = self.view_state()
        yield SessionBar()
        yield FlowProgress(self.flow_name)
        container = VerticalScroll(id="body") if self.scroll else Vertical(id="body")
        with container:
            yield from self.compose_body()
        yield Footer()

    def compose_body(self) -> ComposeResult:  # pragma: no cover - overridden
        return iter(())

    # --- live updates while the run plays ------------------------------------------------
    def view_state(self) -> object:
        """What this screen's layout depends on; a change rebuilds the screen."""
        return None

    def refresh_view(self) -> None:
        """The run moved (or the store changed): rebuild if the layout changed, else update."""
        if not self.is_mounted:
            return                   # composes from the store when it mounts
        if self.view_state() != self._view_state:
            if self.app.screen is self:
                self.app.reload_screen()
            else:
                self._stale = True   # rebuilt when the dialog on top closes
            return
        self.query_one(SessionBar).refresh_line()
        self.refresh_progress()
        self.refresh_live()

    def refresh_live(self) -> None:
        """Per-step updates of the screen's live parts (override where needed)."""

    def refresh_progress(self) -> None:
        """Redraw the flow progress line after this screen changes a step's state."""
        self.query_one(FlowProgress).refresh_line()

    def on_screen_resume(self) -> None:
        if self._stale:
            self._stale = False
            self.app.reload_screen()
            return
        self.app.flow_screen_resumed()

    # --- navigation helpers (delegate to the app) -----------------------------------------
    def action_next(self) -> None:
        self.app.go_next()

    def action_prev(self) -> None:
        self.app.go_prev()

    def action_choose(self) -> None:
        """Enter fallback when focus is outside the screen's menu: pick its highlight."""
        for menu in self.query(ChoiceMenu):
            if menu.can_focus and menu.display:
                menu.choose_highlighted()
                return

    def focus_menu(self, menu_id: str) -> None:
        menus = self.query(f"#{menu_id}")
        if menus:
            menus.first().focus()

    # --- answers from a Question ("Type something." / "Chat about this") --------------------
    def chat_topic(self) -> str:
        """What \"Chat about this\" is about; screens with a Question override it."""
        return self.mode_name.lower()

    def chat_about(self, draft: Optional[str] = None) -> None:
        """Continue in the chat prompt on Start; `draft` pre-fills it (default: the topic)."""
        store.log_event(f"{self.flow_name}.chat")
        self.app.open_chat(f"About {self.chat_topic()}: " if draft is None else draft)

    def action_chat(self) -> None:
        """`c` on the screens that offer it: chat about this assessment (empty draft)."""
        self.chat_about("")

    def on_choice_menu_typed(self, event: ChoiceMenu.Typed) -> None:
        event.stop()
        try:
            store.add_feedback(self.flow_name, event.text)
        except store.StoreValidationError as exc:
            self.notify(str(exc), severity="warning", markup=False)
            return
        # Echo the feedback on screen (built as Text, so brackets are never markup).
        echo = Static(
            Text.assemble(("\U0001f4ac you  ", f"bold {theme.TEAL}"), (event.text, theme.TEXT)),
            classes="feedback-echo",
        )
        body = self.query_one("#body")
        questions = self.query(Question)
        if questions:
            body.mount(echo, before=questions.first())
        else:
            body.mount(echo)
        self.notify("Feedback noted — the planner isn't connected.",
                    severity="information")

    def notify_error(self, message: str, title: Optional[str] = None) -> None:
        """A store error, shown as plain text (never markup)."""
        self.notify(message, title=title or "", severity="warning", markup=False)
