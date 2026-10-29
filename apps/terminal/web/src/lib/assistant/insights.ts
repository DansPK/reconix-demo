/* Small facts about the saved runs that both the welcome screen's suggestions (prompts.ts) and
   the reply cards (cards.ts) use, so a suggestion and the card it leads to always agree (the
   "top finding" a suggestion names is the one its card explains). Pure. */
import { hourMinute, shortDay } from "../data/format";
import { SEVERITIES, type Severity } from "../data/schema";
import type { AssessmentView, FindingView } from "../data/view-types";
import type { RunRef, ScopeRef } from "./protocol";
import { redact } from "./redact";

/** Worst first: the schema's four levels (lib/data/schema.ts). */
export const SEVERITY_ORDER: readonly Severity[] = SEVERITIES;
const rank = (s: Severity) => SEVERITY_ORDER.indexOf(s);

/** A run as card rows name it: its label and when it was created ("5 Oct 14:03"). */
export function runRef(v: AssessmentView): RunRef {
  return { uid: v.uid, label: cut(v.id, 120), when: `${shortDay(v.createdMs)} ${hourMinute(v.createdMs)}` };
}

/** What a conversation about one run (or every run) is about, as its header names it: the
    whole label (id and date) within the protocol's 120 characters. */
export function scopeOf(v: AssessmentView | null): ScopeRef {
  if (!v) return { uid: null, label: "All assessments" };
  const ref = runRef(v);
  return { uid: ref.uid, label: cut(`${ref.label} · ${ref.when}`, 120) };
}

/** One line of text, cut to `max` characters. */
export function cut(value: unknown, max: number): string {
  const flat = String(value ?? "")
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Saved free text shown to the operator: masked again (redact.ts) and made one line. */
export const safe = (value: unknown, max: number) => cut(redact(String(value ?? "")), max);

/** The runs a question is about: one run, or every run (newest first). */
export function scopedViews(views: AssessmentView[], uid: string | null): AssessmentView[] {
  const sorted = [...views].sort((a, b) => b.createdMs - a.createdMs || b.uid.localeCompare(a.uid));
  return uid ? sorted.filter((v) => v.uid === uid) : sorted;
}

/** Findings that count (false positives are left out, as on the dashboard). */
export const realFindings = (v: AssessmentView) => v.findings.filter((f) => !f.falsePositive);

export type Located = { finding: FindingView; view: AssessmentView };

/** Worst first: severity, then CVSS, then the newer run, then the id. */
export function rankFindings(views: AssessmentView[]): Located[] {
  const order = new Map(views.map((v, i) => [v.uid, i]));
  return views
    .flatMap((view) => realFindings(view).map((finding) => ({ finding, view })))
    .sort(
      (a, b) =>
        rank(a.finding.severity) - rank(b.finding.severity) ||
        (b.finding.score ?? 0) - (a.finding.score ?? 0) ||
        (order.get(a.view.uid) ?? 0) - (order.get(b.view.uid) ?? 0) ||
        a.finding.id.localeCompare(b.finding.id),
    );
}

export function severityCounts(views: AssessmentView[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const v of views) for (const f of realFindings(v)) counts[f.severity] += 1;
  return counts;
}

/** "2 critical, 12 high" (the two worst levels present), or "". */
export function worstWords(counts: Record<Severity, number>): string {
  return SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .slice(0, 2)
    .map((s) => `${counts[s]} ${s.toLowerCase()}`)
    .join(", ");
}

export const reviewOf = (f: FindingView): "confirmed" | "review" | "closed" => (f.confirmed ? "confirmed" : f.needsReview ? "review" : "closed");

/** Approvals that wait on the operator now, and runs paused on another input (a sign-in). */
export function waitingOn(views: AssessmentView[]): { approvals: number; inputs: AssessmentView[] } {
  let approvals = 0;
  const inputs: AssessmentView[] = [];
  for (const v of views) {
    const pending = v.approvals.filter((a) => a.state === "PENDING").length;
    approvals += pending;
    if (!pending && v.gate) inputs.push(v);
  }
  return { approvals, inputs };
}

// Its own small copy: the dashboard's (components/dashboard/derive.ts) isn't exported, and lib
// code doesn't import from components.
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
