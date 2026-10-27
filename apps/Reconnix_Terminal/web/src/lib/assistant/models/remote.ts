/* The model picker's two questions to a model's address (server only): the test sends a tiny
   chat completion, the fetch reads GET {base}/models. Both refuse redirects, give up
   after ten seconds, never cache, read at most 1 MB, and answer in fixed words: never the
   address, the key or what the server said (only its HTTP status). A fetch that fails says
   whether the model's server answered without a list it could read (`unlisted`: no such route,
   an error status other than a refused key or a limit, not JSON, another shape), which the
   picker may get round by testing a model; never reached, a redirect, a refused key (401, 402,
   403), a limit (429) or a list too large is a plain failure. The address was checked first
   (resolve.ts `probeTarget`). */
import "server-only";

import { z } from "zod";

import type { ModelConfig } from "../config";
import { MODEL_NAME } from "./schema";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;
export const MAX_FETCHED = 200; // model names a fetch returns, at most

export type ProbeOutcome = { ok: true; detail: string } | { ok: false; detail: string };

function headersFor(config: ModelConfig, accept: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

/** Why a request never got an answer, in fixed words. */
function unreachable(error: unknown): string {
  const name = (error as Error | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") return `The address did not answer within ${TIMEOUT_MS / 1000} seconds.`;
  const cause = String((error as { cause?: { message?: unknown } } | null)?.cause?.message ?? "");
  if (/redirect/i.test(cause)) return "The address answered with a redirect, which is not followed. Use the final address.";
  return "Could not reach the address. Is the model's server running?";
}

/** What an HTTP error status means here. */
function refusedWith(status: number): string {
  if (status === 401 || status === 403) return `The model's server answered HTTP ${status}: check the API key.`;
  if (status === 404) return "The model's server answered HTTP 404: check the model name and the base URL.";
  if (status === 429) return "The model's server answered HTTP 429: too many requests, or no credit left.";
  return `The model's server answered HTTP ${status}.`;
}

async function call(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** The body as text, or null past MAX_BYTES. */
async function boundedText(response: Response): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** One short, non-streamed chat completion: does the model answer at all? */
export async function testConnection(config: ModelConfig): Promise<ProbeOutcome> {
  let response: Response;
  try {
    response = await call(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { ...headersFor(config, "application/json"), "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: "Reply with the word OK." }], max_tokens: 8, stream: false }),
    });
  } catch (error) {
    return { ok: false, detail: unreachable(error) };
  }
  await response.body?.cancel().catch(() => {}); // only the status matters
  return response.ok ? { ok: true, detail: `Connected: ${config.model} answered.` } : { ok: false, detail: refusedWith(response.status) };
}

const ListSchema = z.object({ data: z.array(z.object({ id: z.unknown() }).passthrough()) }).passthrough();

/** A fetch that got no names: `unlisted`, the model's server answered, but without a list. */
export type FetchOutcome = { ok: true; models: string[] } | { ok: false; detail: string; unlisted: boolean };

/** Statuses that say the request may not have an answer (the key, the credit, a limit): plain
    failures, never "no list". */
const REFUSED = new Set([401, 402, 403, 429]);

const failed = (detail: string): FetchOutcome => ({ ok: false, detail, unlisted: false });
const unlisted = (detail: string): FetchOutcome => ({ ok: false, detail, unlisted: true });

/** The model names the server lists (GET {base}/models), those a model name may be, sorted. */
export async function fetchModels(config: ModelConfig): Promise<FetchOutcome> {
  let response: Response;
  try {
    response = await call(`${config.baseUrl}/models`, { method: "GET", headers: headersFor(config, "application/json") });
  } catch (error) {
    return failed(unreachable(error));
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const detail = refusedWith(response.status);
    return REFUSED.has(response.status) ? failed(detail) : unlisted(detail);
  }
  let text: string | null;
  try {
    text = await boundedText(response);
  } catch {
    return failed("The model list broke off.");
  }
  if (text === null) return failed("The model list is too large.");
  let parsed;
  try {
    parsed = ListSchema.safeParse(JSON.parse(text));
  } catch {
    parsed = null;
  }
  if (!parsed?.success) return unlisted("The address did not answer with a model list ({ data: [{ id }] }).");
  const names = parsed.data.data.map((m) => m.id).filter((id): id is string => typeof id === "string" && MODEL_NAME.test(id));
  return { ok: true, models: [...new Set(names)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_FETCHED) };
}
