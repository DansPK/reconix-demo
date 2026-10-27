"""Step builders shared by the template run generators.

These make `RunStep`s readable. The generic run is assembled in `templates/base.py`
from a per-template `RunProfile`; each template module (`templates/<kind>.py`) fills
that profile. No real scanning happens — the steps are illustrative. Step text may use
`$assessment`, `$target`, `$template`, `$picked`, `$findings`, `$login_need`, `$tools` (the
approved tools) and `$tool` (the step's `tool`, or an approved one); `run._fill` fills them.
"""

from dataclasses import replace
from typing import List, Tuple

from ..models import RunStep


def say(text: str, tone: str = "default", speaker: str = "reconix", pause: float = 0.8) -> RunStep:
    return RunStep("say", speaker=speaker, text=text, tone=tone, pause=pause)


def banner(text: str, tone: str, speaker: str = "policy", pause: float = 0.6) -> RunStep:
    return RunStep("say", speaker=speaker, text=text, tone=tone, entry="banner", pause=pause)


def check(text: str, first: bool = False) -> RunStep:
    return RunStep("say", speaker="reconix" if first else "", text=text, tone="ok",
                   entry="check", pause=0.5)


def card(title: str, *rows: Tuple[str, str], tool: str = "") -> RunStep:
    return RunStep("card", speaker="reconix", text=title, rows=tuple(rows), pause=0.6,
                   tool=tool)


def log(source: str, text: str, tone: str = "default", pause: float = 0.4,
        tool: str = "") -> RunStep:
    return RunStep("log", source=source, text=text, tone=tone, pause=pause, tool=tool)


def gate(name: str) -> RunStep:
    return RunStep("gate", name=name, pause=0.3)


def only(when: str, *steps: RunStep) -> List[RunStep]:
    """`steps`, played only if the run needs them: "login" or "code" (see RunStep.when)."""
    return [replace(step, when=when) for step in steps]
