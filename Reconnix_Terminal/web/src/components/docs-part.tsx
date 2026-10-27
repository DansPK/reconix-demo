import { withPage } from "@/components/docs-primitives";
import type { DocContent } from "@/content/docs/types";
import type { DocPage } from "@/lib/docs-nav";

/**
 * One page of a group, shown in place on the group's page: an h2 with the page's title (the
 * anchor `#<slug>`, which its old address redirects to), its lede, then its body, whose sections
 * are h3s anchored `#<slug>-<section>`. Server component.
 */
export function DocPart({ page, content }: { page: DocPage; content: DocContent }) {
  return (
    <section data-docs-part={page.slug} className="space-y-6 border-t border-border pt-10 first:border-t-0 first:pt-0">
      <header className="space-y-2">
        <h2 id={page.slug} data-toc className="scroll-mt-6 break-words text-2xl font-semibold tracking-tight">
          {page.title}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">{content.lede}</p>
      </header>
      <div className="space-y-8">{withPage(content.body, page.slug)}</div>
    </section>
  );
}
