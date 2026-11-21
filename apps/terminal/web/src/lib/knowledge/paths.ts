/* The Security knowledge page's addresses (safe for the browser, the proxy and the server). Every
   route under /api/knowledge needs a session: src/proxy.ts checks it, and so do the handlers
   (lib/knowledge/access.ts). */

export const KNOWLEDGE_ROUTE = "/api/knowledge";
/** One knowledge file (DELETE removes it). */
export const knowledgeFileRoute = (id: string) => `${KNOWLEDGE_ROUTE}/${encodeURIComponent(id)}`;
/** The graph: every document and the references and topics it talks about (GET). */
export const KNOWLEDGE_GRAPH_ROUTE = `${KNOWLEDGE_ROUTE}/graph`;
/** A document's content: a page of its passages (GET ?offset=&limit=). */
export const knowledgePassagesRoute = (id: string, offset: number, limit: number) => `${knowledgeFileRoute(id)}/passages?offset=${offset}&limit=${limit}`;
/** What a reference is, from the built-in knowledge base (GET ?type=&ref=&label=). */
export const knowledgeAboutRoute = (type: string, ref: string, label: string) =>
  `${KNOWLEDGE_ROUTE}/about?${new URLSearchParams({ type, ref, label })}`;
/** Re-ingest the knowledge (GET the job, POST to start it). */
export const KNOWLEDGE_REINGEST_ROUTE = `${KNOWLEDGE_ROUTE}/reingest`;
/** The Security knowledge canonical route on the dashboard. */
export const KNOWLEDGE_VIEW = "/knowledge";
