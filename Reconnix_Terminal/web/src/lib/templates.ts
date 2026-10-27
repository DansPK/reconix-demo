/* The four assessment types. The saved data uses longer template names ("Web URL", "Source
   Code", …); a filter by type (lib/data/stats.ts filterAssessments) matches whichever template
   names belong to it. */

export const TEMPLATE_TYPES = [
  { label: "Web", match: /web/i },
  { label: "API", match: /api/i },
  { label: "Code", match: /code|source/i },
  { label: "Network", match: /network/i },
] as const;

/** Whether a template name belongs to a type (by its label), used when filtering. */
export function matchesTemplateType(name: string, label: string): boolean {
  const type = TEMPLATE_TYPES.find((t) => t.label === label);
  return type ? type.match.test(name) : false;
}
