/* The earlier turns of a saved conversation that go to the model with a new question: answered
   questions and their replies (a reply that failed, and its question, are left out), newest
   kept first within MAX_MESSAGES turns and MAX_HISTORY characters. Read from the server's own
   file, never from the browser. Pure. */
import type { StoredMessage } from "./history-schema";
import { MAX_HISTORY, MAX_MESSAGES, MAX_QUESTION, MAX_REPLY } from "./request";

export type HistoryTurn = { role: "user" | "assistant"; content: string };

/** The turns before message `beforeId` (all of them when it isn't found). */
export function earlierTurns(messages: StoredMessage[], beforeId: string): HistoryTurn[] {
  const at = messages.findIndex((m) => m.id === beforeId);
  const earlier = at < 0 ? messages : messages.slice(0, at);
  const replies = new Map<string, string>();
  for (const m of earlier) if (m.role === "assistant" && m.state !== "error" && m.content.trim()) replies.set(m.replyTo, m.content.trim());
  const pairs: [HistoryTurn, HistoryTurn][] = [];
  for (const m of earlier) {
    const reply = m.role === "user" ? replies.get(m.id) : undefined;
    if (m.role === "user" && reply) {
      pairs.push([
        { role: "user", content: m.content.slice(0, MAX_QUESTION) },
        { role: "assistant", content: reply.slice(0, MAX_REPLY) },
      ]);
    }
  }
  const kept: HistoryTurn[] = [];
  let size = 0;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const [q, r] = pairs[i];
    if (kept.length + 2 > MAX_MESSAGES - 1 || size + q.content.length + r.content.length > MAX_HISTORY) break;
    size += q.content.length + r.content.length;
    kept.unshift(q, r);
  }
  return kept;
}
