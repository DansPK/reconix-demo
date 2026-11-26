// The model form's rules (pure, no vscode import): what a Save sends to the backend, and how a
// Test result reads. An API key passes through untouched (trimmed) and is never put in text.
// Also bundled into the webview (the form uses the same lists): no Node imports here.
import type { LlmProviderInput, LlmProviderUpdate, ProviderTest, ProviderType } from "./shared/contract";

export const PROVIDER_LABEL: Record<ProviderType, string> = {
  RECONIX: "Reconix",
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  DEEPSEEK: "DeepSeek",
  OLLAMA: "Ollama",
  OPENAI_API_COMPATIBLE: "OpenAI-compatible",
};

/** The types a user can add (Reconix is the server's built-in one). */
export const ADDABLE_TYPES: ProviderType[] = ["OPENAI", "ANTHROPIC", "DEEPSEEK", "OLLAMA", "OPENAI_API_COMPATIBLE"];

export const MODEL_PLACEHOLDER: Partial<Record<ProviderType, string>> = {
  OPENAI: "gpt-4o", ANTHROPIC: "claude-3-5-sonnet-latest", DEEPSEEK: "deepseek-chat", OLLAMA: "llama3.1:8b", OPENAI_API_COMPATIBLE: "model name",
};

export const PRESET_MODELS: Partial<Record<ProviderType, readonly string[]>> = {
  OPENAI: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  ANTHROPIC: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
  DEEPSEEK: ["deepseek-chat", "deepseek-reasoner"],
  OLLAMA: ["llama3.1:8b", "qwen2.5-coder:7b", "codellama"],
};

/** Which fields a type uses: a base URL for Ollama (optional) and compatible APIs (required), a key for the rest. */
export function providerFields(type: ProviderType): { baseUrl: "none" | "optional" | "required"; apiKey: "none" | "optional" | "required" } {
  return {
    baseUrl: type === "OLLAMA" ? "optional" : type === "OPENAI_API_COMPATIBLE" ? "required" : "none",
    apiKey: type === "OLLAMA" ? "none" : type === "RECONIX" || type === "OPENAI_API_COMPATIBLE" ? "optional" : "required",
  };
}

export type ProviderSave =
  | { kind: "create"; input: LlmProviderInput }
  | { kind: "update"; update: LlmProviderUpdate }
  | { kind: "invalid"; message: string };

/**
 * The form's fields, cleaned: trimmed, empty ones left out, the name defaulting to the model's.
 * Editing (providerId set): an empty key keeps the saved one, and the type can't change.
 */
export function providerSave(providerId: string | undefined, form: LlmProviderInput): ProviderSave {
  const modelName = form.modelName.trim();
  if (!modelName && form.providerType !== "RECONIX") return { kind: "invalid", message: "Enter the model's name, for example gpt-4o or llama3.1:8b." };
  const displayName = form.displayName.trim() || modelName;
  const baseUrl = form.baseUrl?.trim() || undefined;
  const apiKey = form.apiKey?.trim() || undefined;
  if (providerId) {
    if (form.providerType === "RECONIX") {
      return { kind: "update", update: { ...(apiKey ? { apiKey } : {}) } };
    }
    return { kind: "update", update: { displayName, modelName, ...(baseUrl ? { baseUrl } : {}), ...(apiKey ? { apiKey } : {}) } };
  }
  return {
    kind: "create",
    input: { providerType: form.providerType, displayName, modelName, ...(baseUrl ? { baseUrl } : {}), ...(apiKey ? { apiKey } : {}) },
  };
}

/** The form's status line after a Test. */
export function testStatus(result: ProviderTest, afterSave: boolean): { tone: "ok" | "error"; text: string } {
  if (result.ok) return { tone: "ok", text: `Works: ${result.modelName} answered in ${result.latencyMs} ms.` };
  return { tone: "error", text: `${afterSave ? "Saved, but the test failed" : "The test failed"}: ${result.message ?? result.code ?? "no answer"}` };
}
