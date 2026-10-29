/* What the Overview draws (OverviewCards), for one run (derive.ts) or for every saved run
   (derive-overall.ts): the summary strip, the hero's Ask bar, the Activity and Execution
   timelines and Findings by Severity. Types only, so client components may import them.
   Every number is computed by the derive modules; positions are fractions of an axis (0–1). */
import type { Meaning } from "@/lib/status";
import type { LogKind, PhaseView, Severity, Status } from "@/lib/data/view-types";

import type { Marker } from "./axis";
import type { EventBadge } from "./event-kinds";

export type { EventBadge, Marker };

/** One legend entry: a swatch (CSS colour from the tokens), its name and what it means. */
/** A fill on top of a colour, so two meanings that share a colour still look different. */
export type Pattern = "solid" | "stripes";

export interface LegendItem {
  label: string;
  color: string;
  hint: string;
  shape: "dot" | "count" | "ring" | "bar" | "diamond";
  pattern?: Pattern;
  meaning?: Meaning; // shown as its badge (icon and label) instead of plain text
  count?: number; // how many the chart holds
}

/** A drill-down: which view a number opens, with which filters (see view-url.ts). */
export type DrillDown = { view: "findings"; filters: Record<string, string>; label: string };

// --- summary strip ---------------------------------------------------------------------

export interface SummaryStrip {
  findings: {
    total: number;
    worst: { level: Severity; count: number } | null; // the highest severity present
    needsReview: number;
    link: DrillDown;
  };
  progress: {
    pct: number;
    caption: string; // "2 of 5 plan steps done", "7 of 27 runs completed"
    status: Status | null; // one run's state (null with every run shown)
    other: { status: Status; count: number } | null; // every run: the commonest unfinished state
  };
  tools: {
    steps: number; // tool log lines
    tools: string[]; // the approved tools those lines name
    requests: number; // requests the tools sent (run.requests)
    running: boolean; // a run is running now
    caption: string;
  };
  duration: {
    value: string; // one run's "6m 24s", or every run's "1h 32m" in total
    countup: boolean; // the intro may count it up ("Xm YYs" only)
    // elapsed / limit (capped at 1), and past it; with every run shown, the longest run's
    meter: { frac: number; over: boolean } | null;
    over: number; // runs past their time limit
  };
}

// --- activity timeline -----------------------------------------------------------------

export interface ActivityEvent {
  key: string;
  time: string; // "14:03:09"
  when: string; // "5 Oct 2026 · 14:03:09"
  kind: LogKind;
  label: string; // the tool or event: "Semgrep", "F-001", "HIGH risk"
  badge: EventBadge;
  text: string; // the log line, masked (lib/assistant/redact.ts)
}

/** One mark on a lane: a single event, or events close together (count > 1). */
export interface ActivityMark {
  key: string;
  start: number;
  end: number;
  count: number;
  pending: boolean; // holds the gate the run waits on now
  title: string; // the tooltip
  events: ActivityEvent[];
}

export interface ActivityLane {
  kind: LogKind;
  label: string;
  hint: string;
  color: string;
  count: number;
  marks: ActivityMark[];
}

/** A saved run as a row (execution rows, a day's runs). */
export interface RunEntry {
  uid: string;
  id: string;
  template: string;
  time: string; // "14:03"
  when: string; // "5 Oct 14:03"
  status: Status;
  progress: number;
  steps: { done: number; total: number };
  findings: number;
  target: string; // masked
  waiting: string; // what it waits on, or ""
}

/** Runs started on one day (or week): a bar stacked by run status. */
export interface DayBar {
  key: string;
  label: string; // "6 Oct", "week of 6 Oct"
  pos: number; // centre
  width: number; // fraction of the axis one slot takes
  total: number;
  segments: { status: Status; count: number; color: string; pattern: Pattern }[];
  title: string;
  runs: RunEntry[];
}

export type ActivityCard =
  | {
      mode: "events";
      lanes: ActivityLane[];
      ticks: Marker[];
      total: number;
      window: string;
      summary: string;
      legend: LegendItem[];
      empty: string | null; // shown when nothing was logged yet
    }
  | {
      mode: "days";
      days: DayBar[];
      ticks: Marker[];
      yTicks: number[];
      max: number; // the count axis's end (≥ the busiest slot)
      unit: "day" | "week";
      total: number;
      window: string;
      summary: string;
      legend: LegendItem[];
    };

// --- execution timeline ----------------------------------------------------------------

export interface ToolSegment {
  key: string;
  label: string;
  start: number;
  end: number;
  steps: number;
  title: string;
  live: boolean; // the step running now
}

/** The gate a waiting run stopped at. */
export interface ExecutionGate {
  pos: number | null;
  time: string;
  text: string;
  meaning: Meaning;
}

export type ExecutionCard =
  | {
      mode: "phases";
      phases: PhaseView[];
      tools: ToolSegment[];
      ticks: Marker[];
      gate: ExecutionGate | null;
      caption: string;
      summary: string;
      legend: LegendItem[];
    }
  | {
      mode: "runs";
      runs: RunEntry[];
      caption: string; // "Latest 8 of 27 runs"
      summary: string;
      legend: LegendItem[];
    };

// --- findings by severity --------------------------------------------------------------

/** One severity's count and its share of the card's total. */
export type SeverityCount = { level: Severity; count: number; share: number; frac: number };
export type TopFinding = { key: string; id: string; title: string; severity: Severity; score: number; run: string | null };

/** Findings by Severity: CRITICAL, HIGH, MEDIUM and LOW (the whole scale), so its total is the
    summary strip's and the Findings view's. */
export interface FindingsSlice {
  total: number; // findings at the four levels (the card's count, the bar's whole)
  severity: SeverityCount[]; // CRITICAL, HIGH, MEDIUM, LOW in that order, each even at 0
  words: string; // "0 critical, 3 high, 2 medium, 1 low" (the bar's accessible name)
  review: { confirmed: number; needsReview: number; closed: number }; // of those findings
  top: TopFinding[];
}

// --- the whole Overview ----------------------------------------------------------------

export interface OverviewCards {
  mode: "run" | "all";
  summary: SummaryStrip;
  ask: { label: string; scope: { ok: boolean; text: string }; reach: string; questions: string[] };
  activity: ActivityCard;
  execution: ExecutionCard;
  findings: FindingsSlice;
}
