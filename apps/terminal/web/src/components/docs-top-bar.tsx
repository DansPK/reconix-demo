import { BookOpen } from "lucide-react";

/**
 * The top bar on the docs pages, in the dashboard's frame: what this tab is. It holds no link or
 * button: the docs read in place (docs/WEB_DOCS_INLINE_PLAN.md), the docs search lives in the
 * docs sidebar, and the rail on the left leads back to the dashboard's views. Server component.
 */
export function DocsTopBar() {
  return (
    <header className="dash-topbar relative z-30 flex min-w-0 items-center gap-3 border-b border-border px-3 sm:px-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-border bg-card text-primary">
        <BookOpen className="size-4" strokeWidth={1.6} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-foreground">Documentation</span>
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:block">The Reconix terminal, every command and key</span>
      </span>
    </header>
  );
}
