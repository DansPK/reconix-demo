// The models in the model menu. The demo has no LLM: they live in this window's memory, a test always
// answers, and nothing here opens a connection. Of an API key only the last 4 characters are kept.
import type { LlmProvider, LlmProviderInput, LlmProviderUpdate, ProviderActivation, ProviderTest, ProviderType } from "../shared/contract";

type StoredProvider = Omit<LlmProvider, "isLocal">;

const SEED: StoredProvider[] = [
  { id: "llm-reconix", providerType: "RECONIX", displayName: "Reconix default", modelName: "reconix:latest", isActive: true },
  { id: "llm-openai", providerType: "OPENAI", displayName: "GPT-4o", modelName: "gpt-4o", apiKeyLast4: "9f3c", isActive: false },
  { id: "llm-ollama", providerType: "OLLAMA", displayName: "Qwen2.5 Coder", modelName: "qwen2.5-coder:7b", isActive: false },
];
const OLLAMA_MODELS = ["qwen2.5-coder:7b", "llama3.1:8b", "codellama"];
const CLOUD = new Set<ProviderType>(["OPENAI", "ANTHROPIC", "DEEPSEEK"]);
const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

/** True for an address on this computer. */
export function isLoopback(url: string): boolean {
  try {
    return LOOPBACK_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Cloud services never are local; others are when their address is this computer. */
function out(p: StoredProvider): LlmProvider {
  const isLocal = !CLOUD.has(p.providerType) && (p.providerType === "RECONIX" || (p.providerType === "OLLAMA" && !p.baseUrl) || isLoopback(p.baseUrl ?? ""));
  return { ...p, isLocal };
}

function check(p: Pick<StoredProvider, "providerType" | "baseUrl" | "apiKeyLast4">): void {
  if (CLOUD.has(p.providerType) && !p.apiKeyLast4) throw new Error(`${p.providerType} needs an API key.`);
  if (p.providerType === "OPENAI_API_COMPATIBLE" && !p.baseUrl) throw new Error("An OpenAI-compatible provider needs a base URL.");
}

function last4(apiKey: string | null | undefined): string | undefined {
  return apiKey?.trim() ? apiKey.trim().slice(-4) : undefined;
}

export class LocalProviders {
  private providers = SEED.map((p) => ({ ...p }));
  private nextId = 1;
  /** Approval id → provider id, for models that are not local. */
  private readonly approvals = new Map<string, string>();

  list(): LlmProvider[] {
    return this.providers.map(out);
  }

  create(input: LlmProviderInput): LlmProvider {
    const provider: StoredProvider = {
      id: `llm-${this.nextId++}`, providerType: input.providerType, displayName: input.displayName.trim(), modelName: input.modelName,
      baseUrl: input.baseUrl || undefined, apiKeyLast4: last4(input.apiKey), isActive: false,
    };
    check(provider);
    this.providers.push(provider);
    return out(provider);
  }

  update(id: string, update: LlmProviderUpdate): LlmProvider {
    const provider = this.changeable(id, "changed");
    const { apiKey, ...fields } = update;
    if (provider.providerType === "RECONIX" && Object.keys(fields).length > 0) {
      throw new Error("The built-in Reconix provider cannot be changed.");
    }
    const next: StoredProvider = {
      ...provider,
      ...(fields.displayName !== undefined ? { displayName: fields.displayName.trim() } : {}),
      ...(fields.modelName !== undefined ? { modelName: fields.modelName } : {}),
      ...(fields.baseUrl !== undefined ? { baseUrl: fields.baseUrl || undefined } : {}),
      ...(apiKey !== undefined ? { apiKeyLast4: last4(apiKey) } : {}),
    };
    check(next);
    Object.assign(provider, next);
    return out(provider);
  }

  delete(id: string): void {
    this.changeable(id, "deleted");
    this.providers = this.providers.filter((p) => p.id !== id);
  }

  models(id: string): string[] {
    if (this.find(id).providerType !== "OLLAMA") throw new Error("Only an Ollama provider can list its models.");
    return [...OLLAMA_MODELS];
  }

  test(id: string): ProviderTest {
    return { ok: true, modelName: this.find(id).modelName, latencyMs: 120 };
  }

  activate(id: string): ProviderActivation {
    const provider = out(this.find(id));
    if (provider.isLocal) {
      this.setActive(id);
      return { provider: out(this.find(id)) };
    }
    const approvalId = `approval-${this.nextId++}`;
    this.approvals.set(approvalId, id);
    return { provider, approvalId };
  }

  approve(approvalId: string): void {
    const id = this.approvals.get(approvalId);
    if (id === undefined) throw new Error("No approval request has this id.");
    this.approvals.delete(approvalId);
    this.setActive(id);
  }

  private find(id: string): StoredProvider {
    const provider = this.providers.find((p) => p.id === id);
    if (!provider) throw new Error(`No LLM provider has the id ${id}.`);
    return provider;
  }

  /** Never the built-in provider (its key may change) or the active one. */
  private changeable(id: string, verb: string): StoredProvider {
    const provider = this.find(id);
    if (provider.providerType === "RECONIX") {
      if (verb === "deleted") throw new Error("The built-in Reconix provider cannot be deleted.");
    } else if (provider.isActive) {
      throw new Error(`The active provider cannot be ${verb}. Switch to another model first.`);
    }
    return provider;
  }

  private setActive(id: string): void {
    this.find(id); // throws if it was deleted meanwhile
    for (const p of this.providers) p.isActive = p.id === id;
  }
}
