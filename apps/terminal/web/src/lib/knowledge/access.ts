/* The locks every Security knowledge route checks itself (src/proxy.ts checks the session too):
   the AI Assistant's (lib/assistant/access.ts: the launch token, a session, and the page's own
   Origin for a change). Server only. */
import "server-only";

import { refuse } from "../assistant/access";

export const BAD_ID = "That is not a knowledge file id.";

/** A refusal, or null when the request may go on. `change`: it adds or removes something. */
export const refuseKnowledge = (request: Request, change: boolean) => refuse(request, { change });

/** A knowledge document's id: the Core API's UUID, lower case. */
export const isKnowledgeId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
