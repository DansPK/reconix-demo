/* The AI Assistant's question route. Static demo: no model, no sign-in. In order: a rate slot
   (before any reading), the body (bytes counted as they arrive), its shape, the conversation
   (read from the server's own file: the browser never sends the history), the saved data (read
   here) and the passages of the TUI's /add-on files relevant to the masked question
   (lib/assistant/knowledge: read-only). A conversation keeps the run it was started about. The
   answer streams back as NDJSON frames (lib/assistant/protocol.ts): the cards the server built
   from the saved files, then a canned narrative (reply.ts). The conversation's id also goes in
   the X-Conversation-Id header, so a page that stops before the first frame still knows it. */
import { buildContext } from "@/lib/assistant/context";
import { pickCards } from "@/lib/assistant/cards";
import { fail, NO_STORE, readJson, refuse } from "@/lib/assistant/access";
import type { Conversation } from "@/lib/assistant/history-schema";
import { addQuestion, HistoryError, keptQuestion, readConversation } from "@/lib/assistant/history-store";
import { scopeOf } from "@/lib/assistant/insights";
import { searchKnowledge } from "@/lib/assistant/knowledge";
import { NDJSON } from "@/lib/assistant/protocol";
import { createLimiter, limitsFromEnv } from "@/lib/assistant/rate";
import { replyStream } from "@/lib/assistant/reply";
import { ChatRequestSchema, MAX_BODY } from "@/lib/assistant/request";
import { assessmentView } from "@/lib/data/adapt";
import { type Library, loadLibrary } from "@/lib/data/store";

const limiter = createLimiter(...limitsFromEnv());
const GONE = "That conversation is not saved any more. Start a new chat.";
const trouble = (error: unknown, otherwise: string) => fail(error instanceof HistoryError ? error.message : otherwise, 500);

export async function POST(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;

  const release = limiter.take();
  if (!release) return fail("Too many questions at once. Wait a moment and ask again.", 429);
  let streaming = false; // from here the reply stream hands the slot back
  try {
    const body = await readJson(request, MAX_BODY);
    if (!body.ok) return body.response;
    const parsed = ChatRequestSchema.safeParse(body.value);
    if (!parsed.success) return fail("The request does not match what the assistant accepts.", 400);
    const { conversationId, question, retry } = parsed.data;

    let existing: Conversation | null = null;
    let library: Library;
    try {
      if (conversationId) existing = await readConversation(conversationId);
      library = await loadLibrary();
    } catch (error) {
      return trouble(error, "The saved data could not be read.");
    }
    if (conversationId && !existing) return fail(GONE, 404);
    const uid = existing ? existing.scope.uid : parsed.data.uid; // a conversation keeps its run

    // the /add-on passages relevant to the question as it is kept (masked), read-only
    const knowledge = await searchKnowledge(keptQuestion(question));
    const context = buildContext(library.assessments, uid, knowledge.passages);
    if (!context) return fail("That assessment is not saved any more. Pick another one.", 404);
    const run = uid ? library.assessments.find((a) => a.uid === uid) : undefined;

    let saved;
    try {
      saved = await addQuestion({ id: existing?.id, scope: existing?.scope ?? scopeOf(run ? assessmentView(run) : null), question, retry });
    } catch (error) {
      return trouble(error, "The conversation could not be saved.");
    }
    if (saved === "busy") return fail("That question is still being answered. Wait for it, or stop it first.", 409);
    if (!saved) return fail(GONE, 404);
    const { conversation, asked } = saved;

    const cards = pickCards(library.assessments, uid, asked.content);
    const stream = replyStream({ conversation, asked, cards, knowledge: knowledge.sources, signal: request.signal, release });
    streaming = true;
    return new Response(stream, {
      headers: { ...NO_STORE, "Content-Type": NDJSON, "X-Content-Type-Options": "nosniff", "X-Conversation-Id": conversation.id },
    });
  } finally {
    if (!streaming) release();
  }
}
