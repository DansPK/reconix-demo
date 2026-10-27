from __future__ import annotations

from ..models import Target
from ..utils.parsers import parse_commix
from .base import BaseScanner


class CommixScanner(BaseScanner):
    tool_name = "commix"
    parser = staticmethod(parse_commix)

    def target_value(self, target: Target) -> str:
        # commix needs a URL with an injectable parameter.
        return target.value
