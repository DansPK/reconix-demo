import json
import logging
from pathlib import Path

from harness import proc
from harness.scanners.findings import make_finding

log = logging.getLogger(__name__)


GITLEAKS_TIMEOUT = 600


async def scan(code_dir, files, raw_dir, procs=None, cfg=None):
    """Run Gitleaks in directory mode with redaction. Gitleaks takes one folder, so it
    scans the whole folder; results are then limited to `files` (relative paths). With a configured
    Kali container (`cfg.delegate_scanners`) the execution is delegated over MCP."""
    report = Path(raw_dir, "gitleaks.json")
    if cfg is not None and cfg.delegate_scanners:
        raw = await _scan_remote(cfg, code_dir)
    else:
        rc, out, err = await proc.run(
            ["gitleaks", "dir", ".", "--report-format", "json", "--report-path", str(report.resolve()),
             "--redact", "--no-banner", "--exit-code", "0", "--log-level", "error"],
            cwd=code_dir, procs=procs)
        if rc != 0 or not report.exists():
            raise proc.CommandError(f"gitleaks failed (exit {rc})")
        raw = report.read_text() or "[]"
    report.write_text(raw)  # keep the raw artifact either way
    wanted = set(files)
    findings = []
    for r in json.loads(raw):
        path = r["File"].removeprefix("./")
        if path not in wanted:
            continue
        f = make_finding(
            "gitleaks", r["RuleID"], r.get("Description") or r["RuleID"], "high", "CWE-798",
            path, r["StartLine"], r["EndLine"], r.get("StartColumn"), r.get("EndColumn"),
            f"Possible secret found: {r.get('Description') or r['RuleID']}", code_dir)
        f["_secret"] = True
        if f["start_col"]:
            # Gitleaks columns can be one off; widen by one so the whole value is masked.
            f["start_col"] = max(f["start_col"] - 1, 1)
        findings.append(f)
    return findings


async def _scan_remote(cfg, code_dir):
    """Delegate to the Kali container's `gitleaks` tool; returns its redacted JSON report text."""
    from harness.scanners import kali, remap
    container_dir = remap.to_container(cfg, code_dir)
    env = await kali.call_tool(cfg, "gitleaks", {"path": container_dir, "history": False,
                                                 "timeout": GITLEAKS_TIMEOUT}, timeout=GITLEAKS_TIMEOUT + 60)
    return env["stdout"] or "[]"
