/* A reply whose text ended empty. The server marks it as an error with the words in
   lib/assistant/reply.ts ("The model sent an empty answer.", the `!reply.trim()` branch of
   replyStream), and the page shows that as its own state with Retry instead of a failure: the
   model answered, it just wrote nothing. With cards it is "no explanation": the cards are the
   saved data, the model added no words about them. A reply that failed for another reason (the
   model unreachable, HTTP 500, the connection) keeps its detail. tests/assistant-empty.test.ts
   drives the real replyStream, so a reword of the server's message fails there. */
import type { ChatMessage } from "./types";

/** How reply.ts words an answer that held nothing. */
export const EMPTY_ANSWER = /\bempty answer\b/i;

export const EMPTY_REPLY = {
  title: "The model returned nothing",
  body: "The model answered, but with no text. Try asking again, or put the question another way.",
} as const;
export const NO_EXPLANATION = {
  title: "The model added no explanation",
  body: "The cards above are the saved data; the model wrote nothing about them. Try asking again for an explanation.",
} as const;

export function isEmptyReply(m: Pick<ChatMessage, "role" | "state" | "content" | "detail">): boolean {
  return m.role === "assistant" && m.state === "error" && m.content.trim() === "" && EMPTY_ANSWER.test(m.detail ?? "");
}
