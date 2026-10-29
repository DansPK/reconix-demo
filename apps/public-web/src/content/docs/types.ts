import type { ReactNode } from "react";

/** One docs page's content. Title and position come from DOCS_NAV (src/lib/docs-nav.ts). */
export type DocContent = {
  lede: string;
  /** not enough source material yet: the page shows the "Draft: content pending" callout */
  draft?: boolean;
  body: ReactNode;
};

/** Pages of one group, keyed by the last url segment (`/docs/<group>/<slug>`). */
export type GroupContent = Record<string, DocContent>;
