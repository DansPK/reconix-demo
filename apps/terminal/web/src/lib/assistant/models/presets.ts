/* The providers the model picker offers, as the TUI's /provider lists them
   (apps/tui/reconix/llm/catalog.py) and the Core API keeps them (llm_providers.provider_type):
   Reconix first (the default), then the three cloud services, then Ollama and a custom
   OpenAI-compatible server. What each one asks for follows the TUI's provider form:

   - Reconix: nothing. Its address, model and key come from the Core API's .env (read-only).
   - OpenAI, Anthropic, DeepSeek ("cloud"): just the API key. Their models are built in and
     their address is fixed: questions and the data they need are sent there.
   - Ollama ("local"): an address (a default, editable) and one model; no key.
   - Custom OpenAI-compatible: an address (required), an optional key and one model.

   A cloud preset is tied to its address: a provider saved under it must be at its base URL's
   origin (`fitsPreset`; the picker shows an older one that isn't as Custom). Pure: browser and
   server (GET /api/assistant/models sends them too). */

export const PRESETS = [
  { id: "reconix", label: "Reconix (default)", baseUrl: "", key: "none", kind: "reconix", models: [] },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", key: "required", kind: "cloud", models: ["gpt-4o-mini", "gpt-4o"] },
  { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", key: "required", kind: "cloud", models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"] },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", key: "required", kind: "cloud", models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "ollama", label: "Ollama", baseUrl: "http://localhost:11434", key: "none", kind: "local", models: [] },
  { id: "custom", label: "Custom OpenAI-compatible", baseUrl: "", key: "optional", kind: "custom", models: [] },
] as const satisfies readonly { id: string; label: string; baseUrl: string; key: "required" | "optional" | "none"; kind: "reconix" | "cloud" | "local" | "custom"; models: readonly string[] }[];

export type Preset = (typeof PRESETS)[number];
export type PresetId = Preset["id"];
export type PresetKind = Preset["kind"];

export const PRESET_IDS = PRESETS.map((p) => p.id) as [PresetId, ...PresetId[]];

/** The preset `id` names (Custom for anything else). */
export const presetOf = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];

/** A preset's built-in models (the cloud services'), or none. */
export const builtInModels = (preset: Preset): readonly string[] => preset.models;

/** What the server says when a cloud preset is sent with another address. */
export const CLOUD_FIXED = "A cloud provider's address is fixed; use Custom OpenAI-compatible for another address.";

const originOf = (url: string): string | null => {
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
};

/** Why a provider at `baseUrl` may not carry `preset`'s name (null: it may): a cloud preset
    only at its own base URL's origin (scheme, host and port), any other preset at any address. */
export function presetProblem(preset: Preset, baseUrl: string): string | null {
  if (preset.kind !== "cloud") return null;
  const origin = originOf(baseUrl);
  return origin !== null && origin === originOf(preset.baseUrl) ? null : CLOUD_FIXED;
}

/** Whether a provider at `baseUrl` may carry `preset`'s name (`presetProblem`). */
export const fitsPreset = (preset: Preset, baseUrl: string): boolean => presetProblem(preset, baseUrl) === null;
