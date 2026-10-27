"""/add-on: manage the AI's knowledge files (reference documents it may quote).

The command opens a menu (add a file, remove one, remove all) or, with a path, adds that file
directly. Adding reads and redacts the file through `store.knowledge` in a worker thread, for
`/add-on <path>` and the Add form alike, so a long PDF never blocks the UI and a file that
fails to parse never takes the app down: a refusal goes back to the form while it is open,
else to a notification, and so does any unexpected failure. When the index can't be read, the
menu still opens, offering only to remove everything. Nothing here decides a gate or runs
anything — a knowledge file is only ever read, redacted and stored for the model to quote.
"""

from typing import Optional

from .. import store
from ..models import Choice
from ..screens import ChoiceScreen
from ..screens.forms import AddOnForm

_ADD = "add"
_CLEAR = "__clear_all__"
_KEEP = "keep"
_TITLE = "Add-on"
_FAILED = "Couldn't add that file; nothing was saved."


class KnowledgeMixin:
    """Mixed into ReconixApp."""

    # --- /add-on ------------------------------------------------------------------------------
    def add_on_command(self, arg: Optional[str]) -> None:
        path = (arg or "").strip()
        if path:
            self.add_knowledge_file(path)
        else:
            self.open_add_on_menu()

    def open_add_on_menu(self) -> None:
        try:
            sources = store.list_sources()
        except store.StoreValidationError:
            self._open_unreadable_menu()
            return
        choices = [Choice(_ADD, "Add a file…", "A document the AI can quote from (never run)")]
        for i, source in enumerate(sources):
            choices.append(Choice(
                source.id, f"{source.name} · {source.kind} · {source.chunks} passages",
                "Remove this add-on", separated=(i == 0)))
        if sources:
            choices.append(Choice(_CLEAR, "Remove all", "Delete every knowledge file",
                                  tone="danger", separated=True))
            question = "Files the AI may use as reference (redacted, read-only):"
        else:
            question = ("No knowledge files yet. Add one and the AI quotes the relevant passages "
                        "as reference — kept on this computer, redacted, never run.")
        self.open_dialog(
            ChoiceScreen("◆ KNOWLEDGE ADD-ONS", question, choices, chip=_TITLE),
            self._add_on_picked)

    def _open_unreadable_menu(self) -> None:
        """The index can't be read: the only way on is to remove everything (default: No)."""
        self.open_dialog(
            ChoiceScreen("◆ KNOWLEDGE ADD-ONS",
                         "The knowledge index is unreadable, so the files can't be listed or "
                         "used. Remove all knowledge files and start again?",
                         [Choice(_KEEP, "No, leave them"),
                          Choice(_CLEAR, "Remove all", "Delete every knowledge file and the index",
                                 tone="danger")],
                         chip=_TITLE, danger=True, default=0),
            lambda choice: self._do_clear_knowledge() if choice == _CLEAR else None)

    def _add_on_picked(self, choice: Optional[str]) -> None:
        if not choice:
            return
        if choice == _ADD:
            self.open_dialog(AddOnForm(), lambda result: self.refresh_view())
        elif choice == _CLEAR:
            self._confirm_clear_knowledge()
        else:
            self._confirm_remove_knowledge(choice)

    # --- add (worker: a long PDF must not block the UI) ---------------------------------------
    def add_knowledge_file(self, path: str, form: Optional[AddOnForm] = None) -> None:
        """Add `path` in a worker; `form` (the Add form, busy meanwhile) hears the outcome."""
        self.run_worker(lambda: self._add_knowledge(path, form), thread=True, group="knowledge",
                        exit_on_error=False)

    def _add_knowledge(self, path: str, form: Optional[AddOnForm]) -> None:
        """Worker thread: every outcome is reported on the UI thread, never dropped."""
        try:
            source = store.add_source(path)
        except store.StoreValidationError as exc:
            self.call_from_thread(self._add_failed, str(exc), form)
            return
        except Exception:  # noqa: BLE001 - a parser bug must neither crash the app nor vanish
            self.call_from_thread(self._add_failed, _FAILED, form)
            return
        try:
            remote = store.active_remote_label()
        except Exception:  # noqa: BLE001 - the notice is best-effort; the file is saved
            remote = None
        self.call_from_thread(self._added_knowledge, source, remote, form)

    def _form_open(self, form: Optional[AddOnForm]) -> bool:
        return form is not None and form in self.screen_stack

    def _added_knowledge(self, source, remote: Optional[str],
                         form: Optional[AddOnForm]) -> None:
        """The file is saved: close the form, then say what was kept and where it may go."""
        if self._form_open(form):
            form.finish("added")
        self.refresh_view()
        cut = f", {source.cut}" if source.cut else ""
        message = f"Added {source.name} — {source.chunks:,} passage(s){cut}."
        if remote:
            message += f" Passages from it may be sent to {remote} with your questions."
        self.notify(message, title=_TITLE, markup=False)

    def _add_failed(self, message: str, form: Optional[AddOnForm]) -> None:
        if self._form_open(form):
            form.fail(message)
            return
        self.notify(message, title=_TITLE, severity="warning", markup=False)

    # --- remove one ---------------------------------------------------------------------------
    def _confirm_remove_knowledge(self, source_id: str) -> None:
        try:
            name = next((s.name for s in store.list_sources() if s.id == source_id), None)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        if name is None:
            return
        self.open_dialog(
            ChoiceScreen("REMOVE ADD-ON?", f"Remove {name}? This deletes its saved passages.",
                         [Choice(_KEEP, "No, keep it"),
                          Choice("remove", "Yes, remove it", tone="danger")],
                         chip=_TITLE, danger=True, default=0),
            lambda choice: self._do_remove_knowledge(source_id) if choice == "remove" else None)

    def _do_remove_knowledge(self, source_id: str) -> None:
        try:
            removed = store.remove_source(source_id)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.refresh_view()
        self.notify(f"Removed {removed.name}.", title=_TITLE, markup=False)

    # --- remove all ---------------------------------------------------------------------------
    def _confirm_clear_knowledge(self) -> None:
        try:
            count = len(store.list_sources())
        except store.StoreValidationError:
            count = 0
        self.open_dialog(
            ChoiceScreen("REMOVE ALL ADD-ONS?",
                         f"This deletes every saved knowledge file ({count}).",
                         [Choice(_KEEP, "No, keep them"),
                          Choice("clear", "Yes, remove all", tone="danger")],
                         chip=_TITLE, danger=True, default=0),
            lambda choice: self._do_clear_knowledge() if choice == "clear" else None)

    def _do_clear_knowledge(self) -> None:
        """Remove every knowledge file; works on an unreadable index too."""
        count = store.clear_knowledge()
        self.refresh_view()
        self.notify(f"Removed all {count} add-on(s).", title=_TITLE, markup=False)
