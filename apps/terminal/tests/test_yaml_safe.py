"""Untrusted YAML: no anchors, aliases or merge keys, and no deep nesting, refused at once."""

import time

import pytest
import yaml

from reconix import store
from reconix.store import yaml_safe

# Each level doubles the one below through a merge key: ~2**30 entries if it were expanded.
_MERGE_BOMB = "a0: &a0 {k: v}\n" + "".join(
    f"a{i}: &a{i}\n  <<: [*a{i - 1}, *a{i - 1}]\n  x{i}: {i}\n" for i in range(1, 31))
_ALIAS_BOMB = "a: &a [x, x]\n" + "".join(
    f"{chr(98 + i)}: &{chr(98 + i)} [*{chr(97 + i)}, *{chr(97 + i)}]\n" for i in range(20))
_DEEP = "[" * 50_000 + "]" * 50_000


@pytest.mark.parametrize("text", [_MERGE_BOMB, _ALIAS_BOMB, _DEEP])
def test_expanding_and_deep_documents_are_refused_quickly(text):
    started = time.perf_counter()
    with pytest.raises(yaml_safe.Refused):
        yaml_safe.load(text)
    assert time.perf_counter() - started < 1.0


@pytest.mark.parametrize("text, words", [
    ("base: &b {a: 1}\n", "anchors"),
    ("x: 1\ny: *x\n", "aliases"),
    ("merged:\n  <<: {a: 1}\n  b: 2\n", "merge keys"),
    ("[" * 101 + "]" * 101, "nested"),
])
def test_each_construct_is_named_in_the_refusal(text, words):
    with pytest.raises(yaml_safe.Refused, match=words):
        yaml_safe.load(text)


def test_a_refusal_is_still_a_yaml_error():
    assert issubclass(yaml_safe.Refused, yaml.YAMLError)


def test_ordinary_yaml_loads_like_safe_load():
    text = "target: staging.example.com\nmethods: [GET, POST]\nnested: {a: {b: [1, 2]}}\n"
    assert yaml_safe.load(text) == yaml.safe_load(text)
    assert yaml_safe.load("[" * 99 + "]" * 99) is not None       # under the depth cap
    with pytest.raises(yaml.constructor.ConstructorError):       # still "safe": no objects
        yaml_safe.load("!!python/object/apply:os.system ['true']")


@pytest.mark.parametrize("text", [_MERGE_BOMB, _DEEP])
def test_add_on_refuses_them_with_a_clear_message(tmp_path, text):
    path = tmp_path / "bomb.yaml"
    path.write_text(text)
    started = time.perf_counter()
    with pytest.raises(store.StoreValidationError, match="YAML file can't be added"):
        store.add_source(str(path))
    assert time.perf_counter() - started < 2.0
    assert store.list_sources() == []
