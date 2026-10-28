"""Shared window chrome: the session bar and the flow progress line."""

from typing import List, Tuple

from rich.text import Text
from textual.widgets import Static

from .. import store, theme
from ..flow import phase_style

PHASE_COLOR = {"cyan": theme.CYAN, "amber": theme.MEDIUM, "green": theme.GREEN,
               "red": theme.CRITICAL, "muted": theme.MUTED}


class SessionBar(Static):
    """Top session bar: brand + assessment context + the run's phase and template.

    The right-hand status drops its lower-priority parts on narrow terminals so it
    never overflows. "demo data" is shown (not "backend") because execution is simulated.
    """

    GAP = "   "

    def on_mount(self) -> None:
        self.refresh_line()

    def on_resize(self) -> None:
        self.refresh_line()

    def _parts(self) -> List[Text]:
        """Right-hand parts, most important first."""
        parts: List[Text] = []
        if store.get_run().started:
            style = phase_style(store.display_phase())
            glyph = "◌" if style.busy else "●"
            parts.append(Text(f"{glyph} {style.label}",
                              style=PHASE_COLOR.get(style.tone, theme.MUTED)))
        parts.append(Text.assemble(("◆ ", theme.MEDIUM), ("demo data", theme.MUTED)))
        template = store.selected_template()
        if template:
            parts.append(Text.assemble(("template: ", theme.DIM), (template.name, theme.MUTED)))
        parts.append(Text.assemble(("policy: ", theme.DIM), ("enforced", theme.CYAN)))
        return parts

    def refresh_line(self) -> None:
        width = self.size.width or 120
        assessment = store.get_assessment()
        left = Text.assemble(
            ("◆ ", theme.CYAN), ("reconix", f"bold {theme.CYAN}"), ("  │  ", theme.BORDER),
            (f"{assessment.label} · {assessment.target or 'no target yet'}", theme.MUTED),
        )
        gap = Text(self.GAP)
        right = Text()
        for piece in self._parts():
            extra = (gap.cell_len if right.cell_len else 0) + piece.cell_len
            if left.cell_len + 2 + right.cell_len + extra > width:
                break
            right = Text.assemble(right, gap, piece) if right.cell_len else piece
        pad = max(1, width - left.cell_len - right.cell_len)
        self.update(Text.assemble(left, Text(" " * pad), right))


class FlowProgress(Static):
    """The rule under the session bar, showing where you are in the flow.

        ── ✓ Start ─ ✓ Template ─ ● Plan ─ ○ Approval ─ ○ Execution ─ ○ Findings ─ ○ Report ──

    ✓ settled, ✕ stopped, ! waiting for you, ○ pending; the current step is bold cyan. On
    narrow terminals only the current step keeps its label.
    """

    SUB_STEPS = {"detail": "findings"}    # screens shown under another step
    PASSED_IS_DONE = ("findings",)        # no settling event; done once you move past

    def __init__(self, flow_name: str) -> None:
        super().__init__()
        self._current = self.SUB_STEPS.get(flow_name, flow_name)

    def on_mount(self) -> None:
        self.refresh_line()

    def on_resize(self) -> None:
        self.refresh_line()

    def refresh_line(self) -> None:
        self.update(self._render_line(self.size.width or 120))

    def _steps(self) -> List[str]:
        return [name for name in self.app.flow_order() if name not in self.SUB_STEPS]

    def _glyph(self, index: int, name: str, current: int, states: dict) -> Tuple[str, str]:
        state = states.get(name)
        if state == "stopped":
            return "✕", theme.CRITICAL
        if state == "waiting":
            return "!", theme.MEDIUM
        if state == "done" or (name in self.PASSED_IS_DONE and index < current):
            return "✓", theme.GREEN
        if index == current:
            return "●", theme.CYAN
        return "○", theme.DIM

    def _render_line(self, width: int) -> Text:
        steps = self._steps()
        current = steps.index(self._current) if self._current in steps else -1
        states = store.step_states()
        full, compact = Text(), Text()
        for i, name in enumerate(steps):
            glyph, color = self._glyph(i, name, current, states)
            label = name.title()
            if i == current:
                label_style = f"bold {theme.CYAN}"
            elif glyph == "!":
                label_style = theme.MEDIUM
            else:
                label_style = theme.MUTED if glyph in ("✓", "✕") else theme.DIM
            if i:
                full.append(" ─ ", style=theme.BORDER)
                compact.append(" ", style=theme.BORDER)
            full.append(f"{glyph} ", style=color)
            full.append(label, style=label_style)
            compact.append(glyph, style=color)
            if i == current:
                compact.append(f" {label}", style=label_style)
        prefix = Text("── ", style=theme.BORDER)
        body = full if prefix.cell_len + full.cell_len + 2 <= width else compact
        line = Text.assemble(prefix, body, (" ", theme.BORDER))
        line.append("─" * max(0, width - line.cell_len), style=theme.BORDER)
        line.truncate(width)
        line.no_wrap = True
        return line
