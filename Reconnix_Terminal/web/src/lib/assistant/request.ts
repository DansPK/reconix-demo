/* What the browser may send to the AI Assistant's routes, checked on the server. A question
   names the conversation it continues (none starts a new one), the run a new conversation is
   about (a saved assessment's uid, or null for every run) and the question itself; nothing
   else. The browser never sends the conversation so far or any assessment data: the server
   reads both from its own files. */
import { z } from "zod";

import { CONVERSATION_ID, RUN_UID } from "./protocol";

export const MAX_QUESTION = 4_000; // characters in one question
export const MAX_MESSAGES = 30; // earlier turns of the conversation the model gets, at most
export const MAX_REPLY = 8_000; // characters of one earlier reply the model gets again
export const MAX_HISTORY = 24_000; // characters of earlier turns the model gets in all
export const MAX_BODY = 32_000; // bytes of a question request
export const MAX_RENAME_BODY = 2_000; // bytes of a rename request

export const ChatRequestSchema = z
  .object({
    conversationId: z.string().regex(CONVERSATION_ID).optional(),
    uid: z.string().regex(RUN_UID).nullable(),
    question: z.string().trim().min(1).max(MAX_QUESTION),
    // ask again after an error: the failed question and its error are replaced
    retry: z.boolean().optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const RenameRequestSchema = z.object({ title: z.string().max(400) }).strict();
