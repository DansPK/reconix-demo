import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/docs-layout";
import { DOCS_CONTENT } from "@/content/docs";
import { DOCS_NAV, findDoc } from "@/lib/docs-nav";

// every page is listed in DOCS_NAV and has content in src/content/docs; nothing else exists
export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS_NAV.flatMap((g) =>
    g.pages.map((p) => ({ group: g.id, page: p.href.split("/").pop()! })).filter((x) => DOCS_CONTENT[x.group]?.[x.page])
  );
}

type Params = Promise<{ group: string; page: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { group, page } = await params;
  const entry = findDoc(`/docs/${group}/${page}`);
  return { title: entry ? `${entry.title} · Reconix docs` : "Reconix docs" };
}

export default async function DocPage({ params }: { params: Params }) {
  const { group, page } = await params;
  const href = `/docs/${group}/${page}`;
  const content = DOCS_CONTENT[group]?.[page];
  if (!content || !findDoc(href)) notFound();
  return (
    <DocsLayout href={href} lede={content.lede} draft={content.draft}>
      {content.body}
    </DocsLayout>
  );
}
