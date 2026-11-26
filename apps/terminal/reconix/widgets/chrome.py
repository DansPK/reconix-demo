"""Shared window chrome: the session bar and the flow progress line."""

from typing import List, Tuple

from rich.text import Text
from textual.widgets import Static

from .. import store, theme
from ..flow import phase_style
from . import motion

PHASE_COLOR = {"cyan": theme.CYAN, "amber": theme.MEDIUM, "green": theme.GREEN,
               "red": theme.CRITICAL, "muted": theme.MUTED}
# The phase's short form, for a narrow bar (the long phase labels; the rest are short already)
PHASE_SHORT = {"scope_pending": "Scope pending", "plan_pending": "Plan ready",
               "waiting_account": "Login needed", "awaiting_approval": "Awaiting you"}


class SessionBar(Static):
    """Top session bar: brand + assessment context, then the run's phase and the services.

    The right-hand status drops its lower-priority parts on narrow terminals so it
    never overflows. The run's phase and the active model always stay, in their short forms
    when space is tight ("● Scope pending", `● <model>`); the assessment id stays whole
    and the target gets the rest, cut with "…". Spare width then buys the long forms and the
    optional parts (the Core API and Kali statuses) by priority. Every status is a coloured
    dot followed by what it is about, so the right side reads as one row of lights. The
    service statuses are the store's scripted state (`store/services.py`): nothing is probed.
    """

    GAP = "    "
    DIVIDER = "    │"         # after the run's phase, before the service statuses
    SEP = "  ·  "             # between the assessment id and its target
    MODEL_WIDTH = 18          # the short form cuts a longer model name with "…"
    _moving = False

    def on_mount(self) -> None:
        self._moving = motion.motion_on(self.app)
        self.refresh_line()
        if self._moving:
            self.set_interval(0.3, self._spin)

    def _spin(self) -> None:
        """Turn the busy phase's glyph (redraws only while the phase is busy)."""
        if store.get_run().started and phase_style(store.display_phase()).busy:
            self.refresh_line()

    def on_resize(self) -> None:
        self.refresh_line()

    def _parts(self) -> List[Tuple[int, bool, List[Text]]]:
        """Right-hand parts in display order: (priority, must show, forms longest first)."""
        parts: List[Tuple[int, bool, List[Text]]] = []
        if store.get_run().started:
            phase = store.display_phase()
            style = phase_style(phase)
            glyph = (motion.spin_glyph() if self._moving else "◌") if style.busy else "●"
            color = PHASE_COLOR.get(style.tone, theme.MUTED)
            labels = [style.label] + ([PHASE_SHORT[phase]] if phase in PHASE_SHORT else [])
            parts.append((0, True, [
                Text.assemble((f"{glyph} {label}", color), (self.DIVIDER, theme.BORDER_STR))
                for label in labels]))
        # Every status reads the same way: a coloured dot, then what it is about.
        parts.append((2, False, [self._core_api_form()]))
        parts.append((1, True, self._llm_forms()))
        parts.append((2, False, self._kali_forms()))
        return parts

    @staticmethod
    def _core_api_form() -> Text:
        """`● Core API`, or `● Core API offline`."""
        if store.api_online():
            return Text.assemble(("● ", theme.GREEN), ("Core API", theme.MUTED))
        return Text.assemble(("● ", theme.CRITICAL), ("Core API offline", theme.CRITICAL))

    @staticmethod
    def _llm_part() -> Text:
        """`● Reconix · model` (dot by reachability) or `○ model off`."""
        return SessionBar._llm_forms()[0]

    @classmethod
    def _llm_forms(cls) -> List[Text]:
        """The model part, longest first: `● label · model`, then `● model`."""
        active = store.active_model()
        if active is None:
            return [Text.assemble(("○ ", theme.DIM), ("model off", theme.MUTED))]
        try:
            status = store.get_provider(active.provider_id).status
        except store.StoreValidationError:
            status = ""  # the top bar never breaks the app: unread reachability is muted
        color = {"REACHABLE": theme.GREEN, "UNREACHABLE": theme.CRITICAL}.get(status, theme.MUTED)
        model = active.model
        if len(model) > cls.MODEL_WIDTH:
            model = model[:cls.MODEL_WIDTH - 1] + "…"
        return [
            Text.assemble(("● ", color), (active.label, theme.MUTED), (" · ", theme.DIM),
                          (active.model, theme.TEXT)),
            Text.assemble(("● ", color), (model, theme.TEXT)),
        ]

    @staticmethod
    def _kali_forms() -> List[Text]:
        """The Kali part, longest first: `● Kali · <host>`, then `● Kali` (dot by status)."""
        color = {"REACHABLE": theme.GREEN, "UNREACHABLE": theme.CRITICAL}.get(
            store.kali_status(), theme.MUTED)
        return [
            Text.assemble(("● ", color), ("Kali", theme.MUTED), (" · ", theme.DIM),
                          (store.kali_host(), theme.DIM)),
            Text.assemble(("● ", color), ("Kali", theme.MUTED)),
        ]

    def refresh_line(self) -> None:
        width = self.size.width or 120
        assessment = store.get_assessment()
        head = Text.assemble(("◆ ", theme.CYAN), ("reconix", f"bold {theme.CYAN}"), ("    ", ""))
        parts = self._parts()
        # 1. The parts that must show (phase, model), in their shortest form.
        chosen = {i: forms[-1] for i, (_, required, forms) in enumerate(parts) if required}
        # 2. The id stays whole; the target gets what is left, cut with "…".
        room = width - head.cell_len - len(self.GAP) - self._status_width(chosen)
        context = self._context_line(assessment.label, assessment.target or "no target yet", room)
        label = assessment.label
        left = Text.assemble(head, (label, f"bold {theme.TEXT}"),
                             (context[len(label):], theme.MUTED))
        # 3. With room to spare: longer forms and the optional parts, by priority.
        for index in sorted(range(len(parts)), key=lambda i: parts[i][0]):
            for form in parts[index][2]:
                trial = dict(chosen)
                trial[index] = form
                if left.cell_len + len(self.GAP) + self._status_width(trial) <= width:
                    chosen = trial
                    break
        right = Text(self.GAP).join(chosen[i] for i in sorted(chosen))
        pad = max(len(self.GAP), width - left.cell_len - right.cell_len)
        self.update(Text.assemble(left, Text(" " * pad), right))

    def _status_width(self, chosen: dict) -> int:
        return (sum(form.cell_len for form in chosen.values())
                + len(self.GAP) * max(0, len(chosen) - 1))

    @classmethod
    def _context_line(cls, label: str, target: str, room: int) -> str:
        """`<id>  ·  <target>` in `room` cells: the id whole, the target cut with "…" (or left
        out when not even a few characters of it fit)."""
        full = f"{label}{cls.SEP}{target}"
        if len(full) <= room:
            return full
        left_for_target = room - len(label) - len(cls.SEP)
        if left_for_target < 4:
            return label
        return f"{label}{cls.SEP}{target[:left_for_target - 1]}…"


class FlowProgress(Static):
    """The line under the session bar, showing where you are in the flow.

        ✓ Start  ›  ✓ Template  ›  ● Plan  ›  ○ Approval  ›  ○ Execution  ›  ○ Findings  ›  …

    ✓ settled, ✕ stopped, ! waiting for you, ○ pending; the current step is bold cyan. On
    narrow terminals only the current step keeps its label. A step is ✓ only when the store
    says it is done (`store.step_states`), never because you moved past it.
    """

    SUB_STEPS = {"detail": "findings"}    # screens shown under another step
    SEPARATOR = "   ›   "

    def __init__(self, flow_name: str) -> None:
        super().__init__()
        self._current = self.SUB_STEPS.get(flow_name, flow_name)
        self._moving = False

    def on_mount(self) -> None:
        self._moving = motion.motion_on(self.app)
        self.refresh_line()
        if self._moving:
            self.set_interval(0.1, self.refresh_line)   # the "you are here" dot breathes

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
        if state == "done":
            return "✓", theme.GREEN
        if index == current:
            return "●", motion.pulse_color() if self._moving else theme.CYAN
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
                full.append(self.SEPARATOR, style=theme.DIM)
                compact.append("  ", style=theme.BORDER)
            full.append(f"{glyph} ", style=color)
            full.append(label, style=label_style)
            compact.append(glyph, style=color)
            if i == current:
                compact.append(f" {label}", style=label_style)
        line = full if full.cell_len <= width else compact
        line.truncate(width)
        line.no_wrap = True
        return line
