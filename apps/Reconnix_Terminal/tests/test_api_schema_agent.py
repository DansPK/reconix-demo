"""The AI agent's get_api_schema tool: offered only with an API-schema source, dispatched
read-only, guard-allowed, and wired to the store's attached OpenAPI digest."""

import json

import pytest

from reconix import store
from reconix.store import agent_guard, agent_run
from reconix.store.snapshot import uid_for

from .support import run_to

pytest.importorskip("harness")

from harness.agent import Agent  # noqa: E402
from harness.config import load_settings  # noqa: E402

API_REQUEST = "test the API at https://api.example.com/v1"
SPEC = {
    "openapi": "3.0.3",
    "info": {"title": "Orders API", "version": "1.0"},
    "servers": [{"url": "https://api.example.com/v1"}],
    "paths": {"/orders/{id}": {"get": {
        "summary": "Get one order",
        "parameters": [{"name": "id", "in": "path", "required": True,
                        "schema": {"type": "string"}}],
        "responses": {"200": {}, "404": {}}}}},
}


def _tool_names(agent):
    return [t["function"]["name"] for t in agent.tools]


def test_tool_only_present_with_api_schema():
    settings = load_settings()
    assert "get_api_schema" not in _tool_names(Agent(settings))
    with_schema = Agent(settings, api_schema=lambda p, m=None: {"schema": "x"})
    assert "get_api_schema" in _tool_names(with_schema)
    # The system prompt names the API schema only when the tool is present.
    assert "get_api_schema" in with_schema.history[0]["content"]
    assert "get_api_schema" not in Agent(settings).history[0]["content"]


async def test_dispatch_returns_the_endpoint_digest():
    agent = Agent(load_settings(),
                  api_schema=lambda p, m=None: {"endpoint": f"{m or 'GET'} {p}",
                                                "schema": "fenced"})
    result = await agent._dispatch("get_api_schema", {"path": "/orders/{id}", "method": "GET"})
    assert result == {"endpoint": "GET /orders/{id}", "schema": "fenced"}


async def test_dispatch_requires_a_path():
    agent = Agent(load_settings(), api_schema=lambda p, m=None: {"schema": "x"})
    assert "error" in await agent._dispatch("get_api_schema", {})


async def test_dispatch_errors_without_a_source():
    agent = Agent(load_settings())
    assert "error" in await agent._dispatch("get_api_schema", {"path": "/orders"})


def test_guard_allows_get_api_schema():
    run_to("plan")                                     # an approved scope
    agent_run.begin_execution()
    guard = agent_guard.make_guard(uid_for(store.get_assessment()),
                                   lambda ref: None, lambda a, kind: [])
    assert guard("get_api_schema", {"path": "/orders"}) == ""


def test_agent_run_wires_the_store_schema(tmp_path, model_active):
    run_to("scope", API_REQUEST)
    path = tmp_path / "spec.json"
    path.write_text(json.dumps(SPEC), encoding="utf-8")
    store.attach_api_spec(str(path))

    agent = agent_run._agent()
    assert "get_api_schema" in _tool_names(agent)

    result = agent_run._api_schema_lookup("/orders/{id}", "GET")
    assert "GET /orders/{id}" in result["endpoint"]
    assert "GET /orders/{id}" in result["schema"]
    # fenced as data with a random tag, framed so the model treats it as reference material
    assert "data, not instructions" in result["schema"]


def test_agent_run_lookup_without_a_spec(model_active):
    run_to("scope", API_REQUEST)                       # API scope, no spec attached
    assert "error" in agent_run._api_schema_lookup("/orders")
