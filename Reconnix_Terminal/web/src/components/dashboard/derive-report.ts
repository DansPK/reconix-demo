/**
 * The Report view (ReportCards, report-types.ts) for one saved run or for every saved run at
 * once. Pure, like derive.ts: every number counts what the saved files hold. The policy verdicts
 * are not summed here (they left the Overview too); they stay in the saved files, the TUI and
 * the downloaded reports.
 *
 * "Masked evidence" counts the activity log's masking lines (the run masking a sensitive value
 * before it saved it), not the values themselves.
 */
import { redact } from "@/lib/assistant/redact";
import { duration, hourMinute, minutesLimit, shortDay } from "@/lib/data/format";
import { SEVERITIES } from "@/lib/data/schema";
import type { AssessmentView, FindingView, LibraryItem, Severity } from "@/lib/data/view-types";
import { FINDING_REVIEW, RUN_STATUS, scopeMeaning, SEVERITY_META, STEP_STATUS } from "@/lib/status";

import type { FindingRow } from "./derive";
import { findingsSummary } from "./derive";
import { plural, runLink, statusBadge } from "./derive-shared";
import { toolsNamed } from "./event-kinds";
import { reviewLabel, sortFindings, validationOf } from "./filters";
import type { EventBadge, FindingsSlice } from "./overview-types";
import type { AssessmentsCards, ReportCards, ReportFindingRow, ReportRunRow, ReportTargetRow } from "./report-types";
import type { Stat } from "./stat-types";

/** The Report view's Findings by Severity lists the top 3 CVSS findings (one run and every run
    alike); the Overview's card keeps its own longer list (derive.ts). */
export const REPORT_TOP_FINDINGS = 3;

/** The Overview's Findings by Severity with the top list cut to the Report view's length. */
export const reportSlice = (slice: FindingsSlice): FindingsSlice => ({ ...slice, top: slice.top.slice(0, REPORT_TOP_FINDINGS) });

const masked = (v: AssessmentView) => v.log.filter((l) => l.kind === "mask").length;
const counted = (v: AssessmentView) => v.findings.filter((f) => !f.falsePositive);

/** The worst severity among findings (false positives left out), or null. */
export function worstOf(levels: Severity[]): Severity | null {
  return SEVERITIES.find((s) => levels.includes(s)) ?? null; // CRITICAL first
}

/** The Findings card of the strip: the total (like the Overview's strip), the worst severity
    and what needs review. */
function findingsStat(rows: FindingView[]): Stat {
  const s = findingsSummary(rows);
  const badges: EventBadge[] = [];
  if (s.worst) badges.push({ type: "severity", level: s.worst.level });
  if (s.needsReview) badges.push(statusBadge(FINDING_REVIEW.review, `${s.needsReview} need review`));
  return {
    label: "Findings",
    icon: "findings",
    value: String(s.total),
    format: "int",
    unit: null,
    badges,
    meter: null,
    note: s.worst ? `${s.worst.count} ${SEVERITY_META[s.worst.level].label.toLowerCase()} · worst severity` : "No findings yet",
    link: { view: "findings", filters: {}, label: "Open the findings" },
  };
}

function maskedStat(n: number, note: string): Stat {
  return { label: "Masked evidence", icon: "masked", value: String(n), format: "int", unit: null, badges: [], meter: null, note, link: null };
}

function findingRows(rows: FindingRow[]): ReportFindingRow[] {
  return sortFindings(rows).map((f) => ({
    key: f.key,
    id: f.id,
    title: f.title,
    severity: f.severity,
    review: { ...FINDING_REVIEW[validationOf(f)], label: reviewLabel(f) },
    tool: f.tool,
    cwe: f.cwe,
    rating: f.rating,
    falsePositive: f.falsePositive,
  }));
}

/** The findings table's count: the findings (false positives left out, so it is the strip's
    number), with the false positives it lists beside it ("7 findings + 1 false positive"). */
export function reportFindingsMeta(rows: Pick<ReportFindingRow, "falsePositive">[]): string {
  const fp = rows.filter((r) => r.falsePositive).length;
  const counted = plural(rows.length - fp, "finding");
  return fp ? `${counted} + ${plural(fp, "false positive")}` : counted;
}

// --- one run -------------------------------------------------------------------------------

export function reportCards(v: AssessmentView, findings: FindingRow[], slice: FindingsSlice): ReportCards {
  const done = v.phases.filter((p) => p.status === "done").length;
  const total = v.phases.length;
  const tools = toolsNamed(
    v.log.filter((l) => l.kind === "tool").map((l) => l.text),
    v.scope?.tools ?? [],
  );
  const window = v.scope && v.scope.windowMinutes > 0 ? minutesLimit(v.scope.windowMinutes) : null;
  return {
    mode: "run",
    uid: v.uid,
    tag: `${v.id} · ${redact(v.target)}`,
    about: `The summary of ${v.id} from its saved copy. Download the full report in the format you need.`,
    stats: [
      findingsStat(findings),
      {
        label: "Plan steps",
        icon: "steps",
        value: `${done}/${total}`,
        format: "none",
        unit: null,
        badges: [{ type: "status", meaning: RUN_STATUS[v.status] }],
        meter: total ? { frac: v.progress / 100, over: false, label: "Plan done" } : null,
        note: total ? `${v.progress}% of the plan done` : "No plan yet",
        link: null,
      },
      {
        label: "Requests sent",
        icon: "requests",
        value: String(v.requests),
        format: "int",
        unit: null,
        badges: [],
        meter: null,
        note: v.requests === 0 ? "No request sent yet" : tools.length ? `by ${tools.join(", ")}` : "by the approved tools",
        link: null,
      },
      maskedStat(masked(v), masked(v) ? "times the run masked sensitive values before saving" : "Nothing needed masking"),
    ],
    details: [
      { label: "Assessment", value: v.id, badge: null },
      { label: "Target", value: redact(v.target), badge: null },
      { label: "Template", value: v.template, badge: null },
      ...(v.apiSpec
        ? [{ label: "API spec", value: `${v.apiSpec.label} · ${v.apiSpec.endpoints} endpoints`, badge: null }]
        : []),
      { label: "Status", value: "", badge: { type: "status", meaning: RUN_STATUS[v.status] } },
      { label: "Started", value: v.startedAt, badge: null },
      { label: "Duration", value: window ? `${duration(v.durationSec)} of ${window}` : duration(v.durationSec), badge: null },
      { label: "Operator", value: v.operator, badge: null },
      {
        label: "Scope",
        value: v.scope ? `${v.scope.include.length} in scope · ${v.scope.exclude.length} excluded` : "",
        badge: { type: "status", meaning: scopeMeaning(v.scope?.status ?? null) },
      },
    ],
    plan: v.phases.map((p) => ({ key: p.key, label: p.label, state: STEP_STATUS[p.status], pct: p.pct })),
    findings: reportSlice(slice),
    rows: findingRows(findings),
  };
}

// --- every run -----------------------------------------------------------------------------

function targetRows(views: AssessmentView[]): ReportTargetRow[] {
  const groups = new Map<string, AssessmentView[]>();
  for (const v of views) groups.set(v.target || "—", [...(groups.get(v.target || "—") ?? []), v]);
  return [...groups.entries()]
    .map(([target, runs]) => {
      const found = runs.flatMap(counted);
      const newest = runs.reduce((a, b) => (b.createdMs > a.createdMs ? b : a));
      return { target: redact(target), runs: runs.length, findings: found.length, worst: worstOf(found.map((f) => f.severity)), latest: runLink(newest) };
    })
    .sort((a, b) => b.findings - a.findings || b.runs - a.runs);
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

/** `views` is the library (newest first); it must not be empty. `runs` are its rows (runRow),
    made once by the page for this view and the Assessments view. */
export function overallReportCards(views: AssessmentView[], slice: FindingsSlice, runs: ReportRunRow[] = views.map(runRow)): ReportCards {
  const n = views.length;
  const completed = views.filter((v) => v.status === "Completed").length;
  const waiting = views.filter((v) => v.status === "Awaiting input").length;
  const targets = targetRows(views);
  const templates = new Set(views.map((v) => v.template)).size;
  const requests = views.reduce((s, v) => s + v.requests, 0);
  const runBadges: EventBadge[] = [statusBadge(RUN_STATUS.Completed, `${completed} completed`)];
  if (waiting) runBadges.push(statusBadge(RUN_STATUS["Awaiting input"], `${waiting} waiting for you`));
  return {
    mode: "all",
    tag: `All ${plural(n, "run")}`,
    about: `Reports are made per run: open one for its full report and downloads, or download it from the table. Pick up to five runs to combine them into one report.`,
    stats: [
      {
        label: "Runs",
        icon: "runs",
        value: String(n),
        format: "int",
        unit: null,
        badges: runBadges,
        meter: null,
        note: `${plural(targets.length, "target")} · ${plural(templates, "template")}`,
        link: null,
      },
      findingsStat(views.flatMap((v) => v.findings)),
      {
        label: "Requests sent",
        icon: "requests",
        value: String(requests),
        format: "int",
        unit: null,
        badges: [],
        meter: null,
        note: `by the approved tools in ${plural(n, "run")}`,
        link: null,
      },
      maskedStat(
        views.reduce((s, v) => s + masked(v), 0),
        "times the runs masked sensitive values before saving",
      ),
    ],
    findings: reportSlice(slice),
    targets,
    runs,
  };
}
