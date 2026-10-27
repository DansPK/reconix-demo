"""Slash-command registry: matching, lookup, parsing — and the classic command set."""

from reconix.commands import COMMANDS, find, match, parse


def names(commands):
    return [command.name for command in commands]


def test_registry_is_immutable_and_unique():
    assert isinstance(COMMANDS, tuple)
    every = [n for c in COMMANDS for n in (c.name,) + c.aliases]
    assert len(every) == len(set(every))
    assert all(c.description for c in COMMANDS)


def test_empty_query_lists_every_command_in_order():
    assert match(COMMANDS, "") == list(COMMANDS)


def test_prefix_matches_come_before_substring_matches():
    assert names(match(COMMANDS, "fi")) == ["findings", "finding"]
    assert names(match(COMMANDS, "/RE")) == ["report"]


def test_name_matches_rank_above_alias_matches():
    # names starting with "s" first, then "new" (alias "start"), then names containing "s"
    ranked = names(match(COMMANDS, "s"))
    assert ranked[:3] == ["status", "summary", "new"]
    assert "findings" in ranked


def test_aliases_match_and_resolve():
    assert find(COMMANDS, "activity").name == "audit"
    assert find(COMMANDS, "log").name == "audit"
    assert find(COMMANDS, "exit").name == "quit"
    assert find(COMMANDS, "/Start").name == "new"
    assert find(COMMANDS, "dashboard").name == "web"
    assert find(COMMANDS, "execution").name == "status"
    assert find(COMMANDS, "nope") is None


def test_parse_splits_name_and_argument():
    assert parse("/finding 001") == ("finding", "001")
    assert parse("/Template") == ("template", None)
    assert parse("  /finding   002 ") == ("finding", "002")


def test_commands_with_argument_choices():
    assert [c.name for c in COMMANDS if c.takes_argument] == ["template", "finding", "export"]
    # /template suggests templates but never asks: without one it opens the Template screen.
    assert find(COMMANDS, "template").ask is False


def test_scope_is_now_template_and_web_is_added():
    assert find(COMMANDS, "scope") is None
    assert find(COMMANDS, "templates").name == "template"
    assert find(COMMANDS, "web").description.startswith("Open the web dashboard")


def test_an_exact_name_or_alias_ranks_first():
    names = [c.name for c in match(COMMANDS, "/finding")]
    assert names[:2] == ["finding", "findings"]
    assert match(COMMANDS, "log")[0].name == "audit"          # "log" is /audit's alias
