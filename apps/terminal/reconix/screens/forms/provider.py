"""PROVIDER — add or update one LLM provider (API key, base URL, model(s)).

Which fields appear depends on the provider: Reconix only takes an API key (its base URL
and model come from .env, shown read-only); frontier providers take a comma-separated list
of models; the rest take exactly one. A blank API key on update keeps the saved key. The
key field is masked and cleared on close, like the target-login form.
"""

from typing import Dict, List, Optional

from rich.text import Text

from ... import store, theme
from .base import FormField, FormScreen


class ProviderForm(FormScreen):
    """Dismisses with "saved" once the store accepts the provider, or None."""

    CHIP = "LLM provider"
    SUBMIT = "Save provider"

    def __init__(self, provider_id: str) -> None:
        super().__init__()
        self._view = store.get_provider(provider_id)
        self._id = provider_id
        self.TITLE = f"{self._view.label} — {'update' if self._view.configured else 'set up'}"

    def fields(self) -> List[FormField]:
        view = self._view
        fields: List[FormField] = []
        if view.shows_key_field:
            label = "API key" + ("" if view.needs_key else "  (optional)")
            hint = f"leave blank to keep {view.api_key_hint}" if view.api_key_hint else "sk-…"
            fields.append(FormField("api_key", label, placeholder=hint,
                                    secret=True, max_length=4096))
        if view.shows_base_field:
            fields.append(FormField("base_url", "Base URL", value=view.base_url,
                                     placeholder="https://host/v1", max_length=2048))
        if view.shows_models_field:
            label = "Models (comma separated)" if view.multi_model else "Model"
            fields.append(FormField("models", label, value=", ".join(view.models),
                                     placeholder="gpt-4o-mini, gpt-4o", max_length=1024))
        return fields

    def note(self) -> Optional[Text]:
        if self._view.base_mode == "readonly":        # Reconix: base + model from .env
            model = self._view.models[0] if self._view.models else "(from .env)"
            return Text.assemble(
                ("Base URL and model come from .env (read-only):\n", theme.MUTED),
                (f"  {self._view.base_url}\n  {model}", theme.DIM),
            )
        if self._view.kind == "frontier":             # cloud: just the key, models are known
            return Text.assemble(
                ("Just the API key — this provider's models are built in:\n", theme.MUTED),
                (f"  {', '.join(self._view.models)}", theme.DIM),
            )
        return None

    def submit(self, values: Dict[str, str]) -> Optional[str]:
        models = None
        if "models" in values:
            models = [m.strip() for m in values["models"].split(",") if m.strip()]
        store.set_provider(
            self._id,
            api_key=values.get("api_key") or None,
            base_url=values.get("base_url"),
            models=models,
        )
        return "saved"

    def _clear(self) -> None:
        for widget in self._inputs():
            if isinstance(getattr(widget, "id", None), str) and widget.id == "api_key":
                widget.value = ""

    def on_close(self) -> None:
        self._clear()
