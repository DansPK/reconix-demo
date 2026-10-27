"""Scanner adapter interface.

Adapters are thin: map a target to the MCP tool's arguments, call the tool, and
hand the raw output to a parser. They never shell out directly — all execution
goes through the Kali MCP server.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Callable

from ..mcp_client import KaliMCP, adapt_target_args
from ..models import Finding, Target

Parser = Callable[[str, int], list[Finding]]


class BaseScanner(ABC):
    #: MCP tool name this adapter drives.
    tool_name: str = ""
    #: Parser applied to the tool's raw output.
    parser: Parser

    def __init__(self, mcp: KaliMCP, options: str = ""):
        self.mcp = mcp
        self.options = options

    def available(self) -> bool:
        return self.mcp.has_tool(self.tool_name)

    @abstractmethod
    def target_value(self, target: Target) -> str:
        """The string this tool should scan (URL, host, etc.)."""

    def extra_args(self) -> dict[str, object]:
        """Option-style args offered to the tool if its schema accepts them."""
        extras: dict[str, object] = {}
        if self.options:
            # Offer the options under several common key names; adapt_target_args
            # keeps only the ones the discovered schema actually declares.
            # `opts` is what DansPK/kali-mcp-server uses.
            for key in ("opts", "options", "args", "arguments", "flags", "extra_args"):
                extras.setdefault(key, self.options)
        return extras

    def build_args(self, target: Target) -> dict[str, object]:
        props = self.mcp.schema_props(self.tool_name)
        return adapt_target_args(props, self.target_value(target), self.extra_args())

    async def run_args(self, args: dict[str, object]) -> str:
        """Send the call to the MCP server and return raw output."""
        return await self.mcp.run(self.tool_name, args)

    def parse(self, raw: str, scan_id: int) -> list[Finding]:
        return type(self).parser(raw, scan_id)

    async def scan(self, target: Target, scan_id: int) -> tuple[str, list[Finding]]:
        args = self.build_args(target)
        raw = await self.run_args(args)
        return raw, self.parse(raw, scan_id)
