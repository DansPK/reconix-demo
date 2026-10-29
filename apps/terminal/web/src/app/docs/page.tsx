import { DocsGroupPage } from "@/components/docs-group-page";
import { DOCS_HOME_GROUP } from "@/lib/docs-nav";

export const metadata = { title: "Documentation · Reconix" };

/** The docs' own address shows Getting started in place: no landing cards, no redirect. */
export default function DocsHome() {
  return <DocsGroupPage groupId={DOCS_HOME_GROUP} />;
}
