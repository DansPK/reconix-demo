"""Shared window chrome: the session bar and the flow progress line."""

from typing import List, Tuple

from rich.text import Text
from textual.widgets import Static

from .. import store, theme
from ..flow import phase_style

PHASE_COLOR = {"cyan": theme.CYAN, "amber": theme.MEDIUM, "green": theme.GREEN,
               "red": theme.CRITICAL, "muted": theme.MUTED}
# The phase's short form, for a narrow bar (the long phase labels; the rest are short already)
PHASE_SHORT = {"scope_pending": "Scope pending", "plan_pending": "Plan ready",
               "waiting_account": "Login needed", "awaiting_approval": "Awaiting you"}


class SessionBar(Static):
    """Top session bar: brand + assessment context + the run's phase and template.

    The right-hand status drops its lower-priority parts on narrow terminals so it
    never overflows. The run's phase and the active model always stay, in their short forms
    when space is tight ("● Scope pending", `llm: <model> ●`); the assessment id stays whole
    and the target gets the rest, cut with "…". Spare width then buys the long forms and the
    optional parts (in-memory, template, policy) by priority.
    "in-memory" is shown (not "backend") because execution is simulated.
    """

    GAP = "   "
    MODEL_WIDTH = 18          # the short form cuts a longer model name with "…"

    def on_mount(self) -> None:
        self.refresh_line()

    def on_resize(self) -> None:
        self.refresh_line()

    def _parts(self) -> List[Tuple[int, bool, List[Text]]]:
        """Right-hand parts in display order: (priority, must show, forms longest first)."""
        parts: List[Tuple[int, bool, List[Text]]] = []
        if store.get_run().started:
            phase = store.display_phase()
            style = phase_style(phase)
            glyph = "◌" if style.busy else "●"
            color = PHASE_COLOR.get(style.tone, theme.MUTED)
            labels = [style.label] + ([PHASE_SHORT[phase]] if phase in PHASE_SHORT else [])
            parts.append((0, True, [Text(f"{glyph} {label}", style=color) for label in labels]))
        parts.append((2, False, [Text.assemble(("◆ ", theme.MEDIUM),
                                               ("in-memory", theme.MUTED))]))
        parts.append((1, True, self._llm_forms()))
        template = store.selected_template()
        if template:
            parts.append((3, False, [Text.assemble(("template: ", theme.DIM),
                                                   (template.name, theme.MUTED))]))
        parts.append((4, False, [Text.assemble(("policy: ", theme.DIM),
                                               ("enforced", theme.CYAN))]))
        return parts

    @staticmethod
    def _llm_part() -> Text:
        """`llm: Reconix · model ●` (dot by reachability) or `llm: off`."""
        return SessionBar._llm_forms()[0]

    @classmethod
    def _llm_forms(cls) -> List[Text]:
        """The model part, longest first: `llm: label · model ●`, then `llm: model ●`."""
        active = store.active_model()
        if active is None:
            return [Text.assemble(("llm: ", theme.DIM), ("off", theme.MUTED))]
        color = {"REACHABLE": theme.GREEN, "UNREACHABLE": theme.CRITICAL}.get(
            store.get_provider(active.provider_id).status, theme.MUTED)
        model = active.model
        if len(model) > cls.MODEL_WIDTH:
            model = model[:cls.MODEL_WIDTH - 1] + "…"
        return [
            Text.assemble(("llm: ", theme.DIM), (f"{active.label} · {active.model} ", theme.MUTED),
                          ("●", color)),
            Text.assemble(("llm: ", theme.DIM), (f"{model} ", theme.MUTED), ("●", color)),
        ]

    def refresh_line(self) -> None:
        width = self.size.width or 120
        assessment = store.get_assessment()
        head = Text.assemble(("◆ ", theme.CYAN), ("reconix", f"bold {theme.CYAN}"),
                             ("  │  ", theme.BORDER))
        parts = self._parts()
        # 1. The parts that must show (phase, model), in their shortest form.
        chosen = {i: forms[-1] for i, (_, required, forms) in enumerate(parts) if required}
        # 2. The id stays whole; the target gets what is left, cut with "…".
        room = width - head.cell_len - 1 - self._status_width(chosen)
        context = self._context_line(assessment.label, assessment.target or "no target yet", room)
        left = Text.assemble(head, (context, theme.MUTED))
        # 3. With room to spare: longer forms and the optional parts, by priority.
        for index in sorted(range(len(parts)), key=lambda i: parts[i][0]):
            for form in parts[index][2]:
                trial = dict(chosen)
                trial[index] = form
                if left.cell_len + 1 + self._status_width(trial) <= width:
                    chosen = trial
                    break
        right = Text(self.GAP).join(chosen[i] for i in sorted(chosen))
        pad = max(1, width - left.cell_len - right.cell_len)
        self.update(Text.assemble(left, Text(" " * pad), right))

    def _status_width(self, chosen: dict) -> int:
        return (sum(form.cell_len for form in chosen.values())
                + len(self.GAP) * max(0, len(chosen) - 1))

    @classmethod
    def _context_line(cls, label: str, target: str, room: int) -> str:
        """`<id> · <target>` in `room` cells: the id whole, the target cut with "…" (or left
        out when not even a few characters of it fit)."""
        full = f"{label} · {target}"
        if len(full) <= room:
            return full
        left_for_target = room - len(label) - 3
        if left_for_target < 4:
            return label
        return f"{label} · {target[:left_for_target - 1]}…"


class FlowProgress(Static):
    """The rule under the session bar, showing where you are in the flow.

        ── ✓ Start ─ ✓ Template ─ ● Plan ─ ○ Approval ─ ○ Execution ─ ○ Findings ─ ○ Report ──

    ✓ settled, ✕ stopped, ! waiting for you, ○ pending; the current step is bold cyan. On
    narrow terminals only the current step keeps its label.
    """

    SUB_STEPS = {"detail": "findings"}    # screens shown under another step
    PASSED_IS_DONE = ("findings",)        # no settling event; done once you move past
    LABELS = {"template": "Target"}       # display label overrides (internal key stays "template")

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
            label = self.LABELS.get(name, name.title())
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
