/* Everything the pages count, as pure functions of the saved assessments.
   No I/O here, so it is unit-tested directly (tests/stats.test.ts). */
import {
  type Approval,
  type Assessment,
  type Decision,
  type Finding,
  SEVERITIES,
  type Severity,
  type Status,
  STATUSES,
  type TimelineEntry,
  UNFINISHED,
} from "./schema";
import { matchesTemplateType } from "../templates";

export interface FindingRow extends Finding {
  key: string; // unique across assessments: "<uid>~<finding id>"
  assessment: Assessment;
}

export type DecisionState = "APPROVED" | "REJECTED" | "PENDING";

export interface ApprovalRow {
  assessment: Assessment;
  approval: Approval;
  state: DecisionState;
  decision: Decision | null;
}

export const isConfirmed = (f: Finding) => f.validation === "CONFIRMED";

// --- analyst triage ----------------------------------------------------------------------

/** The analyst's severity when one was set, else the detected one (older files have neither).
    Never INFO: the reader dropped every finding with INFO in any of the three (schema.ts
    `withoutInfo`), so an Info override can't bring the detected severity back. */
export function effectiveSeverity(f: Finding): Severity {
  return f.effective_severity || f.severity_override || f.severity;
}

/** Triage statuses that take a finding out of the open risk; anything else counts as open. */
const CLOSED_TRIAGE: ReadonlySet<string> = new Set(["fixed", "accepted", "false-positive"]);

export const isFalsePositive = (f: Finding) => f.status === "false-positive";
export const isOpen = (f: Finding) => !CLOSED_TRIAGE.has(f.status);
/** Still open and not confirmed: what the analyst has left to look at. */
export const needsReview = (f: Finding) => isOpen(f) && !isConfirmed(f);

export function triageCounts(findings: Finding[]): { open: number; fixed: number; accepted: number; falsePositive: number } {
  return {
    open: findings.filter(isOpen).length,
    fixed: findings.filter((f) => f.status === "fixed").length,
    accepted: findings.filter((f) => f.status === "accepted").length,
    falsePositive: findings.filter(isFalsePositive).length,
  };
}

/** The findings that were real (every one but the false positives). */
const realFindings = (a: Assessment) => a.findings.filter((f) => !isFalsePositive(f));

export function allFindings(list: Assessment[]): FindingRow[] {
  const rows = list.flatMap((a) => a.findings.map((f) => ({ ...f, key: `${a.uid}~${f.id}`, assessment: a })));
  return rows.sort(
    (x, y) =>
      SEVERITIES.indexOf(effectiveSeverity(x)) - SEVERITIES.indexOf(effectiveSeverity(y)) ||
      y.assessment.created_at.localeCompare(x.assessment.created_at) ||
      x.id.localeCompare(y.id),
  );
}

export function severityCounts(findings: Finding[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const f of findings) counts[effectiveSeverity(f)] += 1;
  return counts;
}

export function statusCounts(list: Assessment[]): Record<Status, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const a of list) counts[a.status] += 1;
  return counts;
}

export const blockedVerdicts = (a: Assessment) => a.verdicts.filter((v) => !v.allowed);

/** The approval the run waits on, if it waits on one. */
export function waitingApproval(a: Assessment): Approval | null {
  if (a.status !== "Awaiting input" || !a.waiting_request_id) return null;
  return a.approvals.find((p) => p.request_id === a.waiting_request_id) ?? null;
}

/** Approval requests that were decided, or that the run waits on now (never-reached ones are left out). */
export function approvalRows(list: Assessment[]): ApprovalRow[] {
  const rows: ApprovalRow[] = [];
  for (const a of list) {
    const waiting = waitingApproval(a);
    for (const approval of a.approvals) {
      const decision = a.decisions.find((d) => d.request_id === approval.request_id) ?? null;
      if (decision) rows.push({ assessment: a, approval, state: decision.decision, decision });
      else if (waiting?.request_id === approval.request_id) rows.push({ assessment: a, approval, state: "PENDING", decision: null });
    }
  }
  return rows;
}

/** The overview's numbers. Findings leave out false positives; review and CVSS count open ones. */
export function overview(list: Assessment[]) {
  const all = list.flatMap((a) => a.findings);
  const findings = all.filter((f) => !isFalsePositive(f));
  const confirmed = findings.filter(isConfirmed).length;
  const approvals = approvalRows(list);
  return {
    assessments: list.length,
    byStatus: statusCounts(list),
    findings: findings.length,
    confirmed,
    review: all.filter(needsReview).length,
    ...triageCounts(all),
    cvss: cvssSummary(all.filter(isOpen)),
    avgTestingMs: averageTestingMs(list),
    checks: list.reduce((n, a) => n + a.verdicts.length, 0),
    blocked: list.reduce((n, a) => n + blockedVerdicts(a).length, 0),
    granted: approvals.filter((r) => r.state === "APPROVED").length,
    rejected: approvals.filter((r) => r.state === "REJECTED").length,
    pending: approvals.filter((r) => r.state === "PENDING").length,
    requests: list.reduce((n, a) => n + a.run.requests, 0),
  };
}

/** The local calendar day of a moment, as "YYYY-MM-DD". */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const dayKey = (iso: string) => localDay(new Date(iso));

export interface DayCount {
  day: string;
  findings: number;
  assessments: number;
}

/** Findings (false positives left out) and assessments per day for the `days` days ending
    on `today` (oldest first). */
export function perDay(list: Assessment[], days: number, today: Date): DayCount[] {
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
    const onDay = list.filter((a) => dayKey(a.created_at) === key);
    out.push({ day: key, assessments: onDay.length, findings: onDay.reduce((n, a) => n + realFindings(a).length, 0) });
  }
  return out;
}

export function topReferences(findings: Finding[], limit: number): { ref: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of findings) for (const ref of new Set(f.references)) counts.set(ref, (counts.get(ref) ?? 0) + 1);
  return [...counts.entries()]
    .map(([ref, count]) => ({ ref, count }))
    .sort((a, b) => b.count - a.count || a.ref.localeCompare(b.ref))
    .slice(0, limit);
}

/** Findings grouped by weakness category, most common first. */
export function categoryCounts(findings: Finding[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of findings) {
    const name = f.category || "Uncategorized";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Highest and average CVSS base score across the findings that carry one. */
export function cvssSummary(findings: Finding[]): { max: number; avg: number; scored: number } {
  const scores = findings.map((f) => f.cvss_score).filter((s) => s > 0);
  if (!scores.length) return { max: 0, avg: 0, scored: 0 };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { max: Math.max(...scores), avg: Math.round(avg * 10) / 10, scored: scores.length };
}

/** Assessments and their findings (false positives left out) per template. */
export function byTemplate(list: Assessment[]): { name: string; assessments: number; findings: number }[] {
  const groups = new Map<string, { assessments: number; findings: number }>();
  for (const a of list) {
    const name = a.template.name || "Not chosen";
    const g = groups.get(name) ?? { assessments: 0, findings: 0 };
    g.assessments += 1;
    g.findings += realFindings(a).length;
    groups.set(name, g);
  }
  return [...groups.entries()]
    .map(([name, g]) => ({ name, ...g }))
    .sort((a, b) => b.findings - a.findings || a.name.localeCompare(b.name));
}

/** Testing time: scope approval to the end of the run (or to the last save while it runs). */
export function durationMs(a: Assessment): number | null {
  if (!a.run.started_at) return null;
  const end = a.run.finished_at ?? a.saved_at;
  const ms = Date.parse(end) - Date.parse(a.run.started_at);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** Mean testing time of the completed runs, or null when none can be timed. */
export function averageTestingMs(list: Assessment[]): number | null {
  const times = list
    .filter((a) => a.status === "Completed")
    .map(durationMs)
    .filter((ms): ms is number => ms !== null);
  return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
}

// --- run liveness ------------------------------------------------------------------------

/** A run the TUI is playing now: it moves, or it waits for the operator. */
export const isLive = (a: Assessment) => a.status === "Running" || a.status === "Awaiting input";

/** A run that has not ended (New, Running or Awaiting input). */
export const isUnfinished = (a: Assessment) => UNFINISHED.has(a.status);

/** How long an unfinished run may go without a save before it reads as interrupted. */
export const STALE_AFTER_HOURS = 12;

/** The TUI saves on every change, so an unfinished run whose file has not changed for
    `afterMs` belongs to a TUI that was killed before it could mark the file closed (its
    in-memory run can never continue). Read it as interrupted, like a closed session; if
    the TUI is in fact still open, its next save brings the run back. `afterMs <= 0` turns
    this off. */
export function markIdle(a: Assessment, now: number, afterMs: number): Assessment {
  if (afterMs <= 0 || a.session_closed || !UNFINISHED.has(a.status)) return a;
  const saved = Date.parse(a.saved_at);
  if (!Number.isFinite(saved) || now - saved <= afterMs) return a;
  return { ...a, status: "Interrupted", waiting_gate: "", waiting_request_id: "", waiting_for: "" };
}

/** Interrupted because it went quiet (`markIdle`), not because the TUI quit during it. */
export const idleInterrupted = (a: Assessment) => a.status === "Interrupted" && !a.session_closed;

/** The Assessments page's "Needs attention" status filter: runs the operator should look at. */
export const ATTENTION = "attention";
const ATTENTION_STATUSES: ReadonlySet<Status> = new Set(["Awaiting input", "Stopped", "Interrupted"]);

export type AttentionItem =
  | { kind: "waiting" | "stopped" | "interrupted"; assessment: Assessment }
  | { kind: "review"; count: number; bySeverity: Record<Severity, number> };

/** What needs the operator, one of each kind first (waiting, review, stopped, interrupted)
    so a short list still shows every kind, then the rest. `runs` counts the assessments. */
export function attentionItems(list: Assessment[]): { items: AttentionItem[]; runs: number } {
  const review = list.flatMap((a) => a.findings).filter(needsReview);
  const runs = (kind: "waiting" | "stopped" | "interrupted", status: Status): AttentionItem[] =>
    list.filter((a) => a.status === status).map((assessment) => ({ kind, assessment }));
  const groups: AttentionItem[][] = [
    runs("waiting", "Awaiting input"),
    review.length ? [{ kind: "review", count: review.length, bySeverity: severityCounts(review) }] : [],
    runs("stopped", "Stopped"),
    runs("interrupted", "Interrupted"),
  ];
  return {
    items: [...groups.flatMap((g) => g.slice(0, 1)), ...groups.flatMap((g) => g.slice(1))],
    runs: list.filter((a) => ATTENTION_STATUSES.has(a.status)).length,
  };
}

/** The timeline with one who-label per entry (an empty chat speaker continues the one above). */
export function labelTimeline(entries: TimelineEntry[]): { entry: TimelineEntry; who: string }[] {
  const out: { entry: TimelineEntry; who: string }[] = [];
  for (const entry of entries) out.push({ entry, who: timelineWho(entry.type, entry.who, out.at(-1)?.who ?? "") });
  return out;
}

export interface AssessmentFilter {
  q: string;
  template: string;
  status: string;
  range: string; // "7" | "30" | "all" (days back from `now`)
}

export function filterAssessments(list: Assessment[], f: AssessmentFilter, now: number = Date.now()): Assessment[] {
  const text = f.q.trim().toLowerCase();
  const days = Number(f.range);
  return list.filter(
    (a) =>
      (!text || `${a.label} ${a.target} ${a.target_url}`.toLowerCase().includes(text)) &&
      (!f.template || f.template === "all" || a.template.name === f.template || matchesTemplateType(a.template.name, f.template)) &&
      (!f.status || f.status === "all" || (f.status === ATTENTION ? ATTENTION_STATUSES.has(a.status) : a.status === f.status)) &&
      !(days > 0 && !(now - Date.parse(a.created_at) <= days * 86_400_000)), // unparseable dates drop out
  );
}

/** A who-label for the timeline: chat speakers and activity sources on one scale. */
export function timelineWho(type: "chat" | "activity", who: string, previous: string): string {
  if (type === "chat") {
    if (who === "you") return "YOU";
    if (who === "policy") return "POLICY";
    if (who === "reconix") return "AI";
    return previous || "AI"; // an empty speaker continues the entry above
  }
  return who === "USER" ? "YOU" : who;
}
