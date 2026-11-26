/**
 * The Assessments view (AssessmentsCards, report-types.ts): every saved run as a row. Pure, like
 * derive.ts: every number counts what the saved files hold. (The Report view reads the Core API:
 * lib/api/adapt.ts.)
 */
import { redact } from "@/lib/assistant/redact";
import { hourMinute, shortDay } from "@/lib/data/format";
import { FINDING_SEVERITIES } from "@/lib/data/schema";
import type { AssessmentView, FindingSeverity, LibraryItem } from "@/lib/data/view-types";

import { plural } from "./derive-shared";
import type { AssessmentsCards, ReportRunRow } from "./report-types";

const counted = (v: AssessmentView) => v.findings.filter((f) => !f.falsePositive);

/** The worst severity among findings (false positives left out, including UNKNOWN and NONE), or null. */
export function worstOf(levels: FindingSeverity[]): FindingSeverity | null {
  return FINDING_SEVERITIES.find((s) => levels.includes(s)) ?? null; // CRITICAL first
}

/** A saved run as the run search reads it (lib/data/adapt.ts libraryItem, from the view). */
function libraryRow(v: AssessmentView): LibraryItem {
  return {
    uid: v.uid,
    id: v.id,
    template: v.template,
    target: redact(v.target),
    status: v.status,
    when: `${shortDay(v.createdMs)} ${hourMinute(v.createdMs)}`,
    waiting: v.gate ? redact(v.gate.text) : "",
  };
}

export function runRow(v: AssessmentView): ReportRunRow {
  const found = counted(v);
  return {
    ...libraryRow(v),
    findings: found.length,
    worst: worstOf(found.map((f) => f.severity)),
    steps: { done: v.phases.filter((p) => p.status === "done").length, total: v.phases.length },
  };
}

/** The Assessments view over `rows` (every saved run, newest first; not empty). */
export function assessmentsCards(rows: ReportRunRow[]): AssessmentsCards {
  return {
    tag: `All ${plural(rows.length, "run")}`,
    about:
      rows.length === 1
        ? "The one run the TUI saved: open it for its overview, findings and report."
        : "Every run the TUI saved, newest first: search or filter them, and open one for its overview, findings and report.",
    rows,
  };
}
