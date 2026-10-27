/* The locks every Security knowledge route checks itself (src/proxy.ts checks the session too):
   the AI Assistant's (lib/assistant/access.ts: the launch token, a session, and the page's own
   Origin for a change). Server only. */
import "server-only";

import { refuse } from "../assistant/access";
import { SOURCE_ID } from "../assistant/knowledge/schema";

export const BAD_ID = "That is not a knowledge file id.";
export const GONE = "That knowledge file is not saved any more.";

/** A refusal, or null when the request may go on. `change`: it adds or removes something. */
export const refuseKnowledge = (request: Request, change: boolean) => refuse(request, { change });

/** A knowledge file's id: 32 lower-case hex digits. */
export const isKnowledgeId = (id: string) => SOURCE_ID.test(id);
