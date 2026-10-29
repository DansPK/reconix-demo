/**
 * Every number and chart series the dashboard shows, derived from one saved assessment
 * (src/lib/data/adapt.ts → AssessmentView). Components read numbers only from the Dashboard
 * this returns; none holds a literal number. If a design element needs a value the saved
 * assessment doesn't record, it does not go on the page.
 *
 * The Overview reads only `cards` (OverviewCards, overview-types.ts): derive-overall.ts makes
 * the same shape from every saved run at once, so one set of components draws either. The two
 * timelines are derived in derive-activity.ts and derive-execution.ts.
 *
 * Runs on the server (src/app/page.tsx) and hands plain data to the views, so every label,
 * including clock times, is computed once, here. Log text is masked again here
 * (lib/assistant/redact.ts) on top of what the TUI's snapshot already masked. Positions on the
 * time axis are fractions (0 = the run's first log line, 1 = its last).
 */
import { redact } from "@/lib/assistant/redact";
import { clock, duration, hourMinute, minutesLimit, shortDay } from "@/lib/data/format";
import { SEVERITIES } from "@/lib/data/schema";
import type { ApprovalView, AssessmentView, FindingView, PhaseView, ScopeView } from "@/lib/data/view-types";

import { activityCard } from "./derive-activity";
import { executionCard } from "./derive-execution";
import { plural } from "./derive-shared";
import { toolsNamed } from "./event-kinds";
import type { FindingsSlice, OverviewCards, RunEntry, SummaryStrip } from "./overview-types";

export type * from "./overview-types";
export { plural };

/** The assessment templates the TUI offers (the Template chip lists them). */
export const TEMPLATES = ["Network", "API", "Source Code", "Web URL"] as const;

export const MAX_QUESTIONS = 3;
const TOP_FINDINGS = 8; // the card shows as many as its height allows (3 at least)

export type FindingIcon = "bug" | "code" | "database";
/** A finding as listed: `key` is unique in the list (the ID for one run, `<uid>~<ID>` across
    runs) and `run` names the assessment it came from when the list spans several. */
export type FindingRow = FindingView & { icon: FindingIcon; key: string; run: { uid: string; label: string } | null };

export interface Dashboard {
  assessment: {
    uid: string;
    id: string;
    name: string;
    target: string;
    template: string;
    status: AssessmentView["status"];
    unfinished: boolean;
    progress: number;
    startedAt: string;
    duration: string;
    operator: string;
    scopeApproved: boolean;
    window: string | null;
  };
  phases: PhaseView[];
  findingTotal: number; // every finding (false positives left out)
  severity: FindingsSlice["severity"];
  requests: number;
  minutes: { used: number; max: number | null; over: boolean };
  scope: ScopeView | null;
  approvals: ApprovalView[];
  gate: { time: string; text: string } | null;
  findings: FindingRow[];
  cards: OverviewCards;
}

// --- shared helpers (derive-overall.ts uses them too) ------------------------------------

function findingIcon(f: FindingView): FindingIcon {
  const about = `${f.category} ${f.title}`;
  if (/secret|credential|password|database|data|exposure|redis/i.test(about)) return "database";
  if (/inject|xss|script|code|sql/i.test(about)) return "code";
  return "bug";
}

/** A finding as a list row; `run` set when the list spans several assessments. */
export function findingRow(f: FindingView, run: FindingRow["run"] = null): FindingRow {
  return { ...f, icon: findingIcon(f), key: run ? `${run.uid}~${f.id}` : f.id, run };
}

/** Findings by Severity, over the four SEVERITIES (Critical first, each even at 0): counts and
    shares by severity, review state and the top CVSS scores. False positives are left out of
    every count, so its total is the summary strip's (findingsSummary). */
export function findingsSlice(rows: FindingRow[]): FindingsSlice {
  const counted = rows.filter((f) => !f.falsePositive);
  const total = counted.length;
  const severity = SEVERITIES.map((level) => {
    const count = counted.filter((f) => f.severity === level).length;
    return { level, count, share: total ? Math.round((count / total) * 100) : 0, frac: total ? count / total : 0 };
  });
  const top = counted
    .filter((f): f is FindingRow & { score: number } => f.score !== null && f.status !== "fixed")
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_FINDINGS)
    .map((f) => ({ key: f.key, id: f.id, title: f.title, severity: f.severity, score: f.score, run: f.run?.label ?? null }));
  const confirmed = counted.filter((f) => f.confirmed).length;
  const needsReview = counted.filter((f) => f.needsReview).length;
  return {
    total,
    severity,
    words: severity.map((s) => `${s.count} ${s.level.toLowerCase()}`).join(", "),
    review: { confirmed, needsReview, closed: total - confirmed - needsReview },
    top,
  };
}

/** The summary strip's Findings card: every finding (false positives left out, so the same
    total as Findings by Severity), the worst severity present and how many need review. */
export function findingsSummary(rows: Pick<FindingView, "severity" | "falsePositive" | "needsReview">[]): SummaryStrip["findings"] {
  const counted = rows.filter((f) => !f.falsePositive);
  const worst = SEVERITIES.find((level) => counted.some((f) => f.severity === level)) ?? null;
  return {
    total: counted.length,
    worst: worst ? { level: worst, count: counted.filter((f) => f.severity === worst).length } : null,
    needsReview: counted.filter((f) => f.needsReview).length,
    link: { view: "findings", filters: {}, label: "Open all findings" },
  };
}

/** The "requests sent" part of the Tool execution card. */
export const toolCaption = (requests: number) => `${plural(requests, "request")} sent by the tools`;

/** A saved run as a row: the execution rows (every run) and a day's runs. */
export function runEntry(v: AssessmentView): RunEntry {
  return {
    uid: v.uid,
    id: v.id,
    template: v.template,
    time: hourMinute(v.createdMs),
    when: `${shortDay(v.createdMs)} ${hourMinute(v.createdMs)}`,
    status: v.status,
    progress: v.progress,
    steps: { done: v.phases.filter((p) => p.status === "done").length, total: v.phases.length },
    findings: v.findings.filter((f) => !f.falsePositive).length,
    target: redact(v.target),
    waiting: v.gate ? redact(v.gate.text) : "",
  };
}

// --- the dashboard -------------------------------------------------------------------------

export function deriveDashboard(v: AssessmentView): Dashboard {
  const pos = (sec: number) => Math.min(1, Math.max(0, sec / v.spanSec));
  const clockAt = (p: number) => clock(v.startMs + p * v.spanSec * 1000);
  // a run of ten minutes or more is labelled in minutes ("14:03"), a short one in seconds
  const labelAt = (p: number) => (v.spanSec >= 600 ? hourMinute(v.startMs + p * v.spanSec * 1000) : clockAt(p));
  const log = v.log;

  // findings (false positives are left out of every count)
  const findings = v.findings.map((f) => findingRow(f));
  const findingCards = findingsSlice(findings);

  // run budget
  const windowLimit = v.scope ? minutesLimit(v.scope.windowMinutes) : null;
  const usedMinutes = Math.round(v.durationSec / 60);
  const maxMinutes = v.scope ? v.scope.windowMinutes : null;
  const over = maxMinutes !== null && v.durationSec > maxMinutes * 60;
  const minutes = { used: usedMinutes, max: maxMinutes, over };
  const planSteps = { done: v.phases.filter((p) => p.status === "done").length, total: v.phases.length };

  const toolLines = log.filter((l) => l.kind === "tool");
  const tools = v.scope?.tools ?? [];
  const durationText = duration(v.durationSec);
  const summary: SummaryStrip = {
    findings: findingsSummary(findings),
    progress: {
      pct: v.progress,
      caption: planSteps.total ? `${planSteps.done} of ${plural(planSteps.total, "plan step")} done` : "No plan yet",
      status: v.status,
      other: null,
    },
    tools: {
      steps: toolLines.length,
      tools: toolsNamed(toolLines.map((l) => l.text), tools),
      requests: v.requests,
      running: v.status === "Running",
      caption: toolCaption(v.requests),
    },
    duration: {
      value: durationText,
      countup: true,
      meter: maxMinutes ? { frac: Math.min(1, v.durationSec / (maxMinutes * 60)), over } : null,
      over: over ? 1 : 0,
    },
  };

  const scopeApproved = v.scope?.approved ?? false;
  const inScope = v.scope?.include.length ?? 0;

  return {
    assessment: {
      uid: v.uid,
      id: v.id,
      name: v.name,
      target: v.target,
      template: v.template,
      status: v.status,
      unfinished: v.unfinished,
      progress: v.progress,
      startedAt: v.startedAt,
      duration: durationText,
      operator: v.operator,
      scopeApproved,
      window: windowLimit,
    },
    phases: v.phases,
    findingTotal: summary.findings.total,
    severity: findingCards.severity,
    requests: v.requests,
    minutes,
    scope: v.scope,
    approvals: v.approvals,
    gate: v.gate,
    findings,
    cards: {
      mode: "run",
      summary,
      ask: {
        label: "Ask about this assessment",
        scope: { ok: scopeApproved, text: scopeApproved ? `Scope approved · ${v.operator}` : "Scope not approved yet" },
        reach: `${inScope} in scope`,
        questions: questionsFor(v, findingCards.top[0]?.id),
      },
      activity: activityCard(v, pos, labelAt),
      execution: executionCard(v, pos, labelAt),
      findings: findingCards,
    },
  };
}

/** Example questions for the Ask bar, about what this run actually holds. */
function questionsFor(v: AssessmentView, topFinding: string | undefined): string[] {
  const out: string[] = [];
  if (v.gate) out.push("What is this run waiting for?");
  if (topFinding) out.push(`Show the evidence for ${topFinding}`);
  if (v.checks.blocked) out.push("What did the policy block, and why?");
  if (v.findings.some((f) => f.needsReview)) out.push("Which findings still need review?");
  out.push(v.template !== "—" ? `Summarize this ${v.template} assessment` : "What happens after the target is set?");
  return out.slice(0, MAX_QUESTIONS);
}
