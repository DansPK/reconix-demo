from __future__ import annotations

from ..models import Target
from ..utils.parsers import parse_sqlmap
from .base import BaseScanner


class SqlmapScanner(BaseScanner):
    tool_name = "sqlmap"
    parser = staticmethod(parse_sqlmap)

    def target_value(self, target: Target) -> str:
        # sqlmap needs a URL (ideally one with a query parameter to test).
        return target.value
