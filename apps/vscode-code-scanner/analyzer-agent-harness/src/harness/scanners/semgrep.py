import json
import logging
import os
import re
import shlex
from pathlib import Path

from harness import proc
from harness.scanners.findings import extract_cwe, make_finding

log = logging.getLogger(__name__)

SEVERITY = {"CRITICAL": "critical", "ERROR": "high", "HIGH": "high",
            "WARNING": "medium", "MEDIUM": "medium", "INFO": "low", "LOW": "low"}
MAX_ARGS_CHARS = 100_000
# For rules marked `harness-sql-text`, the matched code itself must look like SQL. Semgrep cannot
# test a template literal's text, so a rule for "string built from variables" would otherwise
# also match every `className={`...${x}`}`.
SQL_TEXT = re.compile(
    r"(?is)\bselect\s+(distinct\s+)?[\w*.,\s\"`()]+?\s+from\s+[\w.\"`\[\]]"   # SELECT cols FROM table
    r"|\binsert\s+into\s+[\w.\"`\[\]]"
    r"|\bupdate\s+[\w.\"`\[\]]+\s+set\s+\w"
    r"|\bdelete\s+from\s+[\w.\"`\[\]]"
    r"|\bwhere\s+[\w.\"`]+\s*(=|<|>|\blike\b|\bin\s*\()")


def _matched_text(code_dir, r, cache):
    path = r["path"]
    if path not in cache:
        try:
            cache[path] = (Path(code_dir) / path).read_bytes()
        except OSError:
            cache[path] = b""
    return cache[path][r["start"].get("offset", 0):r["end"].get("offset", 0)].decode(errors="replace")


def _rule_prefixes(configs, resolve=True):
    """Semgrep prefixes ids of rules from a local file with the file's folder, dotted.
    In remote mode the configs are already container paths (resolve=False): the prefix must be
    computed from the container path semgrep actually ran with, not a harness-local resolution."""
    out = []
    for c in configs:
        p = Path(c)
        if resolve:
            folder = (p if p.is_dir() else p.parent).resolve()
        else:  # container path; a rules file's folder is its parent, a dir config is itself
            folder = p.parent if p.suffix.lower() in (".yml", ".yaml", ".json") else p
        out.append(".".join(folder.parts[1:]) + ".")
    return out


def _container_config(cfg, c):
    """Make a semgrep config usable by the Kali container.

    A path already under the shared volume is remapped to its container path. A registry config
    (e.g. 'p/default') or a path that is not a local file is passed through. A harness-local rules
    file/dir (baked into the harness image, which the Kali container does not have) is copied onto
    the shared volume so the container can read it, then remapped. Without this, the container's
    semgrep is told to use a path that only exists in the harness image and finds nothing."""
    import shutil
    from harness.scanners import remap
    try:
        return remap.to_container(cfg, c)  # already on the shared volume
    except Exception:  # noqa: BLE001 — not a mapped path; keep looking
        pass
    p = Path(c)
    if not p.exists():
        return c  # registry config or something the container resolves itself
    staged = Path(cfg.data_dir) / "scanner-rules" / p.name
    staged.parent.mkdir(parents=True, exist_ok=True)
    if p.is_dir():
        if staged.exists():
            shutil.rmtree(staged)
        shutil.copytree(p, staged)
    elif not staged.exists() or staged.stat().st_mtime < p.stat().st_mtime:
        shutil.copy2(p, staged)
    return remap.to_container(cfg, str(staged))


def _clean_rule_id(check_id, prefixes):
    for pre in prefixes:
        if check_id.startswith(pre):
            return check_id[len(pre):]
    return check_id


def _title(rule_id):
    return rule_id.rsplit(".", 1)[-1].replace("-", " ").replace("_", " ").capitalize()


def _chunks(files):
    batch, size = [], 0
    for f in files:
        if batch and size + len(f) > MAX_ARGS_CHARS:
            yield batch
            batch, size = [], 0
        batch.append(f)
        size += len(f) + 1
    if batch:
        yield batch


SEMGREP_TIMEOUT = 900


async def _scan_local(code_dir, files, configs, procs):
    results, errors = [], []
    env = {**os.environ, "SEMGREP_SEND_METRICS": "off", "SEMGREP_ENABLE_VERSION_CHECK": "0"}
    args = ["semgrep", "scan", "--json", "--metrics=off", "--disable-version-check", "--quiet"]
    for c in configs:
        args += ["--config", c]
    for batch in _chunks(sorted(files)):
        rc, out, err = await proc.run(args + ["--"] + batch, cwd=code_dir, procs=procs, env=env)
        try:
            data = json.loads(out)
        except json.JSONDecodeError:
            raise proc.CommandError(f"semgrep failed (exit {rc}): {err.strip()[-300:]}")
        results += data.get("results", [])
        errors += data.get("errors", [])
    return results, errors


async def _scan_remote(cfg, code_dir, files, configs):
    """Delegate to the Kali container's `semgrep` tool. It takes one positional path and one
    `config`; the remaining explicit file targets and extra `--config`s go in `opts`, so every
    target is an explicit positional (the ignore list stays bypassed), exactly like local mode."""
    from harness.scanners import kali, remap
    extra_configs = " ".join(f"--config {shlex.quote(c)}" for c in configs[1:])
    main_config = configs[0] if configs else "p/default"
    results, errors = [], []
    for batch in _chunks(sorted(files)):
        _, targets = remap.map_targets(cfg, code_dir, batch)
        opts = " ".join(x for x in [extra_configs, *(shlex.quote(t) for t in targets[1:])] if x)
        env = await kali.call_tool(cfg, "semgrep", {
            "path": targets[0], "config": main_config, "opts": opts, "timeout": SEMGREP_TIMEOUT},
            timeout=SEMGREP_TIMEOUT + 60)
        try:
            data = json.loads(env["stdout"] or "{}")
        except json.JSONDecodeError as e:
            raise kali.KaliError("semgrep returned output that could not be read") from e
        results += data.get("results", [])
        errors += data.get("errors", [])
    return results, errors


async def scan(code_dir, files, configs, raw_dir, procs=None, cfg=None):
    """Run Semgrep on the given relative file paths (explicit targets, so Semgrep's
    default ignore list does not hide test folders). Returns findings. With a configured
    Kali container (`cfg.delegate_scanners`) the execution is delegated over MCP."""
    remote = cfg is not None and cfg.delegate_scanners
    if remote:
        configs = [_container_config(cfg, c) for c in configs]
        results, errors = await _scan_remote(cfg, code_dir, files, configs)
    else:
        # Semgrep runs inside code_dir, so local rule paths must be absolute.
        configs = [str(Path(c).resolve()) if Path(c).exists() else c for c in configs]
        results, errors = await _scan_local(code_dir, files, configs, procs)
    Path(raw_dir, "semgrep.json").write_text(json.dumps({"results": results, "errors": errors}))
    if errors:
        log.info("semgrep reported %d non-fatal errors", len(errors))

    prefixes = _rule_prefixes(configs, resolve=not remote)
    findings, seen, texts = [], set(), {}
    for r in results:
        meta = r.get("extra", {}).get("metadata") or {}
        if meta.get("harness-sql-text") and not SQL_TEXT.search(_matched_text(code_dir, r, texts)):
            continue
        # One rule can match nested parts of one expression; keep one finding per rule and line.
        key = (r["check_id"], r["path"], r["start"]["line"])
        if key in seen:
            continue
        seen.add(key)
        extra = r.get("extra", {})
        meta = extra.get("metadata", {}) or {}
        rule_id = _clean_rule_id(r["check_id"], prefixes)
        f = make_finding(
            "semgrep", rule_id, _title(rule_id),
            SEVERITY.get(str(extra.get("severity", "")).upper(), "low"),
            extract_cwe(meta.get("cwe")), r["path"],
            r["start"]["line"], r["end"]["line"], r["start"].get("col"), r["end"].get("col"),
            extra.get("message", ""), code_dir)
        # Secret rules point straight at the value; mark them so snippets get masked.
        f["_secret"] = ".secrets." in f".{rule_id}."
        findings.append(f)
    return findings
