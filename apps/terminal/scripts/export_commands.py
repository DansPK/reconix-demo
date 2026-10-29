"""Write the docs' command reference from the TUI's slash commands (the single source).

    python scripts/export_commands.py          # → web/src/content/docs/commands.json
    python scripts/export_commands.py --check  # exit 1 and say what is stale; write nothing

The web docs build one page per command from this file, so the reference can never name a
command the TUI doesn't have (or miss one it does): `tests/test_export_commands.py` fails
when the file on disk differs from what `build()` returns, and the web's vitest fails when a
command has no hand-written page or a page names no command.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reconix.commands.builtin import COMMANDS  # noqa: E402

OUT = ROOT / "web" / "src" / "content" / "docs" / "commands.json"

# The reference's areas, in reading order, and the commands each one lists. Every command in
# COMMANDS must appear exactly once; a new command fails `build()` until it is placed here.
GROUPS = (
    ("start", "Start & navigate", ("help", "new", "template")),
    ("flow", "Flow", ("plan", "approval", "status")),
    ("findings", "Findings & reports", ("findings", "finding", "report", "export", "summary")),
    ("data", "Assessments & data", ("assessments", "audit")),
    ("ai", "AI models & knowledge", ("add-on", "provider", "model")),
    ("dashboard", "Dashboard", ("web",)),
    ("session", "Session", ("quit",)),
)


def _entry(command) -> Dict[str, object]:
    return {
        "name": command.name,
        "aliases": list(command.aliases),
        "description": command.description,
        # True when the argument is picked from a list (`choices`); `ask` says whether a
        # missing argument opens that list as a menu (False: the list only suggests).
        "takes_argument": command.takes_argument,
        "ask": bool(command.ask) if command.takes_argument else False,
        "question": command.question,
        "empty": command.empty,
    }


def build() -> Dict[str, object]:
    """The reference as plain data: the areas, each with its commands, in GROUPS order."""
    by_name = {command.name: command for command in COMMANDS}
    placed: List[str] = [name for _, _, names in GROUPS for name in names]
    missing = sorted(set(by_name) - set(placed))
    unknown = sorted(set(placed) - set(by_name))
    duplicates = sorted({name for name in placed if placed.count(name) > 1})
    if missing or unknown or duplicates:
        raise SystemExit(
            f"export_commands: GROUPS must list every command once "
            f"(missing {missing}, unknown {unknown}, duplicated {duplicates})"
        )
    groups = [
        {"id": gid, "title": title, "commands": [_entry(by_name[name]) for name in names]}
        for gid, title, names in GROUPS
    ]
    return {"source": "reconix/commands/builtin.py", "count": len(COMMANDS), "groups": groups}


def render(data: Dict[str, object]) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def _names(data: Dict[str, object]) -> List[str]:
    return [c["name"] for g in data["groups"] for c in g["commands"]]  # type: ignore[index]


def stale(expected: str, on_disk: Optional[str]) -> List[str]:
    """What differs between the file on disk and `expected`: nothing when they are equal.

    Names the missing file, a file that is not the exporter's JSON, the commands added or
    removed, and otherwise the commands whose entry changed (an alias, a description, …).
    """
    if on_disk is None:
        return [f"{OUT.relative_to(ROOT)} is missing"]
    if on_disk == expected:
        return []
    try:
        old = json.loads(on_disk)
        old_entries = {c["name"]: c for g in old["groups"] for c in g["commands"]}
    except (ValueError, KeyError, TypeError):
        return [f"{OUT.relative_to(ROOT)} is not the exporter's JSON"]
    new = json.loads(expected)
    new_entries = {c["name"]: c for g in new["groups"] for c in g["commands"]}
    reasons = [f"added /{n}" for n in _names(new) if n not in old_entries]
    reasons += [f"removed /{n}" for n in old_entries if n not in new_entries]
    reasons += [f"changed /{n}" for n in _names(new)
                if n in old_entries and old_entries[n] != new_entries[n]]
    return reasons or ["the file differs (order, grouping or formatting)"]


def check() -> int:
    """Exit status for `--check`: 0 when the file on disk is current, 1 (and why) when not."""
    on_disk: Optional[str] = None
    if OUT.exists():
        try:
            on_disk = OUT.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            on_disk = ""                       # unreadable: stale, like a file that isn't JSON
    reasons = stale(render(build()), on_disk)
    if not reasons:
        print(f"{OUT.relative_to(ROOT)} is up to date")
        return 0
    print(f"{OUT.relative_to(ROOT)} is stale: " + "; ".join(reasons), file=sys.stderr)
    print("run: python scripts/export_commands.py", file=sys.stderr)
    return 1


def main(argv: Optional[List[str]] = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args == ["--check"]:
        return check()
    if args:
        print("usage: python scripts/export_commands.py [--check]", file=sys.stderr)
        return 2
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(build()), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
