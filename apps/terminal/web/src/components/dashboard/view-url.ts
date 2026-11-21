/* Which viewer view is open (its pathname: `/`, `/assistant`, `/findings`, …) and its filters
   in the query string (`?sev=HIGH`), so a reload, a live refresh or a link lands on the same
   place. Switching uses history.replaceState/pushState, which Next.js syncs with usePathname
   and useSearchParams without a server round trip. Safe for the browser only (touches window). */
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { parseView, resolveView, runIdFromPath, viewPath, VIEWS, type View } from "@/components/dashboard/view-name";

export { parseView, resolveView, runIdFromPath, viewPath, VIEWS, type View };

/** The Assessments view's own address parameters (its filters, its page). */
export const ASSESSMENT_KEYS = ["q", "status", "template", "page"] as const;
/** The Findings view's own address parameters (its filters, the selected finding, its page). */
export const FINDINGS_KEYS = ["sev", "val", "q", "fp", "finding", "page"] as const;
/** The Security knowledge view's own address parameters (focused document, optional 1-based part). */
export const KNOWLEDGE_KEYS = ["doc", "part"] as const;
/** Each view's own filter parameters (cleared when a link opens that view with new ones). The
    one list per view: the views read their parameters from these same constants. */
export const VIEW_FILTERS: Partial<Record<View, readonly string[]>> = {
  assessments: ASSESSMENT_KEYS,
  findings: FINDINGS_KEYS,
  knowledge: KNOWLEDGE_KEYS,
};

export type ViewParams = Record<string, string | undefined>;

/** Whether the page is interactive: viewer.tsx marks `html[data-hydrated]` once React has taken
    over. A click React replays from before that would change the address before the router
    listens for it, and the view would not follow; so the one writer below waits for the mark. */
const routerReady = (): boolean => document.documentElement.hasAttribute("data-hydrated");

let pending: (() => void) | null = null; // the last write asked for before hydration (last wins)
let watching = false;

/** Apply the pending write once html[data-hydrated] appears. */
function flushWhenReady(): void {
  if (watching) return;
  watching = true;
  const observer = new MutationObserver(() => {
    if (!routerReady()) return;
    observer.disconnect();
    watching = false;
    const write = pending;
    pending = null;
    write?.();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hydrated"] });
}

/**
 * Put `params` in the address: in place (`replace`, the default) or as a new history entry
 * carrying `state` (`push`), then call `done`. The only place the dashboard writes its address.
 * Before hydration the write is queued (the last one asked for wins) and applied once the page
 * is interactive; the return says whether it was written now.
 */
export function writeQuery(
  params: URLSearchParams,
  mode: "push" | "replace" = "replace",
  state: unknown = null,
  done?: () => void,
  pathname?: string,
): boolean {
  const query = params.toString();
  const write = () => {
    const base = pathname ?? window.location.pathname;
    window.history[mode === "push" ? "pushState" : "replaceState"](state, "", query ? `${base}?${query}` : base);
    done?.();
  };
  if (routerReady()) {
    write();
    return true;
  }
  pending = write;
  flushWhenReady();
  return false;
}

const write = (params: URLSearchParams, pathname?: string): void => {
  writeQuery(params, "replace", null, undefined, pathname);
};

/** The query string after opening `view` from the one `search` holds (pure). */
export function viewSearch(search: string, view: View, filters?: ViewParams, currentPath?: string): string {
  const params = new URLSearchParams(search);
  const from = resolveView(currentPath, params.get("view"));
  if (from !== view) {
    for (const key of VIEW_FILTERS[from] ?? []) params.delete(key);
    params.delete("finding");
  }
  if (view === "assessments") {
    params.delete("uid");
    params.delete("assessment");
  }
  params.delete("view");
  if (filters) {
    for (const key of VIEW_FILTERS[view] ?? []) params.delete(key);
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  }
  return params.toString();
}

/** The canonical path + query URL for opening `view` from `(currentPath, search)`. */
export function viewUrl(currentPath: string, search: string, view: View, filters?: ViewParams): string {
  const params = new URLSearchParams(viewSearch(search, view, filters, currentPath));
  const runId = view === "assessments" || view === "knowledge" ? null : (runIdFromPath(currentPath) ?? params.get("uid") ?? params.get("assessment"));
  params.delete("uid");
  params.delete("assessment");
  const base = viewPath(view, runId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

type ViewNavigator = (href: string, mode: "push" | "replace") => void;
let navigatorFn: ViewNavigator | null = null;

/** Registers Next.js router navigation so programmatic view switches use real SSR routing. */
export function registerViewNavigator(fn: ViewNavigator | null): void {
  navigatorFn = fn;
}

/** Open `view` at its clean path (`/findings/<id>`, `/reports/<id>`, `/assessments/<id>`, …).
 *  Keeps Overview ↔ Assistant in-place (via history state) so the mounted Viewer can play its
 *  GSAP hero/globe transition; other route switches use Next.js SSR navigation. */
export function showView(view: View, filters?: ViewParams): void {
  const from = resolveView(window.location.pathname, new URLSearchParams(window.location.search).get("view"));
  const params = new URLSearchParams(viewSearch(window.location.search, view, filters, window.location.pathname));
  const runId = view === "assessments" || view === "knowledge" ? null : (runIdFromPath(window.location.pathname) ?? params.get("uid") ?? params.get("assessment"));
  params.delete("uid");
  params.delete("assessment");
  const base = viewPath(view, runId);
  const query = params.toString();
  const href = query ? `${base}?${query}` : base;
  const inPlaceAssistantToggle =
    (from === "overview" && view === "assistant") || (from === "assistant" && view === "overview");
  if (from !== view && !inPlaceAssistantToggle && navigatorFn) {
    navigatorFn(href, "push");
    return;
  }
  write(params, base);
}

/** Current dashboard view from Next.js pathname (falling back to legacy `?view=`). */
export function useCurrentView(): View {
  const pathname = usePathname();
  const search = useSearchParams();
  return resolveView(pathname, search.get("view"));
}

/** The current value of some query parameters, and a setter that changes only those. */
export function useQueryParams<K extends string>(keys: readonly K[]): [Record<K, string>, (patch: Partial<Record<K, string>>) => void] {
  const search = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, search.get(k) ?? ""])) as Record<K, string>;
  const update = useCallback((patch: Partial<Record<K, string>>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch) as [string, string | undefined][]) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    write(params);
  }, []);
  return [values, update];
}

/** The link that opens one saved run (`uid`), or every run (`null`), from the address `search`
    (pure): the open view and its filters stay, except when picking a specific run from the
    Assessments list (`view=assessments`), which returns to that run's Overview. The selected
    finding or page is dropped (they belong to what was left behind). */
export function runHref(search: string, uid: string | null, pathname = "/"): string {
  const next = new URLSearchParams(search);
  const currentView = resolveView(pathname, next.get("view"));
  next.delete("view");
  next.delete("uid");
  next.delete("finding");
  next.delete("page");
  next.delete("assessment");
  let targetView: View = currentView;
  if (uid && currentView === "assessments") {
    targetView = "overview";
    for (const key of ASSESSMENT_KEYS) next.delete(key);
  }
  const base = viewPath(targetView, uid);
  const query = next.toString();
  return query ? `${base}?${query}` : base;
}

/** runHref from the current address. */
export function useRunHref(): (uid: string | null) => string {
  const pathname = usePathname();
  const search = useSearchParams();
  return (uid) => runHref(search.toString(), uid, pathname);
}

/** The Overview of one saved run, from anywhere (no filters carried). */
export const runOverviewHref = (uid: string): string => viewPath("overview", uid);

/** One finding opened in its own run's Findings view. */
export const runFindingHref = (uid: string, findingId: string): string =>
  `${viewPath("findings", uid)}?finding=${encodeURIComponent(findingId)}`;

// --- the AI Assistant's history entry ----------------------------------------------------
// Opening the assistant pushes one entry (Back returns to where you were); opening it while it
// is open adds nothing. Leaving through its own controls goes back that entry instead of adding
// another, then opens the wanted view in place.

let assistantPushed = false; // this page pushed the entry the assistant sits on
let ownEntryLength = -1; // history.length right after that push (Forward lands on it again)
let afterBack: { view: View; filters?: ViewParams } | null = null; // the view to open once that Back has landed
let waitingBack = false; // history.back() is in flight, popstate hasn't landed yet

const viewNow = (): View => resolveView(window.location.pathname, new URLSearchParams(window.location.search).get("view"));

export function openAssistant(): void {
  if (viewNow() === "assistant") return;
  const params = new URLSearchParams(window.location.search);
  const runId = runIdFromPath(window.location.pathname) ?? params.get("uid") ?? params.get("assessment");
  params.delete("view");
  params.delete("uid");
  params.delete("assessment");
  const base = viewPath("assistant", runId);
  // Keep the Viewer mounted (pushState, synced with Next.js usePathname) so AssistantStage plays
  // its GSAP hero/globe open transition instead of remounting via SSR route navigation.
  writeQuery(
    params,
    "push",
    null,
    () => {
      assistantPushed = true;
      ownEntryLength = window.history.length;
    },
    base,
  );
}

/** Leave the assistant for `target`, or (no target) for wherever it was opened from. */
export function leaveAssistant(target?: View, filters?: ViewParams): void {
  if (viewNow() !== "assistant") return showView(target ?? "overview", filters);
  const next = target ? { view: target, filters } : null;
  if (waitingBack) {
    afterBack = next;
    return;
  }
  if (assistantPushed) {
    assistantPushed = false;
    waitingBack = true;
    afterBack = next;
    window.history.back();
    return;
  }
  showView(target ?? "overview", filters); // opened directly (a link or a reload): nothing to go back to
}

/** Keeps the bookkeeping right when the browser moves through history (Back, Forward). */
export function watchHistory(): () => void {
  const onPop = () => {
    const now = viewNow();
    waitingBack = false;
    // Forward onto the entry this page pushed: leaving it may go Back again
    assistantPushed = now === "assistant" && window.history.length === ownEntryLength;
    const target = afterBack;
    afterBack = null;
    // after Next.js has handled this same popstate: a router push from inside it is overridden by
    // the router restoring the entry it went back to, and the person would land on the Overview
    if (target && (target.view !== now || target.filters)) window.setTimeout(() => showView(target.view, target.filters), 0);
  };
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}
