from __future__ import annotations

from ..models import Target
from ..utils.parsers import parse_nuclei
from .base import BaseScanner


class NucleiScanner(BaseScanner):
    tool_name = "nuclei"
    parser = staticmethod(parse_nuclei)

    def target_value(self, target: Target) -> str:
        # nuclei scans a URL; keep the scheme if present.
        return target.value
