from __future__ import annotations

from urllib.parse import urlparse

from ..models import Target
from ..utils.parsers import parse_nikto
from .base import BaseScanner


class NiktoScanner(BaseScanner):
    tool_name = "nikto"
    parser = staticmethod(parse_nikto)

    def target_value(self, target: Target) -> str:
        # nikto takes a host, not a URL.
        if "://" in target.value:
            return urlparse(target.value).hostname or target.value
        return target.value

    def build_args(self, target: Target) -> dict[str, object]:
        args = super().build_args(target)
        props = self.mcp.schema_props(self.tool_name)
        if "://" in target.value:
            parsed = urlparse(target.value)
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            if not props or "port" in props:
                args["port"] = str(port)
        return args
