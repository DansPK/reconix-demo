"""Orchestrates a scan profile: runs each tool in order, persists results.

Sequences nmap -> nuclei -> sqlmap (per the configured profile), writing a scan
row and its findings to the DB as each tool completes, and reports progress via
an optional callback so the TUI can stream it.
"""

from __future__ import annotations

from typing import Callable

from ..db import Database
from ..mcp_client import KaliMCP, KaliMCPError
from ..models import ScanResult, Target
from . import SCANNERS

ProgressCb = Callable[[str], None]


class ScanManager:
    def __init__(self, mcp: KaliMCP, db: Database, options: dict[str, str] | None = None):
        self.mcp = mcp
        self.db = db
        self.options = options or {}

    def _scanner(self, tool: str):
        cls = SCANNERS[tool]
        return cls(self.mcp, options=self.options.get(tool, ""))

    async def run_profile(
        self,
        target: Target,
        tools: list[str],
        progress: ProgressCb | None = None,
    ) -> list[ScanResult]:
        if not target.authorized:
            # Hard gate: active scanning an unauthorized target is refused here,
            # independent of any UI check.
            raise PermissionError(
                f"Target {target.name!r} is not marked authorized/in-scope; refusing to scan."
            )

        def emit(msg: str) -> None:
            if progress:
                progress(msg)

        results: list[ScanResult] = []
        total = len(tools)
        for i, tool in enumerate(tools, 1):
            step = f"[{i}/{total}]"
            if tool not in SCANNERS:
                emit(f"{step} skip: unknown tool {tool!r}")
                continue
            scanner = self._scanner(tool)
            if not scanner.available():
                emit(f"{step} skip: '{tool}' is not offered by the MCP server")
                results.append(ScanResult(target_id=target.id or 0, scanner=tool, status="skipped"))
                continue

            emit(f"{step} ▶ {tool}: preparing call for {scanner.target_value(target)}")
            args = scanner.build_args(target)
            emit(f"{step}   → sending to MCP server: {tool}({_fmt_args(args)})")
            scan_id = self.db.create_scan(target.id or 0, tool)
            result = ScanResult(id=scan_id, target_id=target.id or 0, scanner=tool, status="running")
            try:
                raw = await scanner.run_args(args)
                emit(f"{step}   ← received {len(raw)} chars / {_line_count(raw)} lines from {tool}")
                preview = _preview(raw)
                if preview:
                    emit(f"{step}   ┆ {preview}")
                emit(f"{step}   parsing output…")
                findings = scanner.parse(raw, scan_id)
                result.raw_output = raw
                result.findings = findings
                result.status = "completed"
                if findings:
                    for f in findings:
                        f.id = self.db.add_finding(f)
                        loc = f" @ {f.location}" if f.location else ""
                        emit(f"{step}   • finding #{f.id} [{f.severity.value}] {f.title}{loc}")
                else:
                    emit(f"{step}   (no findings)")
                self.db.finish_scan(scan_id, "completed", raw_output=raw)
                emit(f"{step} ✓ {tool}: {len(findings)} finding(s) stored")
            except KaliMCPError as exc:
                result.status = "failed"
                result.error = str(exc)
                self.db.finish_scan(scan_id, "failed", error=str(exc))
                emit(f"{step} ✗ {tool} failed: {exc}")
            except Exception as exc:  # noqa: BLE001 - surface anything to the UI
                result.status = "failed"
                result.error = repr(exc)
                self.db.finish_scan(scan_id, "failed", error=repr(exc))
                emit(f"{step} ✗ {tool} error: {exc!r}")
            results.append(result)
        return results


def _fmt_args(args: dict[str, object]) -> str:
    return ", ".join(f"{k}={v!r}" for k, v in args.items())


def _line_count(text: str) -> int:
    return text.count("\n") + 1 if text else 0


def _preview(raw: str, lines: int = 2, width: int = 100) -> str:
    """First couple of non-empty output lines, for a glance at what came back."""
    picked = [ln.strip() for ln in raw.splitlines() if ln.strip()][:lines]
    if not picked:
        return ""
    joined = " ⏎ ".join(picked)
    return joined if len(joined) <= width else joined[: width - 1] + "…"
