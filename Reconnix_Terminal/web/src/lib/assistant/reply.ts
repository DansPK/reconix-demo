/* One answer as the NDJSON stream the page reads (protocol.ts), server only: `meta` (with the
   names of the /add-on files the model was given, kept with the reply too), the cards,
   the model's text as it arrives, an `error` if the model fails, then `done`. When it ends the
   reply is saved after its question with the cards that were shown (history-store.ts): "done",
   "error" with what went wrong, or "stopped" with the part that arrived when the operator
   pressed Stop (the request is aborted, which cancels this stream and the model's). While it
   runs the question is marked as being answered (a Retry of it is refused). The rate slot is
   handed back at the very end. Nothing here logs the question or the answer. */
import "server-only";

import type { ModelConfig } from "./config";
import type { Conversation, ReplyState, UserMessage } from "./history-schema";
import { markStreaming, saveReply } from "./history-store";
import { ModelError, streamReply, type Turn } from "./llm";
import { type Card, encodeFrame, type Frame } from "./protocol";

export interface ReplyInput {
  config: ModelConfig;
  turns: Turn[];
  conversation: Conversation;
  asked: UserMessage;
  cards: Card[];
  knowledge?: string[]; // the /add-on files whose passages went to the model (their names)
  signal: AbortSignal; // the request's: aborted when the page stops or leaves
  release: () => void; // the rate slot
}

export function replyStream({ config, turns, conversation, asked, cards, knowledge = [], signal, release }: ReplyInput): ReadableStream<Uint8Array> {
  const used = knowledge.length ? { knowledge } : {};
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) abort.abort();
  let open = true;
  const done = markStreaming(asked.id);

  const run = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    const send = (frame: Frame) => {
      if (!open) return;
      try {
        controller.enqueue(encoder.encode(encodeFrame(frame)));
      } catch {
        open = false; // the page went away
      }
    };
    send({ t: "meta", conversationId: conversation.id, title: conversation.title, scope: conversation.scope, ...used });
    for (const card of cards) send({ t: "card", card });

    let reply = "";
    let state: ReplyState = "done";
    let detail: string | undefined;
    try {
      const body = await streamReply(config, turns, abort.signal);
      const reader = body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) {
          reply += text;
          send({ t: "text", delta: text });
        }
      }
      if (abort.signal.aborted) state = "stopped";
      else if (!reply.trim()) {
        state = "error";
        detail = "The model sent an empty answer.";
      }
    } catch (error) {
      if (abort.signal.aborted) state = "stopped";
      else {
        state = "error";
        detail = error instanceof ModelError ? error.message : "The AI model stopped answering.";
      }
    }
    if (detail) send({ t: "error", detail });
    try {
      const kept = await saveReply(conversation.id, { replyTo: asked.id, content: reply, cards, state, ...(detail ? { detail } : {}), ...used });
      if (!kept) send({ t: "error", detail: "The reply was not saved: the conversation was deleted meanwhile." });
    } catch {
      send({ t: "error", detail: "The reply could not be saved." });
    }
    done();
    send({ t: "done" });
    signal.removeEventListener("abort", onAbort);
    release();
    if (open) {
      open = false;
      try {
        controller.close();
      } catch {
        // already cancelled
      }
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      void run(controller);
    },
    cancel() {
      open = false;
      abort.abort();
    },
  });
}
