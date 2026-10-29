/* The AI Assistant's addresses (safe for the browser and the server). Every route under
   /api/assistant needs a session: src/proxy.ts checks it, and so do the handlers. */

export const ASSISTANT_ROUTE = "/api/assistant";
/** The saved conversations (GET the list, DELETE all). */
export const CONVERSATIONS_ROUTE = `${ASSISTANT_ROUTE}/conversations`;
/** One saved conversation (GET, PATCH to rename, DELETE). */
export const conversationRoute = (id: string) => `${CONVERSATIONS_ROUTE}/${encodeURIComponent(id)}`;
/** The assistant on the dashboard page; /assistant redirects here. */
export const ASSISTANT_VIEW = "/?view=assistant";
