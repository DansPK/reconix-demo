from __future__ import annotations

from ..models import Target
from ..utils.parsers import parse_gobuster
from .base import BaseScanner

# Standard wordlist shipped on Kali; override via scanner options if needed.
DEFAULT_WORDLIST = "/usr/share/wordlists/dirb/common.txt"


class GobusterScanner(BaseScanner):
    tool_name = "gobuster"
    parser = staticmethod(parse_gobuster)

    def target_value(self, target: Target) -> str:
        return target.value

    def build_args(self, target: Target) -> dict[str, object]:
        args = super().build_args(target)
        props = self.mcp.schema_props(self.tool_name)
        if not props or "wordlist" in props:
            args.setdefault("wordlist", DEFAULT_WORDLIST)
        if not props or "mode" in props:
            args.setdefault("mode", "dir")
        return args
