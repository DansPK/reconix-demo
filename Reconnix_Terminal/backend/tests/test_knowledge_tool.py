"""The Agent's optional, read-only knowledge tool (search_knowledge).

Offered only when the embedding app supplies a knowledge callback. No MCP/LLM/network.
"""

from __future__ import annotations

from harness.agent import Agent
from harness.config import KaliMCPSettings, LLMSettings, Settings


def _settings(tmp_path) -> Settings:
    return Settings(llm=LLMSettings(), kali=KaliMCPSettings(), db_path=tmp_path / "t.db",
                    yaml={"profiles": {"recon": ["whatweb"]}})


def _names(agent: Agent) -> list[str]:
    return [t["function"]["name"] for t in agent.tools]


def test_no_knowledge_tool_without_a_callback(tmp_path):
    agent = Agent(_settings(tmp_path))
    assert "search_knowledge" not in _names(agent)
    assert "search_knowledge" not in agent.history[0]["content"]


def test_knowledge_tool_present_with_a_callback(tmp_path):
    agent = Agent(_settings(tmp_path),
                  knowledge=lambda q: [{"source": "a.md", "index": 0, "text": "ref"}])
    assert "search_knowledge" in _names(agent)
    assert "search_knowledge" in agent.history[0]["content"]


async def test_dispatch_returns_passages(tmp_path):
    seen = {}

    def search(query: str):
        seen["query"] = query
        return [{"source": "runbook.md", "index": 2, "text": "the admin panel is at /admin"}]

    agent = Agent(_settings(tmp_path), knowledge=search)
    result = await agent._dispatch("search_knowledge", {"query": "where is admin"})
    assert seen["query"] == "where is admin"
    assert result == {"passages": [{"source": "runbook.md", "index": 2,
                                    "text": "the admin panel is at /admin"}]}


async def test_dispatch_empty_without_callback(tmp_path):
    agent = Agent(_settings(tmp_path))
    assert await agent._dispatch("search_knowledge", {"query": "x"}) == {"passages": []}


async def test_dispatch_swallows_callback_errors(tmp_path):
    def boom(query: str):
        raise RuntimeError("lookup failed")

    agent = Agent(_settings(tmp_path), knowledge=boom)
    result = await agent._dispatch("search_knowledge", {"query": "x"})
    assert result["passages"] == [] and "lookup failed" in result["error"]
