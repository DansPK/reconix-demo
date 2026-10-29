import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocPageCards } from "@/components/docs-cards";
import { DocsLayout, DocSection } from "@/components/docs-layout";
import { DOCS_NAV } from "@/lib/docs-nav";

// only the groups listed in DOCS_NAV exist; /docs/architecture has its own static page
export const dynamicParams = false;

const groupsWithPages = DOCS_NAV.filter((g) => g.pages.length > 0);

export function generateStaticParams() {
  return groupsWithPages.map((g) => ({ group: g.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ group: string }> }): Promise<Metadata> {
  const { group } = await params;
  const g = groupsWithPages.find((x) => x.id === group);
  return { title: g ? `${g.title} · Reconix docs` : "Reconix docs" };
}

/** Group landing: the group's description and a card per page. */
export default async function DocGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  const g = groupsWithPages.find((x) => x.id === group);
  if (!g) notFound();
  return (
    <DocsLayout href={g.href} lede={g.description}>
      <DocSection title="In this section">
        <DocPageCards pages={g.pages} />
      </DocSection>
    </DocsLayout>
  );
}
