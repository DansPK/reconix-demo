"""Flexible LLM: the static provider catalog.

The dropdown's providers: Reconix (the server's own model from LLM_*, key entered in the UI),
the named cloud providers OpenAI / Anthropic / DeepSeek (fixed base URL, the user supplies key +
model), Ollama and a generic OpenAI-compatible provider (the user supplies base URL + model, and
for the compatible one a key too). Each is its own entry with its own key, base URL and model.
There are no database rows for providers that are not configured; this catalog is the fixed source
of labels, kinds and the rules the store enforces. Reconix is listed first and is the default.
"""

from dataclasses import dataclass

# Key / base-URL requirements.
REQUIRED = "required"
OPTIONAL = "optional"
NONE = "none"

# How the base URL behaves per provider.
BASE_READONLY = "readonly"   # comes from env, operator cannot change (reconix default)
BASE_OPTIONAL = "optional"   # passed only if given
BASE_DEFAULT = "default"     # a sensible default, editable (the custom API formats)
BASE_REQUIRED = "required"   # must be supplied
BASE_FIXED = "fixed"         # a known provider URL from this catalog, not shown or editable (OpenAI/Anthropic/DeepSeek)


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    kind: str                       # reconix | custom
    key_requirement: str            # REQUIRED | OPTIONAL | NONE
    multi_model: bool               # holds several models, or exactly one
    base_mode: str                  # BASE_* above
    litellm_prefix: str             # "" (reconix: LLM_MODEL is a full string) | openai | anthropic
    default_base_url: str = ""
    default_models: tuple = ()      # known models, so only a key is needed
    aliases: tuple = ()             # other names chat commands accept ("use anthropic …")

    @property
    def needs_key(self):
        return self.key_requirement == REQUIRED

    @property
    def key_optional(self):
        return self.key_requirement == OPTIONAL

    @property
    def uses_api_base(self):
        """Whether a base URL is always sent to LiteLLM for this provider."""
        return self.base_mode in (BASE_READONLY, BASE_DEFAULT, BASE_REQUIRED, BASE_FIXED)

    def model_string(self, model):
        """The LiteLLM model identifier, e.g. ``anthropic/claude-…`` or ``openai/gpt-4o``.
        An empty prefix (the default provider) means the model is already a full LiteLLM string
        (the operator wrote LLM_MODEL with its own prefix), so it is used verbatim."""
        return f"{self.litellm_prefix}/{model}" if self.litellm_prefix else model


# Order matters: this is the order the UI dropdown lists them in. Reconix is first and the default.
# Named providers (OpenAI/Anthropic/DeepSeek) have a fixed, hidden base URL: the user supplies only
# key + model. Ollama and the generic OpenAI-compatible provider take a base URL the user controls.
# LiteLLM adds the path itself (/chat/completions, /v1/messages), so the base URL is the server root.
_CATALOG = (
    Provider("reconix", "Reconix", "reconix", REQUIRED, False,
             BASE_READONLY, "", aliases=("default",)),  # env base+model, key in the UI; LLM_MODEL is a full LiteLLM string
    Provider("openai", "OpenAI", "custom", REQUIRED, False, BASE_FIXED,
             "openai", default_base_url="https://api.openai.com/v1",
             default_models=("gpt-4o-mini",), aliases=("gpt",)),
    Provider("anthropic", "Anthropic", "custom", REQUIRED, False, BASE_FIXED,
             "anthropic", default_base_url="https://api.anthropic.com",
             default_models=("claude-3-5-sonnet-latest",), aliases=("claude",)),
    Provider("deepseek", "DeepSeek", "custom", REQUIRED, False, BASE_FIXED,
             "openai", default_base_url="https://api.deepseek.com/v1",  # OpenAI-compatible endpoint
             default_models=("deepseek-chat",), aliases=("deep-seek",)),
    Provider("ollama", "Ollama", "custom", OPTIONAL, False, BASE_REQUIRED,
             "openai", default_base_url="http://host.docker.internal:11434/v1"),  # Ollama's OpenAI-compatible /v1
    Provider("openai_compatible", "OpenAI-compatible API", "custom", REQUIRED, False, BASE_REQUIRED,
             "openai", default_base_url="https://api.openai.com/v1",
             aliases=("openai-compatible", "compatible", "custom")),
)

_BY_ID = {p.id: p for p in _CATALOG}
_BY_NAME = {**{a: p for p in _CATALOG for a in p.aliases}, **_BY_ID}


def all_providers():
    return _CATALOG


def get(provider_id):
    return _BY_ID.get(provider_id)


def resolve(name):
    """A provider by id or alias ("openai" -> the OpenAI-compatible entry), or None."""
    return _BY_NAME.get((name or "").strip().lower())


def reconix_base_url(cfg):
    return (cfg.llm_base_url or "").rstrip("/")


def reconix_model(cfg):
    return cfg.llm_model or ""

