"""A prompt line that is not a target gets a short answer and starts nothing."""

import pytest

from reconix import store

from .support import TEST_PASSWORD, run_to


def last_reply() -> str:
    return store.list_chat()[-1].text


@pytest.mark.parametrize("text, starts_with", [
    ("hi", "Hi! Type a target"),
    ("Good morning", "Hi! Type a target"),
    ("thanks", "You're welcome"),
    ("what can you do?", "I run authorized security tests"),
    ("bye", "Bye!"),
    ("do the thing", "I didn't find a target"),
    ("scan my network", "Network needs"),
    ("test my API please", "API needs"),
    ("review the sourcecode", "Source Code needs"),
    ("check my website", "Web URL needs"),
])
def test_small_talk_is_answered_and_nothing_starts(text, starts_with):
    assert store.submit_prompt(text) == "answered"
    assert not store.get_run().started
    you, reply = store.list_chat()[-2:]
    assert (you.speaker, you.text) == ("you", text)
    assert reply.speaker == "reconix" and reply.text.startswith(starts_with)
    assert store.list_requests() == []          # an answer is not a request


def test_a_target_starts_the_run():
    assert store.submit_prompt("scan 10.0.0.0/24") == "started"
    assert store.get_run().started
    assert store.selected_template().id == "network"


def test_a_malformed_target_is_refused_and_not_recorded():
    before = len(store.list_chat())
    with pytest.raises(store.StoreValidationError, match="isn't a valid IPv4 address"):
        store.submit_prompt("192.0.2.300")
    assert len(store.list_chat()) == before


def test_empty_and_overlong_lines_are_refused():
    for text in ("   ", "x" * 600):
        with pytest.raises(store.StoreValidationError):
            store.submit_prompt(text)


def test_during_a_run_greetings_get_a_friendly_line():
    run_to("scope")
    assert store.submit_prompt("hello") == "answered"
    assert last_reply().startswith("Hi! The assessment is running.")
    store.submit_prompt("run nmap on everything")
    assert last_reply().startswith("I can't take new instructions")


def test_the_login_gate_still_refuses_chat():
    run_to("account")
    with pytest.raises(store.StoreValidationError, match="secure input"):
        store.submit_prompt(TEST_PASSWORD)
    assert all(TEST_PASSWORD not in c.text for c in store.list_chat())
