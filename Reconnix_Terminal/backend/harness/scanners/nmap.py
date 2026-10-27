from __future__ import annotations

from urllib.parse import urlparse

from ..models import Target, TargetType
from ..utils.parsers import parse_nmap
from .base import BaseScanner


class NmapScanner(BaseScanner):
    tool_name = "nmap"
    parser = staticmethod(parse_nmap)

    def target_value(self, target: Target) -> str:
        # nmap wants a host/IP, not a URL.
        if target.type in (TargetType.WEB, TargetType.API) and "://" in target.value:
            return urlparse(target.value).hostname or target.value
        return target.value

    def _port(self, target: Target) -> str | None:
        """Explicit port from a web/api URL (e.g. :8081), so nmap scans it
        even when it's outside nmap's default top-1000."""
        if "://" not in target.value:
            return None
        parsed = urlparse(target.value)
        if parsed.port:
            return str(parsed.port)
        if parsed.scheme == "https":
            return "443"
        if parsed.scheme == "http":
            return "80"
        return None

    def build_args(self, target: Target) -> dict[str, object]:
        args = super().build_args(target)
        port = self._port(target)
        props = self.mcp.schema_props(self.tool_name)
        if port and (not props or "ports" in props):
            args["ports"] = port
        return args
