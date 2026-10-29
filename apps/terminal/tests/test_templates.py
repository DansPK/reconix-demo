"""Parsing a typed target, and each template's scope, run and policy."""

import pytest

from reconix import store
from reconix.store import lists
from reconix.store.parser import parse_request

from .support import decide, play_until_gate


# --- the parser ------------------------------------------------------------------------------
@pytest.mark.parametrize("text, kind, target", [
    ("Assess https://staging.example.com for web issues", "web_url", "staging.example.com"),
    ("look at shop.example.com", "web_url", "shop.example.com"),
    ("scan 10.0.0.0/24 for open ports", "network", "10.0.0.0/24"),
    ("port scan 192.0.2.10", "network", "192.0.2.10"),
    ("test the API at https://api.example.com/v1", "api", "api.example.com"),
    ("check the rest api on svc.example.com", "api", "svc.example.com"),
    ("review repo github.com/acme/app", "source", "github.com/acme/app"),
    ("static review of /home/me/project", "source", "/home/me/project"),
])
def test_parse_reads_the_target_and_template(text, kind, target):
    parsed = parse_request(text)
    assert (parsed.kind, parsed.target) == (kind, target)
    assert parsed.template_id == kind


def test_text_without_a_target_is_not_a_target():
    assert parse_request("do the thing") is None


def test_a_bare_hostname_is_not_confident_so_the_operator_picks():
    parsed = parse_request("look at shop.example.com")
    assert parsed.template_id == "web_url"
    assert not parsed.confident


# --- each template runs end to end -----------------------------------------------------------
REQUESTS = {
    "web_url": "Assess https://staging.example.com for web security issues.",
    "network": "scan 10.0.0.0/24 for open ports and services",
    "api": "test the API at https://api.example.com/v1",
    "source": "review repo github.com/acme/app for secrets",
}


def run_full(request: str):
    store.start_run(request)
    while True:
        gate = play_until_gate()
        if gate is None:
            return
        decide(gate)


@pytest.mark.parametrize("template_id", ["web_url", "network", "api", "source"])
def test_each_template_runs_and_blocks_its_out_of_scope_probe(template_id):
    run_full(REQUESTS[template_id])
    assert lists.current().template_id == template_id
    assert store.is_completed()
    counts = store.counters()
    assert counts["approvals"] == 2
    assert counts["findings"] == 3
    assert counts["blocked"] == 1
    assert store.get_scope().kind == template_id


def test_network_blocks_other_hosts_and_ports_but_allows_in_range():
    store.start_run(REQUESTS["network"])
    decide(play_until_gate())            # scope (the range picked Network itself)
    assert store.check_request("TCP", "10.0.0.17:443").allowed
    assert not store.check_request("TCP", "10.9.9.9:443").allowed      # out of range
    assert not store.check_request("TCP", "10.0.0.17:3306").allowed    # port not allowed


def test_source_blocks_excluded_paths_but_allows_the_tree():
    store.start_run(REQUESTS["source"])
    decide(play_until_gate())            # scope (the repo picked Source Code itself)
    assert store.check_request("read", "app/main.py").allowed
    assert not store.check_request("read", ".git/config").allowed
    assert not store.check_request("read", "secrets/key.pem").allowed


def test_suggested_template_follows_the_parsed_target():
    store.start_run(REQUESTS["network"])
    play_until_gate()
    suggested = [t for t in store.list_templates() if t.suggested]
    assert [t.id for t in suggested] == ["network"]
