"""The web dashboard masks pasted secrets with a port of `redact()`
(web/src/lib/assistant/redact.ts) and lists of strings with a port of `redact_lines()`
(web/src/lib/report/mask.ts); both test suites check the same cases
(web/tests/redact-vectors.json, web/tests/redact-list-vectors.json), so the two stay in step."""

import json
from pathlib import Path

import pytest

from reconix.store.redact import clean, redact, redact_all

_DIR = Path(__file__).parents[1] / "web" / "tests"
VECTORS = json.loads((_DIR / "redact-vectors.json").read_text("utf-8"))
LIST_VECTORS = json.loads((_DIR / "redact-list-vectors.json").read_text("utf-8"))


@pytest.mark.parametrize("text, masked", VECTORS)
def test_the_web_port_masks_the_same_way(text, masked):
    assert redact(text) == masked


@pytest.mark.parametrize("items, masked", LIST_VECTORS)
def test_a_list_of_strings_is_masked_as_one_text_like_the_web(items, masked):
    assert redact_all(items) == masked
    assert redact_all({"evidence": items}) == {"evidence": masked}


def test_a_private_key_stored_one_line_per_evidence_entry_is_masked_whole():
    body = ["MIIEowIBAAKCAQEAs3cr3tK3yB0dyL1ne0ne", "Zm9vYmFyYmF6cXV4c2VjcmV0bGluZXR3bw"]
    finding = {"evidence": ["GET /backup/key.pem → 200", "-----BEGIN PRIVATE KEY-----", *body,
                            "-----END PRIVATE KEY-----", "Content-Type: text/plain"]}
    masked = redact_all({"findings": [finding]})["findings"][0]["evidence"]
    assert not any(line in text for line in body for text in masked)
    assert masked == ["GET /backup/key.pem → 200", "•••• (private key)",
                      "Content-Type: text/plain"]


def test_a_list_of_other_values_is_masked_item_by_item():
    assert redact_all([1, "password=x", None]) == [1, "password=••••", None]
    assert redact_all([{"a": "token=abc"}, "Cookie: sid=1"]) == [{"a": "token=••••"},
                                                                  "Cookie: ••••"]


def test_clean_drops_the_control_characters_xml_cannot_hold():
    assert clean("a\x00b\x1b[31mc\x07\x0b\x0c\x7fd￾￿e") == "ab[31mc\x7fde"
    assert clean("tab\there\nline\r\nend") == "tab\there\nline\r\nend"
    assert clean("lone \ud800 surrogate") == "lone ? surrogate"
    assert redact_all(["x\x00\n\x00y", "\x1bpassword=hunter2"]) == ["x\ny", "password=••••"]
