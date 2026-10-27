/* The providers the model picker knows by name, in the order it lists them: the cloud ones,
   then the local ones, then Custom. Each has its OpenAI-compatible base URL (Custom leaves it
   to you), whether it takes an API key, and its kind: "cloud" (a fixed address off this
   machine: questions and the data they need are sent there), "local" (a loopback
   address you may change) or "custom" (any OpenAI-compatible address). A cloud preset is tied to
   its address: a provider saved under it must be at its base URL's origin (`fitsPreset`; the
   server refuses anything else, and the picker shows an older one that isn't as Custom). Any
   other preset is only a starting point: the saved provider keeps whatever address was saved,
   checked by the same rules as any other model (config.ts). Pure: browser and server (GET
   /api/assistant/models sends them too). */

export const PRESETS = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", key: "required", kind: "cloud" },
  { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", key: "required", kind: "cloud" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", key: "required", kind: "cloud" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", key: "required", kind: "cloud" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", key: "required", kind: "cloud" },
  { id: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", key: "none", kind: "local" },
  { id: "lmstudio", label: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1", key: "none", kind: "local" },
  { id: "custom", label: "Custom", baseUrl: "", key: "optional", kind: "custom" },
] as const;

export type Preset = (typeof PRESETS)[number];
export type PresetId = Preset["id"];
export type PresetKind = Preset["kind"];

export const PRESET_IDS = PRESETS.map((p) => p.id) as [PresetId, ...PresetId[]];

/** The preset `id` names (Custom for anything else). */
export const presetOf = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];

/** What the server says when a cloud preset is sent with another address. */
export const CLOUD_FIXED = "A cloud provider's address is fixed; use Custom for another address.";

const originOf = (url: string): string | null => {
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
};

/** Whether a provider at `baseUrl` may carry `preset`'s name: a cloud preset only at its own
    base URL's origin (scheme, host and port), any other preset at any address. */
export function fitsPreset(preset: Preset, baseUrl: string): boolean {
  if (preset.kind !== "cloud") return true;
  const origin = originOf(baseUrl);
  return origin !== null && origin === originOf(preset.baseUrl);
}
