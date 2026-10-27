"""Delegated scanning: the Kali MCP client, path remap, and remote scanner parsing."""

import json
from contextlib import asynccontextmanager
from dataclasses import replace
from types import SimpleNamespace

import pytest

from harness.scanners import gitleaks, kali, remap, semgrep
from harness.scanners.kali import KaliError


@pytest.fixture
def kcfg(cfg):
    """A config that delegates to a (fake) Kali container, mapping the temp dir to /workspace."""
    return replace(cfg, kali_mcp_url="http://kali:8080", kali_mcp_auth_token="tok",
                   kali_workspace_map=((str(cfg.data_dir), "/workspace"),))


def result(text=None, is_error=False, structured=None):
    content = [SimpleNamespace(text=text)] if text is not None else []
    return SimpleNamespace(content=content, is_error=is_error, structured_content=structured)


def connect_returning(res=None, exc=None):
    @asynccontextmanager
    async def connect(cfg, timeout):
        class C:
            async def call_tool(self, name, args):
                if exc:
                    raise exc
                return res
        yield C()
    return connect


def envelope(tool, ok=True, stdout="", exit_code=0, stderr=""):
    return json.dumps({"tool": tool, "ok": ok, "exit_code": exit_code, "duration_s": 0.1,
                       "command": tool, "format": "json", "stdout": stdout, "stderr": stderr})


async def test_call_tool_parses_ok_envelope(kcfg):
    env = await kali.call_tool(kcfg, "semgrep", {}, _connect=connect_returning(
        result(text=envelope("semgrep", stdout='{"results":[]}'))))
    assert env["ok"] and env["stdout"] == '{"results":[]}'


async def test_call_tool_tool_error_envelope(kcfg):
    with pytest.raises(KaliError, match="exit 2"):
        await kali.call_tool(kcfg, "gitleaks", {}, _connect=connect_returning(
            result(text=envelope("gitleaks", ok=False, exit_code=2, stderr="boom"))))


async def test_call_tool_is_error_result(kcfg):
    with pytest.raises(KaliError, match="unknown tool"):
        await kali.call_tool(kcfg, "nope", {}, _connect=connect_returning(
            result(text="[error] unknown tool: nope", is_error=True)))


async def test_call_tool_malformed(kcfg):
    with pytest.raises(KaliError, match="could not be read|unexpected response"):
        await kali.call_tool(kcfg, "semgrep", {}, _connect=connect_returning(result(text="not json")))


async def test_call_tool_unreachable(kcfg):
    with pytest.raises(KaliError, match="could not be reached"):
        await kali.call_tool(kcfg, "semgrep", {}, _connect=connect_returning(exc=ConnectionError("refused")))


def test_remap_longest_prefix(kcfg):
    cfg = replace(kcfg, kali_workspace_map=(("/data", "/workspace"), ("/data/sessions", "/ws2")))
    assert remap.to_container(cfg, "/data/sessions/x/code") == "/ws2/x/code"
    assert remap.to_container(cfg, "/data/other") == "/workspace/other"
    with pytest.raises(KaliError, match="no Kali workspace mapping"):
        remap.to_container(cfg, "/elsewhere/x")


async def test_semgrep_remote_parses_findings(kcfg, monkeypatch, tmp_path):
    code = kcfg.data_dir / "sessions" / "s" / "code"
    code.mkdir(parents=True)
    raw = tmp_path / "raw"
    raw.mkdir()
    semgrep_json = json.dumps({"results": [{
        "check_id": "rules.sqli", "path": "app.py", "start": {"line": 3, "col": 1},
        "end": {"line": 3, "col": 20}, "extra": {"severity": "ERROR", "message": "SQL injection",
                                                  "metadata": {"cwe": "CWE-89"}}}], "errors": []})

    async def fake_call(cfg, tool, args, timeout=None):
        assert tool == "semgrep" and args["path"].startswith("/workspace/")
        return {"ok": True, "stdout": semgrep_json}

    monkeypatch.setattr(kali, "call_tool", fake_call)
    out = await semgrep.scan(code, ["app.py"], ["/data/rules/rules.yml"], raw, cfg=kcfg)
    assert len(out) == 1 and out[0]["tools"] == ["semgrep"] and out[0]["cwe"] == "CWE-89"
    assert (raw / "semgrep.json").exists()


async def test_gitleaks_remote_parses_and_filters(kcfg, monkeypatch, tmp_path):
    code = kcfg.data_dir / "sessions" / "s2" / "code"
    code.mkdir(parents=True)
    raw = tmp_path / "raw2"
    raw.mkdir()
    report = json.dumps([
        {"File": "app.py", "RuleID": "aws-key", "Description": "AWS key", "StartLine": 2, "EndLine": 2,
         "StartColumn": 5, "EndColumn": 20},
        {"File": "other.py", "RuleID": "aws-key", "Description": "AWS key", "StartLine": 1, "EndLine": 1,
         "StartColumn": 1, "EndColumn": 2}])

    async def fake_call(cfg, tool, args, timeout=None):
        assert tool == "gitleaks" and args["path"] == "/workspace/sessions/s2/code"
        return {"ok": True, "stdout": report}

    monkeypatch.setattr(kali, "call_tool", fake_call)
    out = await gitleaks.scan(code, ["app.py"], raw, cfg=kcfg)  # only app.py is in `files`
    assert len(out) == 1 and out[0]["path"] == "app.py" and out[0]["_secret"] is True
