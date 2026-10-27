from __future__ import annotations

from urllib.parse import urlparse

from ..models import Target
from ..utils.parsers import parse_zap
from .base import BaseScanner


class ZapScanner(BaseScanner):
    """OWASP ZAP via the Kali MCP server's zap_* tools.

    ZAP needs a multi-step workflow, so this overrides run_args to spider the
    target then pull the alerts (passive scan). Active scanning (intrusive) is
    available on the server as zap_active_scan / zap_scan but is not run by
    default here. `options` may set the spider timeout in seconds.
    """

    tool_name = "zap_alerts"  # presence check anchor
    parser = staticmethod(parse_zap)
    default_spider_timeout = 180

    def available(self) -> bool:
        return self.mcp.has_tool("zap_spider") and self.mcp.has_tool("zap_alerts")

    def target_value(self, target: Target) -> str:
        # ZAP wants a base URL (scheme://host[:port]); drop any path/query.
        p = urlparse(target.value)
        return f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else target.value

    def build_args(self, target: Target) -> dict[str, object]:
        return {"url": self.target_value(target)}

    def _spider_timeout(self) -> int:
        try:
            return int(self.options) if self.options else self.default_spider_timeout
        except ValueError:
            return self.default_spider_timeout

    async def run_args(self, args: dict[str, object]) -> str:
        url = args["url"]
        await self.mcp.run("zap_spider", {"url": url, "timeout": self._spider_timeout()})
        return await self.mcp.run("zap_alerts", {"base_url": url, "limit": 500})
