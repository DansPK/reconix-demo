"""Reading untrusted YAML: `yaml.safe_load` without the constructs that can blow up.

`safe_load` already refuses Python objects, but an anchor (`&a`) named again by aliases
(`*a`), or by merge keys (`<<: [*a, *a]`), lets a few kilobytes expand to gigabytes as each
level doubles the one below ("billion laughs"). A deeply nested document (`[[[[…]]]]`) walks
the recursive composer into a `RecursionError`. `load()` refuses all of these as soon as the
parser meets them, with a `Refused` (a `yaml.YAMLError`, so a caller's existing
`except yaml.YAMLError` still covers it) whose message is fit to show an operator.
"""

from typing import Any

import yaml

MAX_DEPTH = 100                     # nested collections; real documents stay far below this
MERGE_TAG = "tag:yaml.org,2002:merge"


class Refused(yaml.YAMLError):
    """The document uses something this reader never expands; the message says what."""


class SafeLoader(yaml.SafeLoader):
    """`yaml.SafeLoader` that refuses anchors, aliases, merge keys and deep nesting."""

    def __init__(self, stream: Any) -> None:
        super().__init__(stream)
        self._depth = 0

    def compose_node(self, parent, index):
        if self.check_event(yaml.AliasEvent):
            raise Refused("YAML aliases (*name) aren't supported.")
        event = self.peek_event()
        if getattr(event, "anchor", None) is not None:
            raise Refused("YAML anchors (&name) aren't supported.")
        self._depth += 1
        try:
            if self._depth > MAX_DEPTH:
                raise Refused(f"That YAML is nested more than {MAX_DEPTH} levels deep.")
            return super().compose_node(parent, index)
        finally:
            self._depth -= 1

    def flatten_mapping(self, node):
        for key_node, _ in node.value:
            if key_node.tag == MERGE_TAG:
                raise Refused("YAML merge keys (<<) aren't supported.")
        return super().flatten_mapping(node)


def load(text: str) -> Any:
    """The single document in `text`, built like `yaml.safe_load` but refusing the expanding
    and deeply nested constructs above. Raises `Refused` or another `yaml.YAMLError`."""
    loader = SafeLoader(text)
    try:
        return loader.get_single_data()
    finally:
        loader.dispose()
