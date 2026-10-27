"""Thin wrapper over an LLM chat API, via LiteLLM (provider-agnostic).

Model / endpoint come from ``config.LLMSettings`` — in Reconix these are set from the
active /provider so the model can be switched mid-conversation. The returned message is a
plain dict (role/content/tool_calls) suitable to append to the agent's history and resend,
so switching providers preserves context. Fails soft: callers check ``available`` or catch.
"""

from __future__ import annotations

import litellm

from ..config import LLMSettings

# Keep keys out of logs/telemetry; drop params a given provider doesn't accept
# (e.g. some endpoints reject `temperature` or `tool_choice`) instead of erroring.
litellm.suppress_debug_info = True
litellm.telemetry = False
litellm.drop_params = True


class LLMClient:
    def __init__(self, settings: LLMSettings):
        self._settings = settings
        self._params = settings.litellm_params() if settings.enabled else None

    @property
    def available(self) -> bool:
        return self._params is not None

    async def raw_chat(self, messages: list, tools: list | None = None,
                       temperature: float = 0.2) -> dict:
        """One chat turn for the agent loop. Returns the assistant message as a dict
        (role/content/tool_calls) to append to history and resend to the API."""
        if self._params is None:
            raise RuntimeError("LLM is not configured (set a provider / model).")
        kwargs: dict = {"messages": messages, "temperature": temperature, **self._params}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        resp = await litellm.acompletion(num_retries=1, **kwargs)
        m = resp.choices[0].message
        out: dict = {"role": "assistant", "content": m.content}
        # Reasoning models (DeepSeek-R1, o-series, …) return their chain-of-thought in a
        # separate field. Surface it to the UI; the agent strips it before resending history.
        reasoning = getattr(m, "reasoning_content", None)
        if reasoning:
            out["reasoning_content"] = reasoning
        if getattr(m, "tool_calls", None):
            out["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in m.tool_calls
            ]
        return out

    async def complete(self, system: str, user: str, temperature: float = 0.2) -> str:
        if self._params is None:
            raise RuntimeError("LLM is not configured (set a provider / model).")
        resp = await litellm.acompletion(
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
            temperature=temperature, num_retries=1, **self._params,
        )
        return (resp.choices[0].message.content or "").strip()
