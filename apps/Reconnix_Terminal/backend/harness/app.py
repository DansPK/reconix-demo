"""CLI entry point: launch the TUI, or run `harness doctor` for connectivity."""

from __future__ import annotations

import argparse
import asyncio
import sys

from .config import Settings, load_settings
from .mcp_client import KaliMCP

REQUIRED_TOOLS = ("nmap", "nuclei", "sqlmap")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="harness", description="Authorized security-testing harness.")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("doctor", help="Check Kali MCP connectivity and LLM config.")
    sub.add_parser("classic", help="Launch the classic tabbed TUI (targets/scan/findings).")
    pp = sub.add_parser("pentest", help="Run the whole pentest workflow against a target in one shot.")
    pp.add_argument("target", help="URL or host to test, e.g. http://192.168.210.1:8080")
    pp.add_argument("--name", help="Target name (default: hostname).")
    pp.add_argument("--yes", action="store_true", help="Confirm you are authorized to test the target.")
    pp.add_argument("--tools", help="Comma-separated tool list (default: the full pipeline).")
    pp.add_argument("--report", help="Report file path (default: pentest-<host>-<ts>.md).")
    pp.add_argument("--no-analyze", action="store_true", help="Skip LLM analysis of findings.")
    args = parser.parse_args(argv)

    settings = load_settings()
    if args.cmd == "doctor":
        return cmd_doctor(settings)
    if args.cmd == "pentest":
        return cmd_pentest(settings, args)
    if args.cmd == "classic":
        from .ui.main import HarnessApp

        HarnessApp(settings).run()
        return 0

    # Default: the natural-language chat agent (Claude Code style).
    from .ui.chat import ChatApp

    ChatApp(settings).run()
    return 0


def cmd_pentest(settings: Settings, args) -> int:
    from .pentest import run_pentest

    if not args.yes:
        print(
            "Refusing to scan without authorization confirmation.\n"
            f"Only run this against targets you own or may test. Re-run:\n"
            f"  harness pentest {args.target} --yes",
            file=sys.stderr,
        )
        return 2
    tools = [t.strip() for t in args.tools.split(",")] if args.tools else None

    async def go() -> int:
        summary = await run_pentest(
            settings, args.target, name=args.name, authorized=True, tools=tools,
            progress=lambda m: print(m, flush=True),
            report_path=args.report, analyze=not args.no_analyze,
        )
        if "error" in summary:
            print(f"\nERROR: {summary['error']}", file=sys.stderr)
            return 1
        print("\n==== SUMMARY ====")
        print(f"target: {summary['target']}")
        print(f"findings: {summary['total_findings']}  by severity: {summary['by_severity']}")
        print("per tool: " + ", ".join(f"{t['tool']}={t['findings']}({t['status']})" for t in summary["tools"]))
        if summary.get("report"):
            print(f"report: {summary['report']}")
        return 0

    return asyncio.run(go())


def cmd_doctor(settings: Settings) -> int:
    print("Harness doctor\n===============")
    _report_llm(settings)
    print(f"\nKali MCP transport : {settings.kali.transport}")
    if settings.kali.transport == "stdio":
        host = settings.kali.ssh_host or "(local)"
        print(f"stdio launch       : {host} :: {settings.kali.remote_cmd}")
    else:
        print(f"endpoint           : {settings.kali.url}")

    return asyncio.run(_check_mcp(settings))


def _report_llm(settings: Settings) -> None:
    llm = settings.llm
    if llm.enabled:
        print(f"LLM                : {llm.model} @ {llm.base_url}")
    else:
        print("LLM                : not configured (set HARNESS_LLM_BASE_URL/MODEL)")


async def _check_mcp(settings: Settings) -> int:
    try:
        async with KaliMCP(settings.kali) as mcp:
            names = sorted(mcp.tools)
            print(f"\nConnected ✓  ({len(names)} tools offered)")
            for tool in REQUIRED_TOOLS:
                mark = "✓" if tool in mcp.tools else "✗ MISSING"
                print(f"  {tool:<10} {mark}")
            missing = [t for t in REQUIRED_TOOLS if t not in mcp.tools]
            if missing:
                print(f"\nWARNING: server does not offer: {', '.join(missing)}")
                return 1
            return 0
    except Exception as exc:  # noqa: BLE001
        print(f"\nConnection FAILED ✗\n  {exc}", file=sys.stderr)
        print(
            "\nHints: confirm DansPK/kali-mcp-server is running on the VM, that "
            "SSH works (stdio) or the URL is reachable (http/sse), and tool names match.",
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
