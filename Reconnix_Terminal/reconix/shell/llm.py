"""/provider and /model: configure LLM providers and pick the active model.

Handlers in `commands/builtin.py` call these methods only. Reachability tests and the chat
reply block on the network, so they run in a Textual worker thread (copying `web.py`).
Nothing here decides a gate or changes scope — a model is only ever configured or displayed.
"""

from typing import Optional

from .. import store
from ..models import Choice
from ..screens import ChoiceScreen
from ..screens.forms import ProviderForm

_VERBS = {"set", "update", "test", "unset"}


class LlmMixin:
    """Mixed into ReconixApp."""

    # --- /provider ----------------------------------------------------------------------------
    def provider_command(self, arg: Optional[str]) -> None:
        arg = (arg or "").strip()
        if not arg:
            self.open_provider_menu()
            return
        parts = arg.split(None, 1)
        verb = parts[0].lower()
        rest = parts[1].strip().lower() if len(parts) > 1 else ""
        if verb in _VERBS:
            if not self._known(rest):
                return
            if verb in ("set", "update"):
                self.open_provider_form(rest)
            elif verb == "test":
                self.test_provider_async(rest)
            else:
                self.confirm_unset(rest)
            return
        if self._known(arg.lower()):
            self.open_provider_submenu(arg.lower())

    def _known(self, provider_id: str) -> bool:
        try:
            store.get_provider(provider_id)
            return True
        except store.StoreValidationError as exc:
            self._warn(exc)
            return False

    def open_provider_menu(self) -> None:
        choices = []
        for p in store.list_providers():
            tag = "ACTIVE" if p.active_model else ""
            bits = [p.status.title()]
            if p.configured and p.api_key_hint:
                bits.append(p.api_key_hint)
            if p.models:
                bits.append(", ".join(p.models))
            label = p.label + ("  [configured]" if p.configured else "")
            choices.append(Choice(p.id, label, " · ".join(bits), tag=tag))
        self.open_dialog(
            ChoiceScreen("◆ LLM PROVIDERS", "Pick a provider to set up or manage:",
                         choices, chip="Providers"),
            self._provider_picked)

    def _provider_picked(self, provider_id: Optional[str]) -> None:
        if provider_id:
            self.open_provider_submenu(provider_id)

    def open_provider_submenu(self, provider_id: str) -> None:
        p = store.get_provider(provider_id)
        setup = "Update" if p.configured else "Set up"
        choices = [
            Choice("set", f"{setup} {p.label}", "API key, base URL and model(s)"),
            Choice("test", "Test connection", "Check the key and that the model is reachable",
                   disabled=not p.configured),
            Choice("model", "Use a model", "Make one of its models the active choice",
                   disabled=not (p.reachable and p.models)),
            Choice("unset", "Unset", "Remove this provider", disabled=not p.configured,
                   separated=True),
        ]
        self.open_dialog(
            ChoiceScreen(f"◆ {p.label.upper()}", f"{p.label} · {p.status.title()}",
                         choices, chip="Provider"),
            lambda choice: self._submenu_chosen(provider_id, choice))

    def _submenu_chosen(self, provider_id: str, choice: Optional[str]) -> None:
        if choice == "set":
            self.open_provider_form(provider_id)
        elif choice == "test":
            self.test_provider_async(provider_id)
        elif choice == "model":
            self.open_model_menu(provider_id)
        elif choice == "unset":
            self.confirm_unset(provider_id)

    def open_provider_form(self, provider_id: str) -> None:
        self.open_dialog(ProviderForm(provider_id),
                         lambda result: self._provider_saved(provider_id, result))

    def _provider_saved(self, provider_id: str, result: Optional[str]) -> None:
        self.refresh_view()
        if result != "saved":
            return
        label = store.get_provider(provider_id).label
        self.open_dialog(
            ChoiceScreen("✓ PROVIDER SAVED", f"Saved {label}. Test the connection now?",
                         [Choice("test", "Yes, test it now"), Choice("later", "Not now")],
                         chip="Provider"),
            lambda choice: self.test_provider_async(provider_id) if choice == "test" else None)

    # --- test (worker) ------------------------------------------------------------------------
    def test_provider_async(self, provider_id: str) -> None:
        try:
            view = store.get_provider(provider_id)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        if not view.configured:
            self.notify(f"{view.label} is not configured yet.", severity="warning", markup=False)
            return
        self.notify(f"Testing {view.label}…", markup=False)
        self.run_worker(lambda: self._run_test(provider_id), thread=True, group="llm",
                        exit_on_error=False)

    def _run_test(self, provider_id: str) -> None:
        try:
            view = store.test_provider(provider_id)
        except store.StoreValidationError as exc:
            self.call_from_thread(self._warn, exc)
            return
        self.call_from_thread(self._test_done, view)

    def _test_done(self, view) -> None:
        self.refresh_view()
        self.notify(f"{view.label}: {view.status} — {view.status_detail}",
                    severity="information" if view.reachable else "warning", markup=False)

    # --- unset --------------------------------------------------------------------------------
    def confirm_unset(self, provider_id: str) -> None:
        try:
            view = store.get_provider(provider_id)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        if not view.configured:
            self.notify(f"{view.label} is not configured.", severity="warning", markup=False)
            return
        self.open_dialog(
            ChoiceScreen(f"REMOVE {view.label.upper()}?",
                         f"This deletes {view.label}'s saved key and settings.",
                         [Choice("keep", "No, keep it"),
                          Choice("unset", "Yes, remove it", tone="danger")],
                         chip="Provider", danger=True, default=0),
            lambda choice: self._do_unset(provider_id) if choice == "unset" else None)

    def _do_unset(self, provider_id: str) -> None:
        try:
            label = store.get_provider(provider_id).label
            store.unset_provider(provider_id)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.refresh_view()
        self.notify(f"Removed {label}.", markup=False)

    # --- /model -------------------------------------------------------------------------------
    def model_command(self, arg: Optional[str]) -> None:
        arg = (arg or "").strip()
        if not arg:
            self.open_model_menu()
            return
        self.activate_model(arg)

    def open_model_menu(self, only_provider: Optional[str] = None) -> None:
        choices = []
        for p in store.list_providers():
            if only_provider and p.id != only_provider:
                continue
            if not p.configured or not p.models:
                continue
            for i, model in enumerate(p.models):
                active = p.active_model == model
                hint = "active" if active else (
                    "ready" if p.reachable else "Test the connection first")
                choices.append(Choice(
                    f"{p.id}/{model}", f"{p.label} · {model}", hint,
                    disabled=not p.reachable, separated=(i == 0), tag="ACTIVE" if active else ""))
        if not choices:
            self.notify("No models yet. Use /provider to set one up and test it.",
                        severity="warning", markup=False)
            return
        self.open_dialog(
            ChoiceScreen("◆ CHOOSE A MODEL", "Pick the model the next chat line will use:",
                         choices, chip="Model"),
            self.activate_model)

    def activate_model(self, spec: Optional[str]) -> None:
        if not spec or "/" not in spec:
            if spec:
                self.notify("Use provider/model, e.g. openai/gpt-4o-mini.",
                            severity="warning", markup=False)
            return
        provider_id, model = spec.split("/", 1)
        try:
            active = store.activate(provider_id.strip(), model.strip())
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        from ..store import agent_run
        agent_run.switch_model()        # repoint a live agent, keeping its history
        self.refresh_view()
        self.notify(f"Active model: {active.label} · {active.model}", markup=False)
