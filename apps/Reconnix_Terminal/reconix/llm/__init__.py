"""Flexible LLM: provider catalog, encrypted store, LiteLLM client and guardrails.

No UI imports and no `store.lists` imports live here. The store package (``providers.py``,
``llm_chat.py``) is the only seam the TUI calls; this package holds the low-level parts.
"""

from .client import LLMError

__all__ = ["LLMError"]
