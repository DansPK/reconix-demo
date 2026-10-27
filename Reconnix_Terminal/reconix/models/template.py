"""Assessment templates: default tools, actions and limits for a kind of target."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Template:
    id: str
    name: str
    description: str
    suggested: bool = False   # the AI's pick for the parsed target
    available: bool = True    # False: shown dimmed "(not in demo)"
    target_hint: str = ""     # what to type for this template, e.g. "the site's URL"
    example: str = ""         # a valid example target (reserved names only)
