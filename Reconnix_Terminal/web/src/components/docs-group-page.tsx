import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/docs-layout";
import { DocPart } from "@/components/docs-part";
import { DOCS_CONTENT } from "@/content/docs";
import { DOCS_NAV } from "@/lib/docs-nav";

/**
 * A group's page: every page of the group, in DOCS_NAV order, one after the other (DocPart), in
 * the docs frame. `/docs` and `/docs/<group>` both render it. Server component.
 */
export function DocsGroupPage({ groupId }: { groupId: string }) {
  const group = DOCS_NAV.find((g) => g.id === groupId);
  const content = DOCS_CONTENT[groupId];
  if (!group || !content) notFound();
  return (
    <DocsLayout group={group}>
      {group.pages.map((p) => (content[p.slug] ? <DocPart key={p.slug} page={p} content={content[p.slug]} /> : null))}
    </DocsLayout>
  );
}
