/* Asking the configured model (server only): one streaming chat completion on an
   OpenAI-compatible endpoint, turned into a stream of plain reply text. Nothing here logs the
   question or the answer. */
import "server-only";

import type { ModelConfig } from "./config";
import { createEventParser, createThinkFilter } from "./stream";

const TIMEOUT_MS = 120_000;
const MAX_TOKENS = 1_200;

export class ModelError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type Turn = { role: "system" | "user" | "assistant"; content: string };

/** The reply as a text stream. `onEnd` runs once when it ends, fails or is cancelled. */
export async function streamReply(config: ModelConfig, turns: Turn[], signal: AbortSignal, onEnd: () => void = () => {}): Promise<ReadableStream<Uint8Array>> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: config.model, messages: turns, stream: true, temperature: 0.2, max_tokens: MAX_TOKENS }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new ModelError(`Could not reach the AI model at ${config.local ? "its local address" : "its address"}. Is it running?`, 502);
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    const hint =
      response.status === 404
        ? ` Check the model name ("${config.model}") and the base URL in the model picker.`
        : response.status === 401 || response.status === 403
          ? " Check the API key in the model picker."
          : "";
    throw new ModelError(`The AI model answered with HTTP ${response.status}.${hint}`, 502);
  }

  const upstream = response.body.pipeThrough(new TextDecoderStream());
  const encoder = new TextEncoder();
  const think = createThinkFilter();
  let reader: ReadableStreamDefaultReader<string>;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      reader = upstream.getReader();
      let done = false;
      const parser = createEventParser(
        (text) => {
          const shown = think(text);
          if (shown) controller.enqueue(encoder.encode(shown));
        },
        () => {
          done = true;
        },
      );
      const pump = async (): Promise<void> => {
        try {
          for (;;) {
            const { value, done: ended } = await reader.read();
            if (ended || done) break;
            parser.push(value);
          }
          parser.end();
          controller.close();
          await reader.cancel().catch(() => {});
        } catch {
          controller.error(new Error("The AI model stopped answering."));
        } finally {
          onEnd();
        }
      };
      void pump();
    },
    cancel() {
      onEnd();
      return reader?.cancel().catch(() => {});
    },
  });
}
