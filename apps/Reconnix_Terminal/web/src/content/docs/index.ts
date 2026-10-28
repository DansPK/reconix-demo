import { assessmentGuide } from "@/content/docs/assessment-guide";
import { commandsContent } from "@/content/docs/commands";
import { gettingStarted } from "@/content/docs/getting-started";
import { guardrails } from "@/content/docs/guardrails";
import { reports } from "@/content/docs/reports";
import { terminalGuide } from "@/content/docs/terminal-guide";
import { troubleshooting } from "@/content/docs/troubleshooting";
import type { GroupContent } from "@/content/docs/types";

/** Content of every page (a part of `/docs/<group>`, at `#<slug>`), keyed by the DOCS_NAV group id, then slug. */
export const DOCS_CONTENT: Record<string, GroupContent> = {
  "getting-started": gettingStarted,
  "terminal-guide": terminalGuide,
  commands: commandsContent,
  "assessment-guide": assessmentGuide,
  reports,
  troubleshooting,
  guardrails,
};
