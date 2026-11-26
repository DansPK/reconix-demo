/* What the Assessments view draws (AssessmentsCards, derive-report.ts): every saved run as a
   row. Types only. */
import type { FindingSeverity, LibraryItem } from "@/lib/data/view-types";

/** A saved run in the runs table (a LibraryItem, so the run search reads it). */
export interface ReportRunRow extends LibraryItem {
  findings: number; // false positives left out
  worst: FindingSeverity | null; // a Core API row may be UNKNOWN or NONE
  steps: { done: number; total: number };
  href?: string; // where the row opens; without it, the saved run's Overview
}

/** What the Assessments view draws: its header and every saved run as a row. */
export interface AssessmentsCards {
  tag: string; // "All 27 runs"
  about: string;
  rows: ReportRunRow[]; // newest first
}
