import { DocsSidebar } from "@/components/docs-sidebar";
import { DocsToc } from "@/components/docs-toc";
import type { DocGroup } from "@/lib/docs-nav";
import { groupSearchIndex } from "@/lib/docs-search-index";

/**
 * The frame of a group's page: the search and the groups (left), the group's title, lede and
 * every one of its pages (centre), "On this page" (right, xl). Nothing here leads to another
 * page except the docs sidebar's groups: the docs read in place (docs/WEB_DOCS_INLINE_PLAN.md).
 * The search index is built once on the server, for this group only.
 */
export function DocsLayout({ group, children }: { group: DocGroup; children: React.ReactNode }) {
  return (
    // inside the dashboard frame's content area (app/docs/layout.tsx), which is the <main>
    <div className="docs-main mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 lg:py-8 xl:grid-cols-[240px_minmax(0,1fr)_200px]">
      <DocsSidebar groupId={group.id} index={groupSearchIndex(group.id)} />

      <article className="min-w-0 max-w-3xl">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Documentation · {group.pages.length} {group.pages.length === 1 ? "page" : "pages"}
        </p>
        <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-[2rem]">{group.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{group.description}</p>

        <div data-docs-content className="mt-10 space-y-14">
          {children}
        </div>
      </article>

      <DocsToc />
    </div>
  );
}
