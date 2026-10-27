from __future__ import annotations

from ..models import Target
from ..utils.parsers import parse_whatweb
from .base import BaseScanner


class WhatWebScanner(BaseScanner):
    tool_name = "whatweb"
    parser = staticmethod(parse_whatweb)

    def target_value(self, target: Target) -> str:
        return target.value
