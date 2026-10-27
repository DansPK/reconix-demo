"""Slash-command definitions and lookup. No UI imports, so any layer can use it."""

from dataclasses import dataclass
from typing import Any, Callable, List, Optional, Sequence, Tuple

from ..models import Choice

# `app` is the running ReconixApp, typed loosely so this module never imports the UI.
Handler = Callable[[Any, Optional[str]], None]
ChoiceProvider = Callable[[Any], List[Choice]]


@dataclass(frozen=True)
class Command:
    name: str                                  # without the leading "/"
    description: str
    run: Handler                               # run(app, arg)
    choices: Optional[ChoiceProvider] = None   # selectable values for the argument
    aliases: Tuple[str, ...] = ()
    question: str = ""                         # dialog question when choices are shown
    empty: str = ""                            # said when there are no choices yet
    ask: bool = True                           # no argument typed: ask with a menu (False:
                                               #   run without one; choices only suggest)

    @property
    def takes_argument(self) -> bool:
        return self.choices is not None


def parse(text: str) -> Tuple[str, Optional[str]]:
    """'/export pdf' -> ('export', 'pdf'); '/Plan' -> ('plan', None)."""
    body = text.strip()
    if body.startswith("/"):
        body = body[1:]
    name, _, arg = body.partition(" ")
    return name.lower(), (arg.strip() or None)


def find(commands: Sequence[Command], name: str) -> Optional[Command]:
    name = name.lower().lstrip("/")
    for command in commands:
        if name == command.name or name in command.aliases:
            return command
    return None


def match(commands: Sequence[Command], query: str) -> List[Command]:
    """Commands ranked: the exact name or alias first (so Enter on "/finding" runs /finding,
    not /findings), then name starts with `query`, then an alias does, then either contains it.
    """
    query = query.lower().lstrip("/")
    exact: List[Command] = []
    by_name: List[Command] = []
    by_alias: List[Command] = []
    contains: List[Command] = []
    for command in commands:
        if query and (query == command.name or query in command.aliases):
            exact.append(command)
        elif command.name.startswith(query):
            by_name.append(command)
        elif any(alias.startswith(query) for alias in command.aliases):
            by_alias.append(command)
        elif any(query in name for name in (command.name,) + command.aliases):
            contains.append(command)
    return exact + by_name + by_alias + contains
