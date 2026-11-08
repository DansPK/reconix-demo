"""Slash-command definitions and lookup. No UI imports, so any layer can use it."""

import difflib
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
    arg: str = "NONE"                          # the argument: NONE | OPTIONAL | REQUIRED
    arg_name: str = ""                         # how usage names it, e.g. "target"

    @property
    def takes_argument(self) -> bool:
        return self.choices is not None

    @property
    def usage(self) -> str:
        """'/plan', '/new [target]' or '/assess <target>'."""
        if self.arg == "OPTIONAL":
            return f"/{self.name} [{self.arg_name}]"
        if self.arg == "REQUIRED":
            return f"/{self.name} <{self.arg_name}>"
        return f"/{self.name}"


@dataclass(frozen=True)
class CommandCheck:
    """A typed command line: the command and its argument, or why it can't run."""

    command: Optional[Command] = None
    arg: Optional[str] = None
    error: str = ""

    @property
    def ok(self) -> bool:
        return not self.error


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


ALL_COMMANDS_HINT = "Type / to see all commands."


def suggest(commands: Sequence[Command], name: str) -> Optional[Command]:
    """The command whose name or alias is closest to a mistyped `name`, if any is close."""
    names = {alias: command for command in commands
             for alias in (command.name,) + command.aliases}
    close = difflib.get_close_matches(name.lower(), list(names), n=1, cutoff=0.6)
    return names[close[0]] if close else None


def _masked(text: str) -> str:
    """Typed text repeated in an error, masked: it may be a pasted password or token."""
    from ..store.redact import redact  # (imported here: no store import at load)

    return redact(text)


def unknown_message(commands: Sequence[Command], name: str) -> str:
    name = _masked(name)
    shown = name if len(name) <= 30 else name[:29] + "…"
    near = suggest(commands, name)
    did_you_mean = f" Did you mean /{near.name}?" if near else ""
    return f'Unknown command "/{shown}".{did_you_mean} {ALL_COMMANDS_HINT}'


def check_command_line(commands: Sequence[Command], text: str,
                       app: Any = None) -> CommandCheck:
    """Check `/name [arg]` against the registry. With `app`, a choice argument is checked
    against the command's current choices too. Never runs anything.
    """
    name, arg = parse(text)
    if not name:
        return CommandCheck(error=f"Type a command after /, e.g. /help. {ALL_COMMANDS_HINT}")
    command = find(commands, name)
    if command is None:
        return CommandCheck(error=unknown_message(commands, name))
    return CommandCheck(command, arg, _arg_error(command, arg, app))


def _arg_error(command: Command, arg: Optional[str], app: Any) -> str:
    """Why `arg` doesn't fit `command` ("" when it does), ending with the usage line."""
    if arg is None and command.arg == "REQUIRED":
        return f"/{command.name} needs a {command.arg_name}. Usage: {command.usage}"
    if arg is not None and command.arg == "NONE":
        return f"/{command.name} takes no argument. Usage: {command.usage}"
    if arg is not None and command.choices is not None and app is not None:
        ids = [choice.id for choice in command.choices(app)]
        if ids and arg.lower() not in ids:
            masked = _masked(arg)
            shown = masked if len(masked) <= 30 else masked[:29] + "…"
            more = ", …" if len(ids) > 8 else ""
            return (f"\"{shown}\" isn't a {command.arg_name} here. Usage: {command.usage} "
                    f"— one of: {', '.join(ids[:8])}{more}")
    return ""
