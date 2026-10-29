import { assessments } from "@/content/docs/assessments";
import { configuration } from "@/content/docs/configuration";
import { gettingStarted } from "@/content/docs/getting-started";
import { guardrails } from "@/content/docs/guardrails";
import { interfaces } from "@/content/docs/interfaces";
import { reference } from "@/content/docs/reference";
import type { GroupContent } from "@/content/docs/types";

/** Content of every /docs/<group>/<slug> page, keyed by the DOCS_NAV group id, then slug. */
export const DOCS_CONTENT: Record<string, GroupContent> = {
  "getting-started": gettingStarted,
  assessments,
  interfaces,
  configuration,
  guardrails,
  reference,
};
