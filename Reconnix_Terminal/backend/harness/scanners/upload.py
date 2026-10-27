"""Unrestricted file-upload probe.

No MCP tool detects arbitrary file upload, so this scanner actively verifies it:
upload a uniquely-marked file with an arbitrary name, then fetch it back. If the
exact marker returns, the server stored and served an unvalidated upload.

Unlike the other scanners this runs HTTP directly from the harness host (httpx),
so the target must be reachable from here (true for the lab at 192.168.210.1).
`options` may override the endpoints, e.g.:
    "upload=/upload name=name retrieve=/download file=file"
"""

from __future__ import annotations

import secrets
from urllib.parse import urlparse

from ..models import Target
from ..utils.parsers import parse_upload
from .base import BaseScanner


class UploadScanner(BaseScanner):
    tool_name = "upload"  # not an MCP tool; see available()
    parser = staticmethod(parse_upload)

    def available(self) -> bool:
        return True  # host-side HTTP probe, no MCP tool required

    def target_value(self, target: Target) -> str:
        p = urlparse(target.value)
        return f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else target.value

    def _cfg(self) -> dict[str, str]:
        cfg = {"upload": "/upload", "name": "name", "retrieve": "/download", "file": "file"}
        for tok in (self.options or "").split():
            if "=" in tok:
                k, v = tok.split("=", 1)
                if k in cfg:
                    cfg[k] = v
        return cfg

    def build_args(self, target: Target) -> dict[str, object]:
        return {"url": self.target_value(target)}

    async def run_args(self, args: dict[str, object]) -> str:
        import httpx

        base = str(args["url"]).rstrip("/")
        cfg = self._cfg()
        marker = f"harness-upload-{secrets.token_hex(6)}"
        fname = f"{marker}.txt"
        up = f"{base}{cfg['upload']}?{cfg['name']}={fname}"
        get = f"{base}{cfg['retrieve']}?{cfg['file']}={fname}"
        try:
            async with httpx.AsyncClient(timeout=10, verify=False) as c:
                await c.post(up, content=marker.encode())
                r = await c.get(get)
                if marker in r.text:
                    return f"UPLOAD_VULNERABLE {up} -> {get} marker={marker}"
                return f"UPLOAD_SAFE (marker not retrievable at {get})"
        except Exception as exc:  # noqa: BLE001
            return f"UPLOAD_ERROR {exc!r}"
