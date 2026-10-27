"""The docs' command reference (web/src/content/docs/commands.json) is generated from COMMANDS.

The file on disk must equal what the exporter builds now, so a command added, renamed or
re-described in `reconix/commands/builtin.py` without `python scripts/export_commands.py`
fails here instead of leaving the docs stale. `--check` is the same test as a command, for
the shell and CI: exit 1 and the reason, nothing written.
"""

import importlib.util
import json
import sys
from pathlib import Path

from reconix.commands import COMMANDS

ROOT = Path(__file__).resolve().parents[1]


def _exporter():
    spec = importlib.util.spec_from_file_location(
        "export_commands", ROOT / "scripts" / "export_commands.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("export_commands", module)
    spec.loader.exec_module(module)
    return module


def test_commands_json_matches_the_exporter():
    exporter = _exporter()
    on_disk = exporter.OUT.read_text(encoding="utf-8")
    assert on_disk == exporter.render(exporter.build()), (
        "web/src/content/docs/commands.json is stale: run python scripts/export_commands.py")


def test_every_command_is_listed_once_with_its_facts():
    exporter = _exporter()
    data = exporter.build()
    listed = [c["name"] for g in data["groups"] for c in g["commands"]]
    assert sorted(listed) == sorted(c.name for c in COMMANDS)
    assert len(listed) == len(set(listed)) == data["count"] == len(COMMANDS)
    assert all(g["commands"] for g in data["groups"])
    by_name = {c.name: c for c in COMMANDS}
    for group in data["groups"]:
        for entry in group["commands"]:
            command = by_name[entry["name"]]
            assert entry["aliases"] == list(command.aliases)
            assert entry["description"] == command.description
            assert entry["takes_argument"] == command.takes_argument
    # the facts the docs rely on
    flat = {c["name"]: c for g in data["groups"] for c in g["commands"]}
    assert flat["template"]["takes_argument"] and not flat["template"]["ask"]
    assert flat["finding"]["ask"] and flat["finding"]["empty"]
    assert flat["export"]["question"] == "Export the report as…"
    assert flat["new"]["takes_argument"] is False


def test_the_file_is_valid_json_in_group_order():
    exporter = _exporter()
    data = json.loads(exporter.OUT.read_text(encoding="utf-8"))
    assert [g["id"] for g in data["groups"]] == [gid for gid, _, _ in exporter.GROUPS]


# --- --check -------------------------------------------------------------------------------
def _run_check(exporter, monkeypatch, tmp_path, content):
    """Run `--check` against a copy of the file holding `content` (None: no file)."""
    out = tmp_path / "commands.json"
    if content is not None:
        out.write_text(content, encoding="utf-8")
    monkeypatch.setattr(exporter, "OUT", out)
    monkeypatch.setattr(exporter, "ROOT", tmp_path)
    return exporter.main(["--check"]), out


def test_check_passes_on_a_current_file(capsys, monkeypatch, tmp_path):
    exporter = _exporter()
    current = exporter.render(exporter.build())
    status, out = _run_check(exporter, monkeypatch, tmp_path, current)
    assert status == 0
    assert "up to date" in capsys.readouterr().out
    assert out.read_text(encoding="utf-8") == current


def test_check_fails_on_a_stale_file_without_writing(capsys, monkeypatch, tmp_path):
    exporter = _exporter()
    data = exporter.build()
    first = data["groups"][0]["commands"][0]
    first["description"] = "something else"
    stale = exporter.render(data)
    status, out = _run_check(exporter, monkeypatch, tmp_path, stale)
    assert status == 1
    err = capsys.readouterr().err
    assert "stale" in err and f"changed /{first['name']}" in err and "export_commands.py" in err
    assert out.read_text(encoding="utf-8") == stale        # nothing written


def test_check_names_a_missing_or_foreign_file(capsys, monkeypatch, tmp_path):
    exporter = _exporter()
    assert _run_check(exporter, monkeypatch, tmp_path, None)[0] == 1
    assert "missing" in capsys.readouterr().err
    assert _run_check(exporter, monkeypatch, tmp_path, "not json")[0] == 1
    assert "not the exporter's JSON" in capsys.readouterr().err
    (tmp_path / "commands.json").write_bytes(b"\xff\xfe not utf-8")   # undecodable
    assert exporter.main(["--check"]) == 1
    assert "not the exporter's JSON" in capsys.readouterr().err


def test_check_names_added_and_removed_commands():
    exporter = _exporter()
    current = exporter.render(exporter.build())
    data = json.loads(current)
    gone = data["groups"][-1]["commands"].pop()               # the last command left the file
    data["groups"][0]["commands"].append(dict(gone, name="extra"))
    reasons = exporter.stale(current, json.dumps(data))
    assert reasons == [f"added /{gone['name']}", "removed /extra"]
    assert exporter.stale(current, current) == []


def test_main_refuses_other_arguments(capsys):
    exporter = _exporter()
    assert exporter.main(["--write-please"]) == 2
    assert "usage" in capsys.readouterr().err
