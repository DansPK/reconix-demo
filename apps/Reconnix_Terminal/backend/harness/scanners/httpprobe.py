"""Authenticated HTTP probe — confirms access-control flaws (IDOR/BOLA) and
supplies authenticated status+body that signature scanners can't.

Runs HTTP directly from the harness host (httpx), so it does NOT go through the
Kali MCP server — which means it sidesteps that server's whitespace-splitting of
tool options: the auth header is built here, intact (a `Bearer <jwt>` value with
its space survives). The target must therefore be reachable from the harness
host. `options` (space-separated `key=value`; values must be space-free):

    token=<jwt>          -> sends  Authorization: Bearer <jwt>
    cookie=<name=value>  -> sends  Cookie: <name=value>
    header=<Name:Value>  -> sends a raw header verbatim
    path=/rest/basket    -> probe <scheme://host>/rest/basket/<id> for each id (overrides the target path)
    ids=1,2,3,8          -> enumerate these ids; without `path`, substituted into the URL's last numeric segment
"""

from __future__ import annotations

import json
from urllib.parse import urlparse, urlunparse

from ..models import Target
from ..utils.parsers import parse_httpprobe
from .base import BaseScanner


class HttpProbeScanner(BaseScanner):
    tool_name = "httpprobe"  # not an MCP tool; host-side probe (see available())
    parser = staticmethod(parse_httpprobe)

    def available(self) -> bool:
        return True

    def target_value(self, target: Target) -> str:
        return target.value

    def _cfg(self) -> dict[str, str]:
        cfg = {"token": "", "cookie": "", "header": "", "ids": "", "path": ""}
        for tok in (self.options or "").split():
            if "=" in tok:
                k, v = tok.split("=", 1)
                if k in cfg:
                    cfg[k] = v
        return cfg

    def build_args(self, target: Target) -> dict[str, object]:
        return {"url": self.target_value(target)}

    @staticmethod
    def _with_id(url: str, new_id: str) -> str:
        """Replace the URL's last numeric path segment with new_id."""
        p = urlparse(url)
        segs = p.path.split("/")
        idx = next((k for k in range(len(segs) - 1, -1, -1) if segs[k].isdigit()), None)
        if idx is None:
            return url
        segs[idx] = new_id
        return urlunparse(p._replace(path="/".join(segs)))

    async def run_args(self, args: dict[str, object]) -> str:
        import httpx

        url = str(args["url"])
        cfg = self._cfg()
        headers: dict[str, str] = {}
        if cfg["token"]:
            headers["Authorization"] = f"Bearer {cfg['token']}"
        if cfg["cookie"]:
            headers["Cookie"] = cfg["cookie"]
        if cfg["header"] and ":" in cfg["header"]:
            k, v = cfg["header"].split(":", 1)
            headers[k.strip()] = v.strip()

        ids = [i for i in cfg["ids"].split(",") if i]
        if cfg["path"]:
            p = urlparse(url)
            base = urlunparse(p._replace(path="", params="", query="", fragment=""))
            stem = base.rstrip("/") + "/" + cfg["path"].strip("/")
            pairs = [(i, f"{stem}/{i}") for i in ids] if ids else [("-", stem)]
        else:
            pairs = [(i, self._with_id(url, i)) for i in ids] if ids else [("-", url)]

        lines: list[str] = []
        try:
            async with httpx.AsyncClient(timeout=10, verify=False, follow_redirects=False) as c:
                for i, u in pairs:
                    try:
                        r = await c.get(u, headers=headers)
                        lines.append(json.dumps({"id": i, "url": u, "status": r.status_code,
                                                 "len": len(r.text), "body": r.text[:200].replace("\n", " ")}))
                    except Exception as exc:  # noqa: BLE001 - per-request, keep going
                        lines.append(json.dumps({"id": i, "url": u, "status": 0, "error": repr(exc)}))
        except Exception as exc:  # noqa: BLE001
            return json.dumps({"error": repr(exc)})
        return "\n".join(lines)
