"""Intent on the prompt line ("… scan port 80 with nmap") prefills the draft scope."""

import pytest

from reconix import store
from reconix.store.parser import extract_ports, extract_tools, parse_request

from .support import play_until_gate


# --- reading ports and tools off the line --------------------------------------------------
@pytest.mark.parametrize("text, ports", [
    ("scan with port 80", (80,)),
    ("ports 80, 443 and 8080", (80, 443, 8080)),
    ("port 80 port 80", (80,)),               # de-duplicated, in order
    ("nmap the host", ()),                    # no port named
    ("port 70000", ()),                       # out of range, dropped
])
def test_extract_ports(text, ports):
    assert extract_ports(text) == ports


@pytest.mark.parametrize("text, tools", [
    ("using tool nmap", ("nmap",)),
    ("run nmap and owasp zap and testssl.sh", ("nmap", "OWASP ZAP", "testssl.sh")),
    ("NMAP NMAP", ("nmap",)),                 # case-insensitive, de-duplicated
    ("just look at it", ()),                  # no tool named
])
def test_extract_tools(text, tools):
    assert extract_tools(text) == tools


def test_parse_request_carries_intent():
    parsed = parse_request("191.121.133.211 scan this with port 80 and using tool nmap")
    assert parsed.kind == "network"
    assert parsed.target == "191.121.133.211"
    assert parsed.ports == (80,)
    assert parsed.tools == ("nmap",)


# --- the intent prefills the draft scope, which is still approved --------------------------
def test_intent_prefills_network_scope():
    store.start_run("192.0.2.10 scan port 80 with nmap")
    assert play_until_gate() == "scope"
    scope = store.get_scope()
    assert scope.allowed_ports == [80]
    assert scope.tools == ["nmap"]
    assert not store.is_scope_approved()      # prefilled only; the operator still approves


def test_intent_note_is_logged_before_approval():
    store.start_run("192.0.2.10 scan port 8443 with nmap")
    play_until_gate()
    notes = [e.message for e in store.list_activity() if "draft scope" in e.message.lower()]
    assert notes and "port 8443" in notes[0] and "nmap" in notes[0]


def test_no_intent_leaves_template_defaults():
    store.start_run("192.0.2.10")
    play_until_gate()
    scope = store.get_scope()
    assert scope.allowed_ports == [22, 80, 443, 8080, 8443]   # network template defaults
    assert scope.tools == ["nmap", "testssl.sh"]


def test_tools_apply_to_a_web_scope():
    # Tools prefill any scope; ports only matter for a network scope (allowed_ports).
    store.start_run("https://shop.example.com test with sqlmap")
    play_until_gate()
    scope = store.get_scope()
    assert scope.kind == "web_url"
    assert scope.tools == ["sqlmap"]
