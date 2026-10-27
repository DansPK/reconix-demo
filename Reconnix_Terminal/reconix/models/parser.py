"""What the operator typed, reduced to a target and the template that fits it."""

from dataclasses import dataclass, field
from typing import Tuple


@dataclass(frozen=True)
class ParsedTarget:
    """The result of reading a request line (no LLM; see store/parser.py)."""

    kind: str          # "web_url" | "network" | "api" | "source"
    target: str        # host, CIDR, or repo ref as it will be shown
    target_url: str    # normalized URL or address used by the scope
    target_kind: str   # human label, e.g. "web application"
    template_id: str   # the suggested template id (same values as `kind`)
    confident: bool    # False when the kind was a fallback guess, so the UI can confirm
    # Intent read from the same line ("… scan port 80 with nmap"): prefilled into the
    # draft scope, which the operator still approves. Empty when the line named neither.
    ports: Tuple[int, ...] = field(default_factory=tuple)   # requested ports (network scope)
    tools: Tuple[str, ...] = field(default_factory=tuple)   # requested tools, canonical names
