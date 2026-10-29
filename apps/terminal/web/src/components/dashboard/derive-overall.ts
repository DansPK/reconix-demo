/**
 * The Overview for every saved assessment at once (the default: no `?uid=`). It makes the same
 * card data as deriveDashboard (OverviewCards), totalled over all runs, plus the counts the top
 * bar shows. Pure, like derive.ts: no I/O, no invented numbers.
 *
 * The Activity Timeline counts the runs started per day (per week past MAX_DAYS days), stacked
 * by run status; the Execution Timeline lists the newest runs.
 */
import { longDuration, shortDay } from "@/lib/data/format";
import { STATUSES } from "@/lib/data/schema";
import { localDay } from "@/lib/data/stats";
import type { AssessmentView, Status } from "@/lib/data/view-types";
import { RUN_STATUS, toneColor } from "@/lib/status";

import { countTicks } from "./axis";
import { toolsNamed } from "./event-kinds";
import {
  type FindingRow,
  findingRow,
  findingsSlice,
  findingsSummary,
  MAX_QUESTIONS,
  plural,
  runEntry,
  toolCaption,
} from "./derive";
import { runLink } from "./derive-shared";
import type { ActivityCard, DayBar, ExecutionCard, OverviewCards, Pattern, SummaryStrip } from "./overview-types";

const DAY = 86_400_000;
const MAX_DAYS = 45; // a wider span is counted per week
const MAX_TICKS = 8; // labels along the day axis
export const LATEST_RUNS = 8; // rows of the Execution Timeline

export type CountRow = { name: string; count: number };

/** Run statuses that share a colour (lib/status.ts) get different fills in the stacked day
    bars: Waiting for you solid and Interrupted striped (both amber), Stopped solid and Not
    started striped (both slate). */
export const RUN_PATTERN: Record<Status, Pattern> = {
  New: "stripes",
  Running: "solid",
  "Awaiting input": "solid",
  Completed: "solid",
  Stopped: "solid",
  Interrupted: "stripes",
};

export interface Overall {
  runs: number;
  waiting: number;
  completed: number;
  findingTotal: number; // every finding (false positives left out)
  operator: string; // the newest run's operator
  operators: string[];
  targets: CountRow[];
  templates: CountRow[];
  statuses: CountRow[];
  findings: FindingRow[]; // every run's findings, newest run first
  cards: OverviewCards;
}

/** How many runs share each value, most common first (ties keep first-seen order). */
function countRows(values: string[]): CountRow[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/** Local midnight of the day `ms` falls on. */
function midnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Runs started per day (or week), oldest first, every slot in between included. */
function activityDays(views: AssessmentView[]): ActivityCard {
  const oldestFirst = [...views].sort((a, b) => a.createdMs - b.createdMs);
  const first = midnight(oldestFirst[0].createdMs);
  const last = midnight(oldestFirst[oldestFirst.length - 1].createdMs);
  const dayCount = Math.round((last - first) / DAY) + 1; // DST shifts round away
  const unit = dayCount > MAX_DAYS ? "week" : "day";
  const per = unit === "week" ? 7 : 1;
  const slots = Math.ceil(dayCount / per);
  const slotOf = (ms: number) => Math.floor(Math.round((midnight(ms) - first) / DAY) / per);
  const width = 1 / slots;
  const days: DayBar[] = Array.from({ length: slots }, (_, i) => {
    const startMs = new Date(first).setDate(new Date(first).getDate() + i * per);
    const here = oldestFirst.filter((v) => slotOf(v.createdMs) === i);
    const label = unit === "week" ? `week of ${shortDay(startMs)}` : shortDay(startMs);
    const segments = STATUSES.map((status) => ({
      status,
      count: here.filter((v) => v.status === status).length,
      color: toneColor(RUN_STATUS[status].tone),
      pattern: RUN_PATTERN[status],
    })).filter((s) => s.count > 0);
    const states = segments.map((s) => `${s.count} ${RUN_STATUS[s.status].label.toLowerCase()}`).join(", ");
    return {
      key: localDay(new Date(startMs)),
      label,
      pos: (i + 0.5) * width,
      width,
      total: here.length,
      segments,
      title: here.length ? `${label} · ${plural(here.length, "run")}: ${states}` : `${label} · no runs`,
      runs: here.map(runEntry),
    };
  });
  const step = Math.ceil(slots / MAX_TICKS);
  const busiest = Math.max(1, ...days.map((d) => d.total));
  const axis = countTicks(busiest);
  const present = STATUSES.filter((s) => views.some((v) => v.status === s));
  const window = first === last ? shortDay(first) : `${shortDay(first)} → ${shortDay(last)}`;
  return {
    mode: "days",
    days,
    ticks: days.filter((_, i) => i % step === 0).map((d) => ({ pos: d.pos, label: unit === "week" ? d.label.replace("week of ", "") : d.label })),
    yTicks: axis.ticks,
    max: axis.top,
    unit,
    total: views.length,
    window,
    summary: `Assessments started per ${unit}, ${window}: ${plural(views.length, "run")}, busiest ${unit} ${busiest}.`,
    legend: present.map((s) => ({
      label: RUN_STATUS[s].label,
      color: toneColor(RUN_STATUS[s].tone),
      hint: RUN_STATUS[s].hint,
      shape: "bar" as const,
      pattern: RUN_PATTERN[s],
      meaning: RUN_STATUS[s],
      count: views.filter((v) => v.status === s).length,
    })),
  };
}

/** The newest runs, one row each. */
function executionRuns(views: AssessmentView[]): ExecutionCard {
  const newest = [...views].sort((a, b) => b.createdMs - a.createdMs).slice(0, LATEST_RUNS);
  return {
    mode: "runs",
    runs: newest.map(runEntry),
    caption: views.length > newest.length ? `Latest ${newest.length} of ${views.length} runs` : plural(views.length, "run"),
    summary: `The ${plural(newest.length, "newest run")}: ${newest.map((v) => `${v.id} ${RUN_STATUS[v.status].label.toLowerCase()} ${v.progress}%`).join(", ")}.`,
    legend: [{ label: "Plan done", color: "var(--primary)", hint: "How much of the run's plan finished.", shape: "bar" }],
  };
}

/** Every saved run's Overview. `views` is the library (newest first); it must not be empty. */
export function deriveOverall(views: AssessmentView[]): Overall {
  const n = views.length;
  const waiting = views.filter((v) => v.status === "Awaiting input").length;
  const completed = views.filter((v) => v.status === "Completed").length;

  // findings across runs (each keyed by its run)
  const findings = views.flatMap((v) =>
    v.findings.map((f) => findingRow(f, runLink(v))),
  );
  const findingCards = findingsSlice(findings);

  // tools and time, every run
  const toolSteps = views.reduce((s, v) => s + v.log.filter((l) => l.kind === "tool").length, 0);
  const tools = [...new Set(views.flatMap((v) => toolsNamed(v.log.filter((l) => l.kind === "tool").map((l) => l.text), v.scope?.tools ?? [])))];
  const requests = views.reduce((s, v) => s + v.requests, 0);
  const totalSec = views.reduce((s, v) => s + v.durationSec, 0);
  const longest = views.reduce((a, b) => (b.durationSec > a.durationSec ? b : a));
  const overLimit = views.filter((v) => v.scope && v.durationSec > v.scope.windowMinutes * 60).length;
  const unfinished = STATUSES.filter((s) => s !== "Completed")
    .map((status: Status) => ({ status, count: views.filter((v) => v.status === status).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const summary: SummaryStrip = {
    findings: findingsSummary(findings),
    progress: {
      pct: Math.round((completed / n) * 100),
      caption: `${completed} of ${plural(n, "run")} completed`,
      status: null,
      other: unfinished[0] ?? null,
    },
    tools: {
      steps: toolSteps,
      tools,
      requests,
      running: views.some((v) => v.status === "Running"),
      caption: toolCaption(requests),
    },
    duration: {
      value: longDuration(totalSec),
      countup: totalSec < 3600,
      meter:
        longest.scope && longest.scope.windowMinutes > 0
          ? { frac: Math.min(1, longest.durationSec / (longest.scope.windowMinutes * 60)), over: longest.durationSec > longest.scope.windowMinutes * 60 }
          : null,
      over: overLimit,
    },
  };

  const approvedScopes = views.filter((v) => v.scope?.approved).length;
  const targets = countRows(views.map((v) => v.target || "—"));
  const operators = [...new Set(views.map((v) => v.operator).filter((o) => o && o !== "—"))];
  const operator = operators[0] ?? "—";
  const severe = findingCards.severity.some((s) => (s.level === "CRITICAL" || s.level === "HIGH") && s.count > 0);

  return {
    runs: n,
    waiting,
    completed,
    findingTotal: summary.findings.total,
    operator,
    operators,
    targets,
    templates: countRows(views.map((v) => v.template)),
    statuses: STATUSES.map((s) => ({ name: s, count: views.filter((v) => v.status === s).length })).filter((s) => s.count > 0),
    findings,
    cards: {
      mode: "all",
      summary,
      ask: {
        label: "Ask about your assessments",
        scope: {
          ok: approvedScopes === n,
          text: approvedScopes === n ? "Every scope approved" : `${approvedScopes} of ${n} scopes approved`,
        },
        reach: targets.length === 1 ? "1 target" : `${targets.length} targets`,
        questions: overallQuestions({
          n,
          waiting,
          blocked: views.some((v) => v.checks.blocked > 0),
          severe,
          review: summary.findings.needsReview,
        }),
      },
      activity: activityDays(views),
      execution: executionRuns(views),
      findings: findingCards,
    },
  };
}

/** Example questions for the Ask bar, about what the saved runs hold. */
function overallQuestions(s: { n: number; waiting: number; blocked: boolean; severe: boolean; review: number }): string[] {
  const out: string[] = [];
  if (s.waiting) out.push("Which assessments are waiting on me?");
  if (s.severe) out.push("Which runs found high-risk issues?");
  if (s.blocked) out.push("What did the policy block across runs?");
  if (s.review) out.push("Which findings still need review?");
  out.push(s.n > 1 ? "Compare my last two assessments" : "Summarize this assessment");
  return out.slice(0, MAX_QUESTIONS);
}
