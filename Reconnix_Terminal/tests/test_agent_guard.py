"""The agent's scope guard: every tool call is checked against the approved scope.

The harness `Agent` is real (its LLM is a scripted stub, no network or Kali VM); the guard,
the decisions and the audit trail are Reconix's. A refusal never reaches a tool.
"""

import json
from datetime import timedelta

import pytest

from reconix import store
from reconix.store import agent_guard, agent_run, lists
from reconix.store.snapshot import uid_for

from .support import run_to


def _guard(kind="web", tools=("whatweb", "nuclei", "nikto")):
    """A guard over the current assessment's snapshot, with a fake target table."""
    targets = {"web": ("https://staging.example.com", "web"),
               "other": ("https://evil.example.net", "web"),
               "net": ("10.0.0.7", "network")}

    def lookup(ref):
        return targets.get(ref)

    def tools_for(args, _kind):
        return list(args.get("tools") or tools)

    return agent_guard.make_guard(uid_for(store.get_assessment()), lookup, tools_for)


@pytest.fixture
def web_guard():
    run_to("plan")                            # the demo web scope, approved
    agent_run.begin_execution()
    return _guard()


@pytest.fixture
def cidr_guard():
    run_to("plan", request="10.0.0.0/28")     # a network scope on a range
    agent_run.begin_execution()
    return _guard()


@pytest.fixture
def source_guard():
    run_to("plan", request="/home/me/app")    # a source-code scope
    agent_run.begin_execution()
    return _guard()


@pytest.fixture
def net_guard():
    run_to("plan", request="10.0.0.7")        # a network scope with an allowed-port list
    agent_run.begin_execution()
    return _guard()


def test_in_scope_get_is_allowed(web_guard):
    assert web_guard("http_poc", {"method": "GET",
                                  "url": "https://staging.example.com/products?id=1"}) == ""
    assert web_guard("run_scan", {"target": "web", "tools": ["nuclei"]}) == ""
    assert web_guard("update_plan", {}) == ""


@pytest.mark.parametrize("name,args,reason", [
    ("http_poc", {"method": "GET", "url": "https://staging.example.com/Admin/users"},
     "Path outside approved scope"),
    ("http_poc", {"method": "DELETE", "url": "https://staging.example.com/products"},
     "Method DELETE not allowed"),
    ("http_poc", {"method": "GET", "url": "https://evil.example.net/x"},
     "Host outside approved scope"),
    ("login", {"url": "https://evil.example.net/login"}, "Host outside approved scope"),
    ("run_scan", {"target": "other", "tools": ["nuclei"]}, "Host outside approved scope"),
    ("run_scan", {"target": "web", "tools": ["metasploit"]},
     "Tool metasploit is not in the approved scope"),
    ("authorize_target", {"target": "other"}, "Host outside approved scope"),
    ("add_target", {"value": "https://evil.example.net", "authorized": True},
     "Host outside approved scope"),
    ("http_poc", {"method": "GET", "url": "/relative"}, "Malformed request target"),
    ("request_credentials", {"login_url": "https://evil.example.net/login"},
     "Host outside approved scope"),
    ("shell", {"cmd": "id"}, "Tool shell is not allowed in agent mode"),
])
def test_guard_refuses(web_guard, name, args, reason):
    assert web_guard(name, args) == reason


def test_everything_is_refused_after_the_time_limit(web_guard):
    snap = agent_guard.snapshot(uid_for(store.get_assessment()))
    snap.started_at -= timedelta(minutes=31)
    for name, args in [("http_poc", {"method": "GET", "url": "https://staging.example.com/"}),
                       ("update_plan", {}), ("run_scan", {"target": "web"})]:
        assert web_guard(name, args) == "Time limit reached"


def test_nothing_runs_before_the_scope_is_approved_or_after_revoke(web_guard):
    agent_run.revoke(uid_for(store.get_assessment()))
    assert web_guard("update_plan", {}) == "Scope not approved"


def test_the_decision_uses_a_copy_of_the_scope(web_guard):
    lists.current().scope.excluded_paths.clear()          # a later live edit changes nothing
    assert web_guard("http_poc", {"method": "GET",
                                  "url": "https://staging.example.com/admin"}) != ""


def test_network_scope_checks_ports_and_hosts(net_guard):
    assert net_guard("run_scan", {"target": "net", "tools": ["nmap"]}) == ""
    assert net_guard("http_poc", {"url": "http://10.0.0.7:8080/"}) == ""
    assert net_guard("http_poc", {"url": "http://10.0.0.7:3306/"}) == \
        "Port 3306 not in the approved list"
    assert net_guard("http_poc", {"url": "http://10.0.0.9:80/"}) == \
        "Host outside approved scope"
    assert net_guard("run_scan", {"target": "web", "tools": ["nmap"]}) == \
        "Host outside approved scope"


def test_cidr_scope_allows_hosts_in_the_range_only(cidr_guard):
    assert cidr_guard("http_poc", {"url": "http://10.0.0.5:80/"}) == ""
    assert cidr_guard("http_poc", {"url": "http://10.0.1.5:80/"}) == "Host outside approved scope"
    assert cidr_guard("http_poc", {"url": "http://10.0.0.5:9999/"}) == \
        "Port 9999 not in the approved list"


def test_source_scope_refuses_every_network_tool(source_guard):
    reason = "Source-code scopes have no network tools for the agent"
    assert source_guard("http_poc", {"url": "http://10.0.0.5/"}) == reason
    assert source_guard("run_scan", {"target": "web", "tools": ["Semgrep"]}) == reason
    assert source_guard("login", {"url": "http://10.0.0.5/login"}) == reason
    assert source_guard("update_plan", {}) == ""


def test_the_guard_covers_exactly_the_harness_tools(web_guard):
    harness = pytest.importorskip("harness")
    from harness.agent import API_SCHEMA_TOOL, KNOWLEDGE_TOOL, TOOLS

    # The base tools, plus the optional read-only reference tools Reconix always wires in.
    names = {t["function"]["name"] for t in TOOLS}
    names.add(KNOWLEDGE_TOOL["function"]["name"])
    names.add(API_SCHEMA_TOOL["function"]["name"])
    assert agent_guard.KNOWN_TOOLS == names         # a new tool needs a rule, or this fails
    snap = agent_guard.snapshot(uid_for(store.get_assessment()))
    for name in names:
        reason = agent_guard.decide(snap, name, {}, lambda ref: None, lambda a, k: [])
        assert "not allowed in agent mode" not in reason, name
    assert harness is not None


# --- through the real Agent loop -----------------------------------------------------------
def _tool_call(cid, name, args):
    return {"id": cid, "type": "function",
            "function": {"name": name, "arguments": json.dumps(args)}}


async def test_refusal_reaches_the_model_and_the_audit_trail(web_guard, tmp_path):
    pytest.importorskip("harness")
    from harness.agent import Agent
    from harness.config import KaliMCPSettings, LLMSettings, Settings

    agent = Agent(Settings(llm=LLMSettings(), kali=KaliMCPSettings(),
                           db_path=tmp_path / "t.db", yaml={}), guard=web_guard)
    queue = [
        {"role": "assistant", "content": "", "tool_calls": [
            _tool_call("c1", "http_poc", {"method": "GET",
                                          "url": "https://staging.example.com/admin"})]},
        {"role": "assistant", "content": "blocked, moving on"},
    ]

    async def fake_raw_chat(history, tools=None, temperature=0.2):
        return queue.pop(0)

    agent.llm.raw_chat = fake_raw_chat
    events = []

    async def on_event(ev):
        events.append(ev)

    before = store.blocked_count()
    await agent.chat("go", on_event)
    assert any(m.get("role") == "tool" and
               "blocked by Reconix scope: Path outside approved scope" in m["content"]
               for m in agent.history)
    policy = [e for e in events if e["type"] == "policy"]
    assert len(policy) == 1

    for ev in events:                       # the app thread records the events
        agent_run.record_event(ev)
    assert store.blocked_count() == before + 1
    verdict = store.list_verdicts()[-1]
    assert (verdict.method, verdict.allowed) == ("GET", False)
    assert any(a.source == "POLICY" for a in store.list_activity())


def test_run_registers_the_approved_target_as_authorized(web_guard, tmp_path):
    pytest.importorskip("harness")
    from harness.agent import Agent
    from harness.config import KaliMCPSettings, LLMSettings, Settings

    agent = Agent(Settings(llm=LLMSettings(), kali=KaliMCPSettings(),
                           db_path=tmp_path / "t.db", yaml={}))
    uid = uid_for(store.get_assessment())
    agent_run._authorize_approved_target(agent, uid)
    agent_run._authorize_approved_target(agent, uid)        # idempotent
    targets = agent.db.list_targets()
    assert [(t.value, t.authorized) for t in targets] == [("https://staging.example.com", True)]


# --- registering the approved target ---------------------------------------------------------
def _network_scope(target_url):
    from reconix.models import ScopeManifest

    return ScopeManifest(
        kind="network", target_url=target_url, assessment_type="Network", allowed_actions=[],
        allowed_methods=["TCP connect"], excluded_paths=[], time_limit_minutes=30,
        tools=["nmap"], allowed_ports=[22, 8080], status="APPROVED")


def _harness_agent(tmp_path):
    pytest.importorskip("harness")
    from harness.agent import Agent
    from harness.config import KaliMCPSettings, LLMSettings, Settings

    return Agent(Settings(llm=LLMSettings(), kali=KaliMCPSettings(),
                          db_path=tmp_path / "t.db", yaml={}))


@pytest.mark.parametrize("target_url,expected", [
    ("http://10.0.0.7:8080/", ["10.0.0.7:8080"]),     # a URL with a path is not a CIDR
    ("10.0.0.7", ["10.0.0.7"]),
    ("10.0.0.0/28", []),                              # a range: the model adds hosts itself
])
def test_network_targets_are_registered_unless_a_range(tmp_path, target_url, expected):
    from reconix.models.base import utc_now

    agent = _harness_agent(tmp_path)
    agent_guard.install("u1", _network_scope(target_url), utc_now())
    agent_run._authorize_approved_target(agent, "u1")
    assert [(t.value, t.authorized) for t in agent.db.list_targets()] == \
        [(v, True) for v in expected]


def test_an_existing_unauthorized_target_is_authorized(tmp_path):
    from harness.models import Target, TargetType
    from reconix.models.base import utc_now

    agent = _harness_agent(tmp_path)
    agent.db.add_target(Target(name="n", type=TargetType.NETWORK, value="10.0.0.7"))
    agent_guard.install("u1", _network_scope("10.0.0.7"), utc_now())
    agent_run._authorize_approved_target(agent, "u1")
    assert [t.authorized for t in agent.db.list_targets()] == [True]


# --- the real install (agent_run._agent) -------------------------------------------------------
async def test_the_installed_guard_decides_run_scan_with_the_real_lookups(monkeypatch, tmp_path):
    pytest.importorskip("harness")
    from harness import agent as agent_mod
    from harness.models import Target, TargetType

    class Reached(Exception):
        pass

    class FakeMCP:
        def __init__(self, *a, **kw):
            raise Reached()

    monkeypatch.setattr(agent_mod, "KaliMCP", FakeMCP)
    monkeypatch.setenv("HARNESS_DB_PATH", str(tmp_path / "h.db"))
    run_to("plan")
    lists.current().scope.tools = ["whatweb", "nuclei", "nikto", "zap"]
    agent_run.begin_execution()
    agent = agent_run._agent(uid_for(store.get_assessment()))
    assert agent.guard is not None
    agent.register_authorized_target("https://staging.example.com", TargetType.WEB)
    agent.db.add_target(Target(name="evil", type=TargetType.WEB,
                               value="https://evil.example.net", authorized=True))
    agent.settings.yaml["profiles"] = {"recon": ["whatweb"], "deep": ["nmap"]}

    async def scan(**args):
        return await agent._dispatch("run_scan", args)

    out = await scan(target="https://evil.example.net", tools=["nuclei"])
    assert out == {"error": "blocked by Reconix scope: Host outside approved scope"}
    refused = await scan(target="evil")                          # by name; default tools too
    assert "Host outside approved scope" in refused["error"]
    deep = await scan(target="https://staging.example.com", profile="deep")
    assert "Tool nmap is not in the approved scope" in deep["error"]       # profile fallback
    for args in ({"profile": "recon"}, {}, {"tools": ["nuclei"]}):   # profile, default, explicit
        with pytest.raises(Reached):                             # passed the guard, reached MCP
            await scan(target="https://staging.example.com", **args)
