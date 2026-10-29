"""The scope manifest in plain words (Template screen): what Reconix may and won't do."""

from rich.text import Text
from textual.widgets import Static

from .. import store, theme
from ..models import ScopeManifest


def manifest_text(scope: ScopeManifest) -> Text:
    """The store's plain-language summary. Built as Text, so a typed target is never markup."""
    summary = store.describe_scope(scope)
    text = Text(summary.headline, style=theme.TEXT)
    text.append("\n\nWhat it may do", style=f"bold {theme.TEXT}")
    for item in summary.may_do:
        text.append("\n  ✓ ", style=theme.GREEN)
        text.append(item, style=theme.MUTED)
    if summary.never:
        text.append("\n\nWhat it will never touch", style=f"bold {theme.TEXT}")
        for item in summary.never:
            text.append("\n  ✗ ", style=theme.CRITICAL)
            text.append(item, style=theme.MUTED)
    if summary.tools:
        text.append("\n\nTools it will use: ", style=f"bold {theme.TEXT}")
        text.append(", ".join(summary.tools), style=theme.MUTED)
    spec = store.get_api_spec() if scope.kind == "api" else None
    if spec is not None:
        text.append("\n\nAPI spec  ", style=f"bold {theme.TEXT}")
        text.append(f"{spec.label} · {spec.total} endpoints · {', '.join(spec.methods)}",
                    style=theme.MUTED)
        outside = store.api_spec_methods_outside()
        if outside:
            text.append("\nIn spec, not allowed  ", style=f"bold {theme.TEXT}")
            text.append(", ".join(outside), style=theme.MEDIUM)
        if spec.out_of_scope_servers:
            text.append("\nOut of scope  ", style=f"bold {theme.TEXT}")
            text.append(", ".join(spec.out_of_scope_servers), style=theme.MEDIUM)
    return text


class ScopeManifestView(Static):
    """The manifest body; call `show(scope)` to redraw after an edit."""

    def __init__(self, scope: ScopeManifest, **kwargs) -> None:
        super().__init__(manifest_text(scope), **kwargs)

    def show(self, scope: ScopeManifest) -> None:
        self.update(manifest_text(scope))
