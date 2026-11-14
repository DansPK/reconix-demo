/* One answer as the NDJSON stream the page reads (protocol.ts), server only: `meta` (with the
   names of the /add-on files whose passages were matched), the cards, then a short reply text,
   then `done`. Static demo: no model is called. The cards are the facts the server built from
   the saved files (cards.ts); the text here is a canned narrative written around them (counts,
   the worst finding, the run's state), never invented data. When it ends the reply is saved
   after its question with the cards that were shown (history-store.ts). The rate slot is handed
   back at the end. Nothing here logs the question or the answer. */
import "server-only";

import type { Conversation, UserMessage } from "./history-schema";
import { markStreaming, saveReply } from "./history-store";
import { type Card, encodeFrame, type Frame } from "./protocol";

export interface ReplyInput {
  conversation: Conversation;
  asked: UserMessage;
  cards: Card[];
  knowledge?: string[]; // the /add-on files whose passages matched (their names)
  signal: AbortSignal; // the request's: aborted when the page stops or leaves
  release: () => void; // the rate slot
}

const sev = (c: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number }): string =>
  (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).filter((k) => c[k] > 0).map((k) => `${c[k]} ${k.toLowerCase()}`).join(", ");

/** A canned narrative built from the cards the server picked. Plain facts, no model. */
function narrate(cards: Card[], scopeLabel: string): string {
  const parts: string[] = [];
  for (const card of cards) {
    if (card.kind === "notice") parts.push(card.body);
    else if (card.kind === "findings") {
      const worst = card.items[0];
      parts.push(
        card.total === 0
          ? `No findings are recorded for ${scopeLabel}.`
          : `${scopeLabel} has ${card.total} ${card.total === 1 ? "finding" : "findings"}${sev(card.counts) ? ` (${sev(card.counts)})` : ""}.` +
              (worst ? ` The most severe is “${worst.title}” (${worst.severity.toLowerCase()}) on ${worst.target}.` : ""),
      );
    } else if (card.kind === "finding") {
      const i = card.item;
      parts.push(`“${i.title}” is a ${i.severity.toLowerCase()} issue${card.cwe ? ` (${card.cwe})` : ""} on ${i.target}${card.tool ? `, flagged by ${card.tool}` : ""}. ${card.impact}`.trim());
    } else if (card.kind === "progress") {
      const r = card.runs[0];
      if (r) parts.push(`${r.run.label} is ${String(r.status).toLowerCase()} (${Math.round(r.progress)}%).`);
    } else if (card.kind === "approvals") {
      parts.push(`There ${card.pending === 1 ? "is" : "are"} ${card.pending} approval${card.pending === 1 ? "" : "s"} still pending.`);
    } else if (card.kind === "policy") {
      parts.push(`The approved scope blocked ${card.blocked} of ${card.checks} checked requests.`);
    } else if (card.kind === "report") {
      parts.push(`The report for ${card.runs[0]?.run.label ?? scopeLabel} is ready to download below.`);
    }
  }
  const body = parts.filter(Boolean).join(" ");
  return body || `Here is what the saved data shows for ${scopeLabel}. See the cards below for the details.`;
}

// Pace the text frames so the answer types out instead of landing all at once. Tests and e2e
// set RECONIX_ASSISTANT_STREAM_MS=0 to make it instant; the demo narrative is short plain prose.
const STREAM_MS = (() => {
  const n = Number(process.env.RECONIX_ASSISTANT_STREAM_MS ?? 24);
  return Number.isFinite(n) ? Math.max(0, n) : 24;
})();

/** A delay a Stop can cut short (resolves on abort so the loop's signal check ends it). */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const onAbort = () => {
      clearTimeout(id);
      resolve();
    };
    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Word-sized pieces so the page types the answer out as it "arrives". Whitespace-delimited
    pieces keep single-word **bold** / `code` tokens whole; the demo narrative is plain prose. */
function chunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

export function replyStream({ conversation, asked, cards, knowledge = [], signal, release }: ReplyInput): ReadableStream<Uint8Array> {
  const used = knowledge.length ? { knowledge } : {};
  const encoder = new TextEncoder();
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

    const text = narrate(cards, conversation.scope.label || "this assessment");
    let reply = "";
    for (const piece of chunks(text)) {
      if (signal.aborted) break;
      reply += piece;
      send({ t: "text", delta: piece });
      await sleep(STREAM_MS, signal);
    }
    const state = signal.aborted ? "stopped" : "done";
    try {
      const kept = await saveReply(conversation.id, { replyTo: asked.id, content: reply, cards, state, ...used });
      if (!kept) send({ t: "error", detail: "The reply was not saved: the conversation was deleted meanwhile." });
    } catch {
      send({ t: "error", detail: "The reply could not be saved." });
    }
    done();
    send({ t: "done" });
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
    },
  });
}
