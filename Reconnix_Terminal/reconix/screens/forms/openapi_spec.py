"""API TEMPLATE: BASE URL AND SPEC — the API's base URL and an optional OpenAPI spec."""

from typing import Dict, List, Optional

from rich.text import Text

from ... import store, theme
from .base import PENDING, FormField, FormScreen

BUSY_SPEC = "Reading the spec…"
BUSY_SAVE = "Saving…"


class OpenApiForm(FormScreen):
    """Dismisses with "saved" once the store accepts the form, or None.

    The store does the work (`store.save_api_form`): it validates the base URL like a typed
    target, re-drafts the scope for a new one, and reads the spec (a file, or one download from
    the API's own host). That runs in a worker thread so a big file or a slow host never
    freezes the screen; the form stays open and busy, and a refusal lands back on it.
    """

    TITLE = "⇡ API TEMPLATE: BASE URL AND SPEC"
    CHIP = "Scope"
    SUBMIT = "Save"

    def __init__(self) -> None:
        super().__init__()
        self._reading = False

    def fields(self) -> List[FormField]:
        scope = store.get_scope()
        return [
            FormField("base_url", "API base URL", value=scope.target_url if scope else "",
                      placeholder="https://api.example.com"),
            FormField("spec", "OpenAPI spec (optional)",
                      placeholder="~/specs/openapi.yaml or https://api.example.com/openapi.json"),
        ]

    def note(self) -> Optional[Text]:
        return Text("The spec is only read, never run, and never widens the scope. A spec URL "
                    "must be on the API's own host.", style=theme.MUTED)

    def footer(self) -> str:
        return "Leave the spec empty to skip it · Esc to cancel"

    def busy_note(self) -> str:
        return BUSY_SPEC if self._reading else BUSY_SAVE

    # --- saving in a worker -----------------------------------------------------------------
    def submit(self, values: Dict[str, str]) -> Optional[str]:
        base_url, spec = values.get("base_url", ""), values.get("spec", "")
        self._reading = bool(spec.strip())
        self.run_worker(lambda: self._save(base_url, spec), thread=True, group="openapi",
                        exit_on_error=False)
        return PENDING

    def _save(self, base_url: str, spec: str) -> None:
        try:
            result = store.save_api_form(base_url, spec)
        except store.StoreValidationError as exc:
            self.app.call_from_thread(self.fail, str(exc))
            return
        except Exception:                                    # never crash the app on a spec
            self.app.call_from_thread(self.fail, "Couldn't read that spec.")
            return
        self.app.call_from_thread(self._done, result)

    def _done(self, result) -> None:
        parts = []
        if result.target_changed:
            parts.append(f"The scope now targets {result.target_url}.")
        if result.spec_dropped:
            parts.append(f"The spec {result.spec_dropped} was removed: its servers are on "
                         "another host.")
        spec = result.spec
        if result.spec_attached and spec is not None:
            parts.append(f"Attached {spec.label}: {spec.total} endpoints.")
            scope = store.get_scope()
            if scope is not None and not any(m in spec.methods for m in scope.allowed_methods):
                parts.append("It uses none of the allowed methods; they stay as they were.")
        if parts:
            self.app.notify(" ".join(parts), title="API template", markup=False)
        self.finish("saved")

    # --- no closing while the store reads -----------------------------------------------------
    def action_cancel(self) -> None:
        if not self.is_busy:
            super().action_cancel()
