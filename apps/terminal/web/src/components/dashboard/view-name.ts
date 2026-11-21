/* Pure view-name parsing shared by server components (app/page.tsx) and client URL helpers
   (view-url.ts). Kept free of React hooks and browser APIs so server components can import it. */

// (no "audit", "scope", "log" or "terminal": the Audit log, Scope, Run log and Terminal views were removed; old
// ?view=audit, ?view=scope, ?view=log and ?view=terminal links open the Overview). "knowledge" is the Security knowledge page, opened from
// the AI Assistant's header (no sidebar item).
export const VIEWS = ["overview", "assessments", "findings", "reports", "assistant", "knowledge"] as const;
export type View = (typeof VIEWS)[number];

/** Canonical path for each dashboard view. */
export const VIEW_PATHS: Record<View, string> = {
  overview: "/",
  assessments: "/assessments",
  findings: "/findings",
  reports: "/reports",
  assistant: "/assistant",
  knowledge: "/knowledge",
};

/** Spellings a person may type for a view: they open that view, not the Overview. */
const VIEW_ALIASES: Record<string, View> = {
  report: "reports",
  finding: "findings",
  assessment: "assessments",
};

export const viewPath = (view: View, runId?: string | null): string => {
  const id = runId ? encodeURIComponent(runId) : "";
  if (!id || view === "assessments" || view === "knowledge") return VIEW_PATHS[view];
  if (view === "overview") return `/assessments/${id}`;
  return `${VIEW_PATHS[view]}/${id}`;
};

export const parseView = (value: string | null | undefined): View => {
  const name = (value ?? "").trim().toLowerCase();
  if ((VIEWS as readonly string[]).includes(name)) return name as View;
  return VIEW_ALIASES[name] ?? "overview";
};

/** Parses `/findings/<id>`, `/reports/<id>`, `/assessments/<id>` (overview of that run), `/assistant/<id>`, etc. */
export function parseDashboardPath(pathname: string | null | undefined): { view: View | null; runId: string | null } {
  const parts = (pathname ?? "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length === 0) return { view: null, runId: null };
  const first = parts[0].toLowerCase();
  const base: View | null = (VIEWS as readonly string[]).includes(first) ? (first as View) : (VIEW_ALIASES[first] ?? null);
  if (!base) return { view: null, runId: null };
  if (parts.length === 1) return { view: base, runId: null };
  if (parts.length === 2) {
    let runId: string;
    try {
      runId = decodeURIComponent(parts[1]);
    } catch {
      runId = parts[1];
    }
    if (base === "assessments") return { view: "overview", runId };
    if (base === "findings" || base === "reports" || base === "assistant") return { view: base, runId };
  }
  return { view: null, runId: null };
}

/** View named by a URL pathname (`/findings` or `/findings/<id>` → `"findings"`), or null for `/` or non-view paths. */
export function viewFromPath(pathname: string | null | undefined): View | null {
  return parseDashboardPath(pathname).view;
}

/** Selected run id (uid or UUID) from a dashboard pathname, or null. */
export function runIdFromPath(pathname: string | null | undefined): string | null {
  return parseDashboardPath(pathname).runId;
}

/** Active view from pathname first, falling back to legacy `?view=` on `/`. */
export function resolveView(pathname: string | null | undefined, queryView?: string | null): View {
  return viewFromPath(pathname) ?? parseView(queryView);
}
