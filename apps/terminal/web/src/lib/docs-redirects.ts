/* Where the documentation's old addresses go, so links in the dashboard, bookmarks and the old
   sitemaps keep working (308, in next.config.ts):

   - the v2 structure's pages (restructured in redesign v3, docs/WEB_REDESIGN_V3_PLAN.md): each
     redirects to the nearest part of the new structure, in one hop;
   - the v3 structure's pages, `/docs/<group>/<page>` (docs/WEB_DOCS_INLINE_PLAN.md: each group
     is now ONE page that shows all of its pages): one rule sends each to its anchor on the group's
     page, `/docs/<group>#<page>`.

   Next.js applies the first rule that matches, so the specific redirects come before the page
   rule. tests/docs-nav.test.ts checks that every old address lands on a live address (anchors
   included), that DOCS_GROUP_IDS matches DOCS_NAV, and that no rule shadows a live page; the e2e
   spec asks the server. Plain data with no imports, so next.config.ts can load it. */

export type DocsRedirect = { source: string; destination: string };

/** Every docs route the v2 structure had (its DOCS_NAV before redesign v3). */
export const OLD_DOCS_ROUTES: string[] = [
  "/docs",
  "/docs/getting-started",
  "/docs/getting-started/requirements",
  "/docs/getting-started/installation",
  "/docs/getting-started/configuration",
  "/docs/getting-started/first-assessment",
  "/docs/assessments",
  "/docs/assessments/workflow",
  "/docs/assessments/templates",
  "/docs/interfaces",
  "/docs/interfaces/terminal",
  "/docs/interfaces/vscode-extension",
  "/docs/interfaces/local-viewer",
  "/docs/configuration",
  "/docs/configuration/scope-manifest",
  "/docs/configuration/policies",
  "/docs/guardrails",
  "/docs/guardrails/authorized-use",
  "/docs/guardrails/scope-and-safety",
  "/docs/guardrails/approval-model",
  "/docs/guardrails/credential-handling",
  "/docs/guardrails/llm-data-handling",
  "/docs/guardrails/model-switching",
  "/docs/guardrails/knowledge-and-rag",
  "/docs/guardrails/limitations",
  "/docs/architecture",
  "/docs/reference",
  "/docs/reference/findings",
  "/docs/reference/reports",
];

/** The v2 addresses that are no page of a group today → the nearest group page or part. */
export const DOCS_REDIRECTS: DocsRedirect[] = [
  { source: "/docs/getting-started/configuration", destination: "/docs/getting-started#installation" },
  { source: "/docs/getting-started/first-assessment", destination: "/docs/getting-started#first-steps" },
  { source: "/docs/assessments", destination: "/docs/assessment-guide" },
  { source: "/docs/assessments/workflow", destination: "/docs/assessment-guide" },
  { source: "/docs/assessments/templates", destination: "/docs/assessment-guide#request" },
  { source: "/docs/interfaces", destination: "/docs/terminal-guide" },
  { source: "/docs/interfaces/terminal", destination: "/docs/terminal-guide#screens" },
  { source: "/docs/interfaces/vscode-extension", destination: "/docs/getting-started#introduction" },
  { source: "/docs/interfaces/local-viewer", destination: "/docs/reports#dashboard" },
  { source: "/docs/configuration", destination: "/docs/assessment-guide#scope" },
  { source: "/docs/configuration/scope-manifest", destination: "/docs/assessment-guide#scope" },
  { source: "/docs/configuration/policies", destination: "/docs/assessment-guide#policy-checks" },
  { source: "/docs/guardrails/model-switching", destination: "/docs/guardrails#llm-data-handling" },
  { source: "/docs/guardrails/knowledge-and-rag", destination: "/docs/guardrails#llm-data-handling" },
  { source: "/docs/architecture", destination: "/docs/getting-started#introduction" },
  { source: "/docs/reference", destination: "/docs/reports" },
  { source: "/docs/reference/findings", destination: "/docs/reports#understanding-findings" },
  { source: "/docs/reference/reports", destination: "/docs/reports#exporting" },
];

/** The groups of DOCS_NAV (lib/docs-nav.ts), each one page; the tests keep the two in step. */
export const DOCS_GROUP_IDS: string[] = [
  "getting-started",
  "terminal-guide",
  "commands",
  "assessment-guide",
  "reports",
  "troubleshooting",
  "guardrails",
];

/** A page slug: the last segment of a page's old address (and its anchor today). */
const PAGE_SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";

/** A page's old address, `/docs/<group>/<page>` → its part on the group's page. */
export const DOCS_PAGE_REDIRECT: DocsRedirect = {
  source: `/docs/:group(${DOCS_GROUP_IDS.join("|")})/:page(${PAGE_SLUG})`,
  destination: "/docs/:group#:page",
};

/** Every rule, in the order Next.js tries them (the first match wins). */
export const ALL_DOCS_REDIRECTS: DocsRedirect[] = [...DOCS_REDIRECTS, DOCS_PAGE_REDIRECT];

const PAGE_PATH = new RegExp(`^/docs/(${DOCS_GROUP_IDS.join("|")})/(${PAGE_SLUG})$`);

/**
 * Where an address is redirected, as the rules above send it (undefined: it is not). The same
 * order as next.config.ts; for the tests, which check every target is live.
 */
export function docsRedirectOf(path: string): string | undefined {
  const exact = DOCS_REDIRECTS.find((r) => r.source === path);
  if (exact) return exact.destination;
  const page = PAGE_PATH.exec(path);
  return page ? `/docs/${page[1]}#${page[2]}` : undefined;
}
