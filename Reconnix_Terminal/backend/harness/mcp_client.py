"""MCP client to DansPK/kali-mcp-server.

The harness is a standalone app, so it embeds its own MCP client rather than
reusing any host's connection. Transport is config-driven because the server is
stdio but runs on a remote Kali VM:

  * stdio  -> launch a command and speak MCP over its stdio. To reach the VM,
             the command is typically ``ssh <host> <remote server command>``.
  * http   -> connect to a Streamable HTTP endpoint (e.g. the VM exposes :8080/mcp).
  * sse    -> connect to a legacy SSE endpoint.

Tool input schemas are discovered at runtime (``list_tools``) so scanner
adapters pass correctly-named arguments instead of hardcoding signatures.
"""

from __future__ import annotations

import shlex
from contextlib import AsyncExitStack
from typing import Any

from .config import KaliMCPSettings


class KaliMCPError(RuntimeError):
    """A tool call failed or the server reported an error."""


class KaliMCP:
    def __init__(self, settings: KaliMCPSettings):
        self._settings = settings
        self._stack = AsyncExitStack()
        self._session: Any = None
        self._tools: dict[str, Any] = {}

    # --- connection --------------------------------------------------------
    async def connect(self) -> None:
        # Imported lazily so the package imports even if `mcp` isn't installed
        # (e.g. running offline parser unit tests).
        from mcp import ClientSession
        from mcp.client.stdio import StdioServerParameters, stdio_client

        transport = self._settings.transport
        if transport == "stdio":
            command, args = self._stdio_command()
            params = StdioServerParameters(command=command, args=args)
            read, write = await self._stack.enter_async_context(stdio_client(params))
        elif transport == "http":
            from mcp.client.streamable_http import streamable_http_client
            from mcp.shared._httpx_utils import create_mcp_http_client

            # headers (auth token) must be supplied via a pre-built http client;
            # we own its lifecycle, so register it for cleanup too.
            http_client = create_mcp_http_client(headers=self._headers())
            await self._stack.enter_async_context(http_client)
            read, write = await self._stack.enter_async_context(
                streamable_http_client(self._settings.url, http_client=http_client)
            )
        elif transport == "sse":
            from mcp.client.sse import sse_client

            read, write = await self._stack.enter_async_context(
                sse_client(self._settings.url, headers=self._headers())
            )
        else:
            raise KaliMCPError(f"Unknown KALI_MCP_TRANSPORT: {transport!r}")

        self._session = await self._stack.enter_async_context(ClientSession(read, write))
        await self._session.initialize()
        await self.discover()

    def _stdio_command(self) -> tuple[str, list[str]]:
        s = self._settings
        if s.ssh_host:
            if not s.remote_cmd:
                raise KaliMCPError("KALI_MCP_REMOTE_CMD is required with KALI_MCP_SSH_HOST")
            # Pass the remote command as one argument; ssh runs it via the remote shell.
            return "ssh", [s.ssh_host, s.remote_cmd]
        if s.remote_cmd:
            # No SSH host: run the server locally (e.g. a Docker invocation).
            parts = shlex.split(s.remote_cmd)
            return parts[0], parts[1:]
        raise KaliMCPError("stdio transport needs KALI_MCP_SSH_HOST or KALI_MCP_REMOTE_CMD")

    def _headers(self) -> dict[str, str] | None:
        if self._settings.auth_token:
            return {"Authorization": f"Bearer {self._settings.auth_token}"}
        return None

    async def aclose(self) -> None:
        await self._stack.aclose()
        self._session = None

    async def __aenter__(self) -> "KaliMCP":
        await self.connect()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    # --- discovery ---------------------------------------------------------
    async def discover(self) -> dict[str, Any]:
        resp = await self._session.list_tools()
        self._tools = {t.name: t for t in resp.tools}
        return self._tools

    @property
    def tools(self) -> dict[str, Any]:
        return self._tools

    def has_tool(self, name: str) -> bool:
        return name in self._tools

    def schema_props(self, name: str) -> dict[str, Any]:
        tool = self._tools.get(name)
        if tool is None:
            return {}
        # mcp SDK exposes the schema as `input_schema` (snake_case) with an
        # `inputSchema` alias on older versions; accept either.
        schema = getattr(tool, "input_schema", None) or getattr(tool, "inputSchema", None) or {}
        return dict(schema.get("properties", {}))

    # --- invocation --------------------------------------------------------
    async def run(self, name: str, arguments: dict[str, Any]) -> str:
        if self._session is None:
            raise KaliMCPError("not connected")
        result = await self._session.call_tool(name, arguments)
        text = _collect_text(result)
        if getattr(result, "isError", False):
            raise KaliMCPError(text or f"tool {name} returned an error")
        return text


def _collect_text(result: Any) -> str:
    parts: list[str] = []
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text is not None:
            parts.append(text)
    return "\n".join(parts)


def adapt_target_args(props: dict[str, Any], target: str, extras: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build a tool-call argument dict from a discovered input schema.

    Maps the target string onto the schema's most likely target-ish property and
    merges any extra options whose keys the schema actually declares. Falls back
    to a generic ``target`` key when the schema is unknown (empty).
    """
    args: dict[str, Any] = {}
    target_keys = ("target", "url", "host", "hosts", "ip", "domain", "address", "targets")
    if props:
        for key in target_keys:
            if key in props:
                args[key] = target
                break
        else:
            # Unknown layout: use the first required string-ish property, if any.
            for key in props:
                args[key] = target
                break
        if extras:
            for key, value in extras.items():
                if key in props:
                    args[key] = value
    else:
        args["target"] = target
        if extras:
            args.update(extras)
    return args
