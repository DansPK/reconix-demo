import type { ReactNode } from "react";

/** One docs page's content: a part of its group's page. Title and position come from DOCS_NAV (src/lib/docs-nav.ts). */
export type DocContent = {
  lede: string;
  body: ReactNode;
};

/** Pages of one group, keyed by their slug (the anchor `/docs/<group>#<slug>` on the group page). */
export type GroupContent = Record<string, DocContent>;
