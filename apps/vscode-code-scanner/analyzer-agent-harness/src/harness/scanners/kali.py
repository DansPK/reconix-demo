"""MCP client for the Kali tool container.

When `KALI_MCP_URL` is set the three scanners delegate their *execution* to the Kali
container over streamable-HTTP: the harness sends the tool name and arguments, the container
runs the binary and returns a JSON envelope, and the harness parses it exactly as it would
local output. The container reads the code through a shared volume (see `remap`), so no files
cross the wire. A failure here surfaces as `KaliError` (a `proc.CommandError`), so the runner's
per-tool error handling treats it like any other scanner failure.
"""

import json
import logging
from contextlib import asynccontextmanager

from harness import proc

log = logging.getLogger(__name__)


class KaliError(proc.CommandError):
    pass


def _mcp_url(cfg):
    url = cfg.kali_mcp_url.rstrip("/")
    return url if url.endswith("/mcp") else url + "/mcp"


@asynccontextmanager
async def _default_connect(cfg, timeout):
    import httpx2
    from mcp import Client
    from mcp.client.streamable_http import streamable_http_client
    headers = {"Authorization": f"Bearer {cfg.kali_mcp_auth_token}"} if cfg.kali_mcp_auth_token else {}
    http = httpx2.AsyncClient(headers=headers, timeout=timeout)
    async with http, Client(streamable_http_client(_mcp_url(cfg), http_client=http)) as client:
        yield client


def _envelope(result):
    """Parse the container's CallToolResult into its envelope dict."""
    data = getattr(result, "structured_content", None)
    if isinstance(data, dict) and set(data) == {"result"}:
        data = data["result"]
    if not isinstance(data, dict):
        text = result.content[0].text if getattr(result, "content", None) else ""
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, TypeError) as e:
            raise KaliError("the Kali MCP container returned a response that could not be read") from e
    if not isinstance(data, dict) or "ok" not in data or "stdout" not in data:
        raise KaliError("the Kali MCP container returned an unexpected response shape")
    return data


async def call_tool(cfg, tool_name, arguments, *, timeout=None, _connect=None):
    """Call a source-scanner tool on the container and return its envelope dict.
    Raises KaliError on an unreachable container, a tool error, or a bad response."""
    import asyncio
    connect = _connect or _default_connect
    timeout = timeout or 600
    try:
        async with connect(cfg, timeout) as client:
            result = await client.call_tool(tool_name, arguments)
    except asyncio.CancelledError:
        raise  # a scan cancel tears down the connection; the remote tool stops at its own timeout
    except KaliError:
        raise
    except Exception as e:  # connection refused, TLS, transport, timeout — all "unreachable"
        raise KaliError(f"the Kali MCP container could not be reached ({_short(e)})") from e
    if getattr(result, "is_error", False):
        text = result.content[0].text if getattr(result, "content", None) else ""
        raise KaliError(f"{tool_name} failed on the Kali container: {text.strip()[:300]}")
    env = _envelope(result)
    if not env.get("ok", False):
        raise KaliError(f"{tool_name} failed on the Kali container (exit {env.get('exit_code')}): "
                        f"{str(env.get('stderr', '')).strip()[-300:]}")
    return env


def _short(e):
    return str(e).replace("\n", " ").strip()[:160] or type(e).__name__
