"""Each template's target is validated, and a clear target picks its template itself."""

import pytest

from reconix import store
from reconix.store.parser import parse_request

from .support import event_kinds, play_until_gate


# --- check_target: what each template accepts ----------------------------------------------
@pytest.mark.parametrize("template_id, text, target", [
    ("network", "192.0.2.10", "192.0.2.10"),
    ("network", "scan 10.0.0.0/24 for open ports", "10.0.0.0/24"),
    ("network", "10.0.0.5/24", "10.0.0.0/24"),                    # host bits are dropped
    ("network", "host.example.com", "host.example.com"),
    ("web_url", "https://shop.example.com/cart", "shop.example.com"),
    ("web_url", "shop.example.com", "shop.example.com"),
    ("web_url", "192.0.2.10", "192.0.2.10"),
    ("api", "https://api.example.com/v1", "api.example.com"),
    ("source", "https://github.com/acme/app", "github.com/acme/app"),
    ("source", "git@github.com:acme/app.git", "git@github.com:acme/app.git"),
    ("source", "https://git.example.com/acme/app.git", "https://git.example.com/acme/app.git"),
    ("source", "review /home/me/project", "/home/me/project"),
    ("source", "./app", "./app"),
    ("source", "~/code/app/", "~/code/app"),
])
def test_valid_targets_are_accepted(template_id, text, target):
    parsed = store.check_target(template_id, text)
    assert (parsed.template_id, parsed.target) == (template_id, target)


@pytest.mark.parametrize("template_id, text, says", [
    ("network", "10.0.0.300", "isn't a valid IPv4 address"),
    ("network", "1000.0.0.1", "isn't a valid IPv4 address"),
    ("network", "10.0.0.0/40", "isn't a valid IPv4 range"),
    ("network", "10.0.0.0/8", "too wide"),
    ("network", "0.0.0.0", "can be tested"),
    ("network", "224.0.0.1", "can be tested"),
    ("network", "my servers", "Network needs"),
    ("web_url", "10.0.0.0/24", "Web URL needs"),                 # a range is not a site
    ("web_url", "https://shop.example.com:99999", "invalid port"),
    ("api", "the usual one", "API needs"),
    ("source", "https://shop.example.com", "Source Code needs"),  # a site, not a repo
    ("source", "github.com/acme", "isn't a repository"),
    ("source", "review my code", "Source Code needs"),
    ("source", "   ", "Source Code needs"),
])
def test_invalid_targets_say_what_to_type(template_id, text, says):
    with pytest.raises(store.StoreValidationError, match=says):
        store.check_target(template_id, text)


def test_unknown_templates_are_refused():
    with pytest.raises(store.StoreValidationError):
        store.check_target("mainframe", "192.0.2.10")


def test_credentials_in_a_url_are_never_kept():
    web = store.check_target("web_url", "https://admin:Hunter2pw@shop.example.com/")
    repo = store.check_target("source", "https://bot:ghp_tok3n@git.example.com/acme/app.git")
    assert "Hunter2pw" not in web.target_url and "admin" not in web.target_url
    assert "ghp_tok3n" not in repo.target and "bot" not in repo.target


# --- free text: the target's shape picks the template ----------------------------------------
@pytest.mark.parametrize("text, kind, confident", [
    ("192.0.2.10", "network", True),
    ("scan 10.0.0.0/24", "network", True),
    ("https://shop.example.com", "web_url", True),
    ("Assess https://shop.example.com for code injection", "web_url", True),
    ("https://api.example.com/v1", "api", True),
    ("github.com/acme/app", "source", True),
    ("/home/me/project", "source", True),
    ("check the website shop.example.com", "web_url", True),
    ("port scan host.example.com", "network", True),
    ("shop.example.com", "web_url", False),                     # could be any kind: ask
    ("check reports on digital.example.com", "web_url", False),  # whole words only
])
def test_the_shape_of_the_target_picks_the_template(text, kind, confident):
    parsed = parse_request(text)
    assert (parsed.template_id, parsed.confident) == (kind, confident)


@pytest.mark.parametrize("text", ["hi", "thanks!", "what can you do?", "scan my network",
                                  "review the source of https://shop.example.com"])
def test_text_without_a_usable_target_is_none(text):
    assert parse_request(text) is None


# --- starting a run ---------------------------------------------------------------------------
@pytest.mark.parametrize("text, template_id", [
    ("192.0.2.10", "network"),
    ("https://shop.example.com", "web_url"),
    ("git@github.com:acme/app.git", "source"),
])
def test_a_clear_target_skips_the_template_gate_but_never_the_scope(text, template_id):
    store.start_run(text)
    assert store.selected_template().id == template_id
    assert play_until_gate() == "scope"
    assert store.counters()["requests"] == 0                 # nothing tested before approval
    assert not store.is_scope_approved()
    activity = [(a.source, a.message) for a in store.list_activity()]
    assert ("AI", f"Template auto-selected: {store.selected_template().name} "
                  "(matched to the target)") in activity
    assert "template.selected" in event_kinds()


def test_a_template_picked_with_the_command_is_the_operators_choice():
    store.start_run("10.0.0.0/24", "network")
    assert play_until_gate() == "scope"
    assert ("USER", "Template selected: Network") in [
        (a.source, a.message) for a in store.list_activity()]
    chat = [c.text for c in store.list_chat()]
    assert "Template selected: Network. Drafting a Scope Manifest…" in chat


def test_a_target_that_does_not_fit_the_template_starts_nothing():
    with pytest.raises(store.StoreValidationError, match="Source Code needs"):
        store.start_run("https://shop.example.com", "source")
    assert not store.get_run().started
    assert store.list_requests() == []


def test_a_malformed_target_starts_nothing():
    with pytest.raises(store.StoreValidationError, match="IPv4"):
        store.start_run("scan 10.0.0.300")
    assert not store.get_run().started
