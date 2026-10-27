"""LLMClient maps a LiteLLM response to the agent's message dict (offline, mocked)."""

from types import SimpleNamespace

import litellm
import pytest

from harness.config import LLMSettings
from harness.llm.client import LLMClient


def _response(content, tool_calls=None):
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


async def test_raw_chat_plain_text(monkeypatch):
    async def fake(**kwargs):
        assert kwargs["model"] == "openai/m"          # bare model + base_url → openai/<model>
        assert kwargs["api_base"] == "http://x/v1"
        return _response("hello")

    monkeypatch.setattr(litellm, "acompletion", fake)
    client = LLMClient(LLMSettings(base_url="http://x/v1", model="m", api_key="k"))
    msg = await client.raw_chat([{"role": "user", "content": "hi"}])
    assert msg == {"role": "assistant", "content": "hello"}


async def test_raw_chat_maps_tool_calls(monkeypatch):
    tc = SimpleNamespace(id="call_1", type="function",
                         function=SimpleNamespace(name="run_scan", arguments='{"target":"x"}'))

    async def fake(**kwargs):
        assert kwargs.get("tool_choice") == "auto"     # tools passed through
        return _response("thinking", [tc])

    monkeypatch.setattr(litellm, "acompletion", fake)
    client = LLMClient(LLMSettings(base_url="http://x/v1", model="m"))
    msg = await client.raw_chat([], tools=[{"type": "function"}])
    assert msg["tool_calls"] == [
        {"id": "call_1", "type": "function",
         "function": {"name": "run_scan", "arguments": '{"target":"x"}'}}
    ]


async def test_raw_chat_captures_reasoning(monkeypatch):
    message = SimpleNamespace(content="answer", tool_calls=None,
                             reasoning_content="let me think step by step")

    async def fake(**kwargs):
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    monkeypatch.setattr(litellm, "acompletion", fake)
    client = LLMClient(LLMSettings(base_url="http://x/v1", model="m"))
    msg = await client.raw_chat([])
    assert msg["reasoning_content"] == "let me think step by step"
    assert msg["content"] == "answer"


async def test_unconfigured_client_raises():
    client = LLMClient(LLMSettings())          # no model → not enabled
    assert client.available is False
    with pytest.raises(RuntimeError):
        await client.raw_chat([])
