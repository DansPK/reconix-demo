import type { Metadata } from "next";
import { DocsGroupPage } from "@/components/docs-group-page";
import { DOCS_NAV } from "@/lib/docs-nav";

// only the groups listed in DOCS_NAV exist (a page of a group is an anchor on its page; its old
// address /docs/<group>/<page> redirects there: lib/docs-redirects.ts)
export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS_NAV.map((g) => ({ group: g.id }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[group]">): Promise<Metadata> {
  const { group } = await params;
  const g = DOCS_NAV.find((x) => x.id === group);
  return { title: g ? `${g.title} · Reconix docs` : "Reconix docs" };
}

/** A group's page: every page of the group, in order, in place. */
export default async function DocGroupPage({ params }: PageProps<"/docs/[group]">) {
  const { group } = await params;
  return <DocsGroupPage groupId={group} />;
}
