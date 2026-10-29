"""Slash commands: the registry helpers and the built-in command set."""

from .builtin import COMMANDS
from .registry import Command, find, match, parse

__all__ = ["COMMANDS", "Command", "find", "match", "parse"]
