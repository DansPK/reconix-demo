/* A card of a view's summary strip (the Report view; the Overview's own strip is
   SummaryStrip): a label, one big number, its context as badges and words (never colour alone),
   an optional meter and an optional drill-down. Types only, so client components may import it.
   Every value is computed by the derive modules. */
import type { DrillDown, EventBadge } from "./overview-types";

export type StatIcon = "findings" | "steps" | "requests" | "masked" | "runs";

export interface Stat {
  label: string;
  icon: StatIcon;
  value: string;
  /** How the intro may count the number up ("none": it is not a plain count, e.g. "18/27"). */
  format: "int" | "duration" | "none";
  unit: string | null; // a word after the number ("in scope")
  badges: EventBadge[]; // each with its meaning's explanation as a toggletip
  meter: { frac: number; over: boolean; label: string } | null;
  note: string;
  link: DrillDown | null; // the whole card opens this
}

/** A link to one saved run (it opens the view it sits in, for that run). */
export interface RunLink {
  uid: string;
  label: string; // "RCX-DEMO-001 · 9 Oct 15:33"
}
