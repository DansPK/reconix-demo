"""One selectable option in a menu, dialog, or command choice list."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Choice:
    id: str
    label: str
    hint: str = ""             # description shown under the label (or after it, compact)
    tone: str = "default"      # "default" | "danger"
    recommended: bool = False  # adds " (Recommended)" to the label
    kind: str = "choice"       # "choice" | "input" (the "Type something." row)
    separated: bool = False    # draw a rule above this choice
    disabled: bool = False     # shown dimmed with "(not in demo)"; cannot be picked
    tag: str = ""              # small chip after the label, e.g. "AI SUGGESTED"
