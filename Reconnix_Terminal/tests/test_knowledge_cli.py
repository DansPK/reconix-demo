"""The knowledge CLI (`python -m reconix.knowledge`) and the originals the store keeps.

The CLI runs in a subprocess against a temp knowledge folder and key file; the store tests run
in process (conftest repoints the folder and the key file for every test).
"""

import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path

import pytest

from reconix import store
from reconix.store.knowledge import files, original, paths

from .support import TEST_PASSWORD
from .test_knowledge_store import _make_docx, _pdf_bytes

ROOT = Path(__file__).resolve().parent.parent
SECRET_LINE = f"The admin login uses password={TEST_PASSWORD} on the staging box.\n"


@pytest.fixture
def kenv(tmp_path):
    """The CLI's environment: a temp folder and key file, and the repo on the path."""
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    env["RECONIX_KNOWLEDGE_DIR"] = str(tmp_path / "cli-knowledge")
    env["RECONIX_KNOWLEDGE_KEY_FILE"] = str(tmp_path / "cli-keys" / "knowledge.key")
    return env


def cli(env, *args):
    return subprocess.run([sys.executable, "-m", "reconix.knowledge", *args], env=env,
                          capture_output=True, timeout=120)


def ok(proc):
    assert proc.returncode == 0, proc.stderr
    body = json.loads(proc.stdout)
    assert body["ok"] is True
    return body


def refused(proc, words=""):
    assert proc.returncode == 2, (proc.returncode, proc.stdout, proc.stderr)
    body = json.loads(proc.stdout or proc.stderr)
    assert body["ok"] is False
    assert words in body["error"]
    return body["error"]


def make(tmp_path, name):
    """A fixture file of the type `name` ends with; returns (path, its bytes)."""
    path = tmp_path / name
    if name.endswith(".docx"):
        _make_docx(path, ["Reference paragraph about SQL injection.", SECRET_LINE])
    elif name.endswith(".pdf"):
        path.write_bytes(_pdf_bytes("Reference page about XSS"))
    elif name.endswith(".json"):
        path.write_text(json.dumps({"note": "reference", "secret": SECRET_LINE}))
    elif name.endswith((".yaml", ".yml")):
        path.write_text(f"note: reference\nlogin: {SECRET_LINE!r}\n")
    else:
        path.write_text("# Runbook\n" + SECRET_LINE)
    return path, path.read_bytes()


# --- add / list / original / remove --------------------------------------------------------
@pytest.mark.parametrize("name,kind", [
    ("notes.txt", "txt"), ("notes.md", "md"), ("data.json", "json"), ("conf.yaml", "yaml"),
    ("conf.yml", "yaml"), ("report.docx", "docx"), ("paper.pdf", "pdf"),
])
def test_add_each_type(kenv, tmp_path, name, kind):
    path, data = make(tmp_path, name)
    body = ok(cli(kenv, "add", "--file", str(path), "--name", name, "--source", "web"))
    source = body["source"]
    assert set(source) == {"id", "name", "kind", "bytes", "chunks", "added_at", "source",
                           "original"}
    assert re.fullmatch(r"[0-9a-f]{32}", source["id"])
    assert (source["name"], source["kind"], source["source"]) == (name, kind, "web")
    assert source["bytes"] == len(data) and source["chunks"] >= 1
    assert source["original"] is True


def test_list_and_the_terminal_source(kenv, tmp_path):
    assert ok(cli(kenv, "list"))["sources"] == []
    path, _ = make(tmp_path, "a.txt")
    added = ok(cli(kenv, "add", "--file", str(path), "--name", "a.txt",
                   "--source", "terminal"))["source"]
    assert added["source"] == "terminal"
    assert ok(cli(kenv, "list"))["sources"] == [added]


def test_the_name_is_a_cleaned_base_name(kenv, tmp_path):
    path, _ = make(tmp_path, "up.txt")
    long = "x" * 200 + ".txt"
    source = ok(cli(kenv, "add", "--file", str(path), "--name", "/etc/dir\\sub/Run book.txt",
                    "--source", "web"))["source"]
    assert source["name"] == "Run book.txt"
    source = ok(cli(kenv, "add", "--file", str(path), "--name", long, "--source", "web"))["source"]
    assert len(source["name"]) <= 120


@pytest.mark.parametrize("name", ["notes.md", "report.docx", "paper.pdf", "data.json"])
def test_original_is_the_exact_unredacted_file(kenv, tmp_path, name):
    path, data = make(tmp_path, name)
    source = ok(cli(kenv, "add", "--file", str(path), "--name", name,
                    "--source", "web"))["source"]
    proc = cli(kenv, "original", source["id"])
    assert proc.returncode == 0 and proc.stdout == data


def test_the_orig_file_is_encrypted_and_the_passages_are_redacted(kenv, tmp_path):
    path, _ = make(tmp_path, "creds.txt")
    source = ok(cli(kenv, "add", "--file", str(path), "--name", "creds.txt",
                    "--source", "web"))["source"]
    folder = Path(kenv["RECONIX_KNOWLEDGE_DIR"])
    orig = folder / f"{source['id']}.orig"
    assert stat.S_IMODE(orig.stat().st_mode) == 0o600
    assert TEST_PASSWORD.encode() not in orig.read_bytes()
    for name in (f"{source['id']}.json", "index.json"):
        assert TEST_PASSWORD not in (folder / name).read_text()
    assert cli(kenv, "original", source["id"]).stdout.count(TEST_PASSWORD.encode()) == 1


def test_remove_deletes_the_passages_and_the_original(kenv, tmp_path):
    path, _ = make(tmp_path, "a.txt")
    source = ok(cli(kenv, "add", "--file", str(path), "--name", "a.txt",
                    "--source", "web"))["source"]
    folder = Path(kenv["RECONIX_KNOWLEDGE_DIR"])
    assert ok(cli(kenv, "remove", source["id"])) == {"ok": True}
    assert not (folder / f"{source['id']}.json").exists()
    assert not (folder / f"{source['id']}.orig").exists()
    assert ok(cli(kenv, "list"))["sources"] == []


# --- refusals ------------------------------------------------------------------------------
def test_doc_files_are_refused(kenv, tmp_path):
    path = tmp_path / "old.doc"
    path.write_bytes(b"\xd0\xcf\x11\xe0 not really")
    for name in ("old.doc", "OLD.DOC"):
        error = refused(cli(kenv, "add", "--file", str(path), "--name", name, "--source", "web"))
        assert error == "Save it as .docx first (old .doc files aren't supported)."


def test_the_name_picks_the_kind_not_the_temp_file(kenv, tmp_path):
    path = tmp_path / "upload.tmp"                  # the web's temp file has no real extension
    path.write_text("plain notes about the engagement")
    source = ok(cli(kenv, "add", "--file", str(path), "--name", "notes.txt",
                    "--source", "web"))["source"]
    assert source["kind"] == "txt"


def test_too_big_unknown_type_and_symlink(kenv, tmp_path):
    big = tmp_path / "big.txt"
    big.write_bytes(b"a" * (10 * 1024 * 1024 + 1))
    refused(cli(kenv, "add", "--file", str(big), "--name", "big.txt", "--source", "web"),
            "too large")
    odd = tmp_path / "tool.exe"
    odd.write_bytes(b"MZ")
    refused(cli(kenv, "add", "--file", str(odd), "--name", "tool.exe", "--source", "web"),
            "Unsupported file type")
    real, _ = make(tmp_path, "real.txt")
    link = tmp_path / "link.txt"
    link.symlink_to(real)
    refused(cli(kenv, "add", "--file", str(link), "--name", "link.txt", "--source", "web"),
            "symlink")
    refused(cli(kenv, "add", "--file", str(tmp_path / "missing.txt"), "--name", "m.txt",
                "--source", "web"), "No file")


def test_bad_arguments_are_a_refusal(kenv):
    refused(cli(kenv, "add", "--file", "x"))
    refused(cli(kenv, "frobnicate"))


@pytest.mark.parametrize("command", ["original", "remove"])
def test_bad_and_unknown_ids_exit_2(kenv, command):
    for bad in ("../../etc/passwd", "XYZ", "0" * 31, "0" * 32):
        proc = cli(kenv, command, bad)
        assert proc.returncode == 2
        assert proc.stdout == b"" or command == "remove"
        refused(proc, "Unknown add-on")


def test_a_source_without_an_original_exits_2(kenv, tmp_path):
    path, _ = make(tmp_path, "a.txt")
    source = ok(cli(kenv, "add", "--file", str(path), "--name", "a.txt",
                    "--source", "web"))["source"]
    folder = Path(kenv["RECONIX_KNOWLEDGE_DIR"])
    (folder / f"{source['id']}.orig").unlink()
    proc = cli(kenv, "original", source["id"])
    assert proc.stdout == b""
    refused(proc, "No original was kept")


def test_an_internal_error_is_exit_1_with_a_fixed_message(kenv, tmp_path):
    path, _ = make(tmp_path, "a.txt")
    folder = Path(kenv["RECONIX_KNOWLEDGE_DIR"])
    folder.parent.mkdir(parents=True, exist_ok=True)
    folder.write_text("a file where the folder should be")
    proc = cli(kenv, "add", "--file", str(path), "--name", "a.txt", "--source", "web")
    assert proc.returncode in (1, 2)
    assert json.loads(proc.stdout)["ok"] is False
    assert TEST_PASSWORD not in proc.stdout.decode()


# --- the key file --------------------------------------------------------------------------
def test_the_key_file_is_0600_and_a_readable_one_is_refused(kenv, tmp_path):
    path, _ = make(tmp_path, "a.txt")
    ok(cli(kenv, "add", "--file", str(path), "--name", "a.txt", "--source", "web"))
    key = Path(kenv["RECONIX_KNOWLEDGE_KEY_FILE"])
    assert stat.S_IMODE(key.stat().st_mode) == 0o600
    key.chmod(0o640)
    error = refused(cli(kenv, "add", "--file", str(path), "--name", "b.txt", "--source", "web"),
                    "knowledge key")
    assert key.read_bytes().decode() not in error
    assert len(ok_list(kenv)) == 1                    # the refused add left nothing behind
    key.chmod(0o600)
    ok(cli(kenv, "add", "--file", str(path), "--name", "b.txt", "--source", "web"))


def ok_list(env):
    return ok(cli(env, "list"))["sources"]


def test_an_older_index_without_the_new_fields_still_lists(kenv, tmp_path):
    folder = Path(kenv["RECONIX_KNOWLEDGE_DIR"])
    folder.mkdir(parents=True, mode=0o700)
    row = {"id": "a" * 32, "name": "old.md", "kind": "md", "bytes": 5, "chunks": 1,
           "added_at": "2026-01-01T00:00:00+00:00"}
    index = folder / "index.json"
    index.write_text(json.dumps({"format": "reconix.knowledge/v1", "sources": [row]}))
    index.chmod(0o600)
    (source,) = ok_list(kenv)
    assert (source["source"], source["original"]) == ("terminal", False)
    refused(cli(kenv, "original", "a" * 32), "No original was kept")
    ok(cli(kenv, "remove", "a" * 32))


# --- the store, in process -----------------------------------------------------------------
def test_the_terminal_add_keeps_the_original(tmp_path):
    p = tmp_path / "creds.txt"
    p.write_text(SECRET_LINE)
    source = store.add_source(str(p))
    assert (source.source, source.original) == ("terminal", True)
    assert store.list_sources() == [source]
    assert store.knowledge.read_original(source.id) == SECRET_LINE.encode()
    assert TEST_PASSWORD.encode() not in original.original_path(source.id).read_bytes()
    assert TEST_PASSWORD not in " ".join(files.read_chunks(source.id))


def test_the_key_is_created_0600_with_a_private_parent(tmp_path):
    p = tmp_path / "a.txt"
    p.write_text("reference")
    store.add_source(str(p))
    key = paths.key_file()
    assert stat.S_IMODE(key.stat().st_mode) == 0o600
    assert stat.S_IMODE(key.parent.stat().st_mode) == 0o700
    assert key != Path("~/.reconix/llm.key").expanduser()


def test_remove_and_clear_delete_the_originals(tmp_path):
    ids = []
    for name in ("a.txt", "b.txt", "c.txt"):
        p = tmp_path / name
        p.write_text(f"document {name}")
        ids.append(store.add_source(str(p)).id)
    store.remove_source(ids[0])
    folder = paths.knowledge_dir()
    assert not (folder / f"{ids[0]}.orig").exists()
    assert (folder / f"{ids[1]}.orig").exists()
    store.clear_knowledge()
    assert not list(folder.glob("*.orig")) and not list(folder.glob("*.json"))


def test_clear_removes_originals_even_with_a_corrupt_index(tmp_path):
    p = tmp_path / "a.txt"
    p.write_text("document")
    source = store.add_source(str(p))
    files.index_path().write_text("not json")
    assert store.clear_knowledge() >= 1
    assert not original.original_path(source.id).exists()


def test_a_failed_save_leaves_no_original(tmp_path, monkeypatch):
    p = tmp_path / "a.txt"
    p.write_text("document")

    def boom(*_a, **_k):
        raise OSError("disk full")

    monkeypatch.setattr(files, "write_index", boom)
    with pytest.raises(store.StoreValidationError):
        store.add_source(str(p))
    assert not list(paths.knowledge_dir().glob("*.orig"))
    assert not list(paths.knowledge_dir().glob("[0-9a-f]*.json"))


def test_a_tampered_original_is_refused(tmp_path):
    p = tmp_path / "a.txt"
    p.write_text("document")
    source = store.add_source(str(p))
    target = original.original_path(source.id)
    target.write_bytes(b"not a token")
    with pytest.raises(store.StoreValidationError, match="can't be read"):
        store.knowledge.read_original(source.id)


def test_a_symlinked_original_is_not_read(tmp_path):
    p = tmp_path / "a.txt"
    p.write_text("document")
    source = store.add_source(str(p))
    target = original.original_path(source.id)
    saved = tmp_path / "saved.bin"
    saved.write_bytes(target.read_bytes())
    target.unlink()
    target.symlink_to(saved)
    with pytest.raises(store.StoreValidationError):
        store.knowledge.read_original(source.id)


def test_unknown_origin_is_refused(tmp_path):
    p = tmp_path / "a.txt"
    p.write_text("document")
    with pytest.raises(store.StoreValidationError):
        store.knowledge.add_source(str(p), origin="elsewhere")
