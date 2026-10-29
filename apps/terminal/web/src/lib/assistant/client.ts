/* The page's side of the AI Assistant's routes (browser only): ask a question and read the
   NDJSON answer frame by frame, list, read, rename and delete saved conversations, and turn a
   saved conversation into the messages the page shows. Every answer is checked against the
   shared schemas before the page uses it. (Static demo: there is no model picker.) */
import { z } from "zod";

import { type Conversation, ConversationSchema, type ConversationSummary, ConversationSummarySchema } from "./history-schema";
import { ASSISTANT_ROUTE, conversationRoute, CONVERSATIONS_ROUTE } from "./paths";
import { type Card, createFrameReader, type Frame, isConversationId } from "./protocol";

/** A message of the open conversation, as the page holds it. */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: Card[]; // verified cards shown with a reply (built by the server from the saved data)
  knowledge?: string[]; // the /add-on files whose passages the model was given (their names)
  state?: "streaming" | "error" | "stopped"; // none: answered
  detail?: string; // what went wrong (state "error")
  question?: string; // the question a failed reply answers (for Retry)
};

/** A saved conversation as the page shows it. */
export function toMessages(c: Conversation): ChatMessage[] {
  const questions = new Map(c.messages.filter((m) => m.role === "user").map((m) => [m.id, m.content]));
  return c.messages.map((m) =>
    m.role === "user"
      ? { id: m.id, role: "user", content: m.content }
      : {
          id: m.id,
          role: "assistant",
          content: m.content,
          cards: m.cards,
          knowledge: m.knowledge,
          state: m.state === "done" ? undefined : m.state,
          detail: m.detail,
          question: questions.get(m.replyTo),
        },
  );
}

export type Failure = { ok: false; status: number; detail: string };

const FALLBACK: Record<number, string> = {
  401: "Your session ended. Open the dashboard again with the sign-in link /web prints.",
  403: "The dashboard refused that request. Reload the page and try again.",
  404: "That is not saved any more.",
  413: "That is too long to send.",
  429: "Too many questions at once. Wait a moment and ask again.",
  503: "The assistant is not available right now.",
};

async function failure(response: Response): Promise<Failure> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  const detail = typeof body?.detail === "string" && body.detail.length <= 400 ? body.detail : (FALLBACK[response.status] ?? `The assistant could not answer (HTTP ${response.status}).`);
  return { ok: false, status: response.status, detail };
}

const offline = (): Failure => ({ ok: false, status: 0, detail: "The dashboard could not be reached. Is it still running?" });

const json = { "Content-Type": "application/json" };

// --- asking --------------------------------------------------------------------------------

export interface AskBody {
  conversationId?: string;
  uid: string | null;
  question: string;
  retry?: boolean;
}

/** Asks and calls `onFrame` for each frame as it arrives. `onStart` gets the conversation's id
    from the response header, before any frame (a Stop right away still knows it). Resolves when
    the answer ends (`complete`: its "done" frame came); rejects when `signal` aborts it (Stop)
    or the connection breaks. */
export async function askQuestion(
  body: AskBody,
  signal: AbortSignal,
  onFrame: (frame: Frame) => void,
  onStart?: (conversationId: string) => void,
): Promise<{ ok: true; complete: boolean } | Failure> {
  const response = await fetch(ASSISTANT_ROUTE, { method: "POST", headers: json, body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) return failure(response);
  const id = response.headers.get("x-conversation-id");
  if (isConversationId(id)) onStart?.(id);
  let complete = false;
  const frames = createFrameReader((frame) => {
    if (frame.t === "done") complete = true;
    onFrame(frame);
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    frames.push(decoder.decode(value, { stream: true }));
  }
  frames.push(decoder.decode());
  frames.end();
  return { ok: true, complete };
}

// --- saved conversations -------------------------------------------------------------------

const ListSchema = z.object({ conversations: z.array(ConversationSummarySchema), retentionDays: z.number().min(0) });
const OneSchema = z.object({ conversation: ConversationSchema });

async function call<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<{ ok: true; value: T } | Failure> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return offline();
  }
  if (!response.ok) return failure(response);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, status: 500, detail: "The dashboard sent an answer the page doesn't understand." };
}

export async function listConversations(signal?: AbortSignal): Promise<{ ok: true; conversations: ConversationSummary[] } | Failure> {
  const result = await call(CONVERSATIONS_ROUTE, { signal }, ListSchema);
  return result.ok ? { ok: true, conversations: result.value.conversations } : result;
}

export async function readConversation(id: string, signal?: AbortSignal): Promise<{ ok: true; conversation: Conversation } | Failure> {
  const result = await call(conversationRoute(id), { signal }, OneSchema);
  return result.ok ? { ok: true, conversation: result.value.conversation } : result;
}

export async function renameConversation(id: string, title: string): Promise<{ ok: true; title: string } | Failure> {
  const result = await call(conversationRoute(id), { method: "PATCH", headers: json, body: JSON.stringify({ title }) }, z.object({ title: z.string() }));
  return result.ok ? { ok: true, title: result.value.title } : result;
}

export async function deleteConversation(id: string): Promise<{ ok: true } | Failure> {
  const result = await call(conversationRoute(id), { method: "DELETE" }, z.object({ deleted: z.number() }));
  return result.ok ? { ok: true } : result;
}

/** Deletes every conversation; `deleted` is how many the server removed. */
export async function deleteAllConversations(): Promise<{ ok: true; deleted: number } | Failure> {
  const result = await call(CONVERSATIONS_ROUTE, { method: "DELETE" }, z.object({ deleted: z.number().int().min(0) }));
  return result.ok ? { ok: true, deleted: result.value.deleted } : result;
}
