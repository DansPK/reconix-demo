/* What the Report view draws (ReportCards), for one run or for every saved run
   (derive-report.ts). One run: the summary strip, the assessment's details and plan, Findings by
   Severity and the findings table (the downloads come from its uid). Every run: the strip,
   Findings by Severity, the targets and a table of runs, each with its downloads. Types only. */
import type { Meaning } from "@/lib/status";
import type { LibraryItem, Severity } from "@/lib/data/view-types";

import type { EventBadge, FindingsSlice } from "./overview-types";
import type { RunLink, Stat } from "./stat-types";

export interface DetailRow {
  label: string;
  value: string;
  badge: EventBadge | null; // shown before the value
}

export interface PlanRow {
  key: string;
  label: string;
  state: Meaning;
  pct: number;
}

export interface ReportFindingRow {
  key: string; // the Findings view's key for it
  id: string;
  title: string;
  severity: Severity;
  review: Meaning; // Confirmed, Needs review, or why it is closed
  tool: string;
  cwe: string;
  rating: string; // "CVSS 7.3" or "no CVSS"
  falsePositive: boolean; // listed with its review state, never counted
}

/** A saved run in the runs table (a LibraryItem, so the run search reads it). */
export interface ReportRunRow extends LibraryItem {
  findings: number; // false positives left out
  worst: Severity | null;
  steps: { done: number; total: number };
}

export interface ReportTargetRow {
  target: string; // masked
  runs: number;
  findings: number;
  worst: Severity | null;
  latest: RunLink;
}

/** What the Assessments view draws: its header and every saved run as a row. */
export interface AssessmentsCards {
  tag: string; // "All 27 runs"
  about: string;
  rows: ReportRunRow[]; // newest first
}

export type ReportCards =
  | {
      mode: "run";
      uid: string;
      tag: string; // beside the title: "RCX-001 · 1.1.1.1"
      about: string;
      stats: Stat[];
      details: DetailRow[];
      plan: PlanRow[];
      findings: FindingsSlice; // the top list cut to the top 3 CVSS (REPORT_TOP_FINDINGS)
      rows: ReportFindingRow[];
    }
  | {
      mode: "all";
      tag: string; // "All 27 runs"
      about: string;
      stats: Stat[];
      findings: FindingsSlice; // the top list cut to the top 3 CVSS (REPORT_TOP_FINDINGS)
      targets: ReportTargetRow[]; // every target, most findings first (the card shows 7 a page)
      runs: ReportRunRow[];
    };
