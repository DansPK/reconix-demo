/* The Core API's assessments for the Assessments view (server only): GET /assessments, checked
   against every field the row shows (docs/openapi.json AssessmentRowOut), then turned into the
   view's own row (ReportRunRow) so the components don't change. One that doesn't match fails
   loudly as BAD_RESPONSE. shortcut: hand-written subset of the contract until `gen-api-types`
   is set up; switch to the generated types then.

   The status: an assessment stays ACTIVE until a person finishes it (PATCH /assessments/{id}),
   so ACTIVE alone does not say whether anything still runs. Each plan step is one agent run
   (plan.task PLAN or SUGGEST, services/plans.py), so for an ACTIVE one the row reads its
   session's agent runs (GET /sessions/{id}/agent-runs) and shows its newest plan run's status
   (liveStatus). */
import "server-only";

import { z } from "zod";

import type { ReportRunRow } from "@/components/dashboard/report-types";
import { redact } from "@/lib/assistant/redact";
import { hourMinute, shortDay } from "@/lib/data/format";

import { requireSignedIn } from "../auth/guard";
import { apiGet, CoreApiError } from "./client";
import { isAssessmentId, parse, SEVERITY_STATUS } from "./findings";
import { localAssessmentRows } from "./local";

type Status = ReportRunRow["status"];

const str = z.string();
const count = z.number().int().nonnegative();

const AssessmentListRow = z.object({
  assessment_id: str,
  engagement_code: str,
  name: str,
  type: str,
  assessment_status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]),
  created_at: str,
  session_id: str,
  targets: z.array(str),
  finding_count: count,
  worst_severity: z.enum(SEVERITY_STATUS).nullable(),
  pending_approval_count: count,
  plan_step_count: count,
  plan_step_done_count: count,
  last_activity_at: str,
});
export type ApiAssessmentRow = z.infer<typeof AssessmentListRow>;

/** A run id the dashboard's links accept: "<yyyymmdd-hhmmss>-<4 hex>_<code>". In the static
    demo the saved runs answer for the Core API (lib/api/local.ts) and their ids already are
    that shape, so they pass through. */
export function uidOfRow(a: Pick<ApiAssessmentRow, "assessment_id" | "created_at" | "engagement_code">): string {
  if (/^\d{8}-\d{6}-[0-9a-f]{4}_[A-Za-z0-9-]{1,64}$/i.test(a.assessment_id)) return a.assessment_id;
  const t = new Date(a.created_at);
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = Number.isNaN(t.getTime())
    ? "00000000-000000"
    : `${t.getUTCFullYear()}${two(t.getUTCMonth() + 1)}${two(t.getUTCDate())}-${two(t.getUTCHours())}${two(t.getUTCMinutes())}${two(t.getUTCSeconds())}`;
  const code = a.engagement_code.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 64) || "assessment";
  return `${stamp}-${a.assessment_id.replace(/-/g, "").slice(0, 4).toLowerCase()}_${code}`;
}

/** GET /assessments: every assessment the API knows, as the API orders them. Unreachable in
    the static demo: the saved runs answer instead (lib/api/local.ts). */
export async function listAssessmentRows(): Promise<ApiAssessmentRow[]> {
  await requireSignedIn(); // a second lock behind src/proxy.ts
  try {
    return parse(z.array(AssessmentListRow), await apiGet("/assessments"), "assessments");
  } catch (error) {
    if (error instanceof CoreApiError && error.code === "OFFLINE") return localAssessmentRows();
    throw error;
  }
}

const AgentRunStatus = z.enum(["RUNNING", "WAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"]);
const AgentRunRow = z.object({
  agent_runs_status: AgentRunStatus,
  assessment_id: str.nullable(),
  started_at: str,
  plan: z.record(str, z.unknown()).nullable(),
});

/** The runs that plan or suggest a step (services/plans.py AgentTask.PLAN, SUGGEST); chat,
 *  analysis, report and code runs, and the run a person's own actions share, don't count. */
const PLAN_TASKS = new Set(["PLAN", "SUGGEST"]);

/** An assessment's newest plan run: its status and when it started; null when it has none. */
export type PlanRun = { status: z.infer<typeof AgentRunStatus>; startedAt: string } | null;

/** An answer of GET /sessions/{id}/agent-runs → the assessment's newest plan run (checked
 *  against AgentRunOut: BAD_RESPONSE when it doesn't match). Pure. */
export function newestPlanRun(answer: unknown, assessmentId: string): PlanRun {
  const runs = parse(z.array(AgentRunRow), answer, "agent runs")
    .filter((r) => r.assessment_id === assessmentId && PLAN_TASKS.has(String(r.plan?.task ?? "")))
    .sort((x, y) => Date.parse(y.started_at) - Date.parse(x.started_at));
  return runs[0] ? { status: runs[0].agent_runs_status, startedAt: runs[0].started_at } : null;
}

/** GET /sessions/{id}/agent-runs: the assessment's newest plan run. */
export async function readPlanRun(a: Pick<ApiAssessmentRow, "assessment_id" | "session_id">): Promise<PlanRun> {
  await requireSignedIn();
  if (!isAssessmentId(a.assessment_id) || !isAssessmentId(a.session_id)) throw new CoreApiError("BAD_RESPONSE", "The Core API sent an assessment without a valid id.");
  return newestPlanRun(await apiGet(`/sessions/${encodeURIComponent(a.session_id)}/agent-runs`), a.assessment_id);
}

/** A plan run still RUNNING after this long was cut off: the API's own rule
 *  (services/plans.py STALE_MINUTES), applied when the next plan starts. */
export const STALE_MS = 30 * 60_000;

const RUN_STATUS: Record<z.infer<typeof AgentRunStatus>, Status> = {
  RUNNING: "Running",
  WAITING_APPROVAL: "Awaiting input",
  COMPLETED: "Completed",
  FAILED: "Interrupted", // e.g. RUN_CUT_OFF, or the agent or tool failed mid-step
  CANCELLED: "Stopped",
};

/** The status the row shows. Not ACTIVE: as the API says. ACTIVE: Awaiting input while an
 *  approval waits; else the newest plan run's status (RUNNING past STALE_MS: Interrupted, the
 *  TUI was killed mid-step); New with no plan run yet. */
export function liveStatus(a: { assessment_status: string; pending_approval_count: number }, run: PlanRun, now = Date.now()): Status {
  if (a.assessment_status === "COMPLETED") return "Completed";
  if (a.assessment_status === "CANCELLED") return "Stopped";
  if (a.assessment_status === "DRAFT") return "New";
  if (a.pending_approval_count > 0) return "Awaiting input";
  if (run === null) return "New";
  if (run.status === "RUNNING" && now - Date.parse(run.startedAt) > STALE_MS) return "Interrupted";
  return RUN_STATUS[run.status];
}

const ACRONYMS = new Set(["url", "api", "ip", "ad"]);

/** The assessment type as a label: "web_url" → "Web URL". */
export function typeLabel(type: string): string {
  const words = type.split(/[_\s-]+/).filter(Boolean);
  return words.map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(" ") || "—";
}

/** Every Assessments row, newest first: the list, plus each ACTIVE one's newest plan run for its
 *  status. Read on the page and again by the view's live poll (app/api/core-assessments/route.ts). */
export async function loadAssessmentRows(): Promise<ReportRunRow[]> {
  const listed = (await listAssessmentRows()).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const agentRunsBySession = new Map<string, Promise<unknown>>();
  const runs = await Promise.all(
    listed.map((a) => {
      if (a.assessment_status !== "ACTIVE") return null;
      if (!isAssessmentId(a.assessment_id) || !isAssessmentId(a.session_id)) return null;
      let pending = agentRunsBySession.get(a.session_id);
      if (!pending) {
        pending = apiGet(`/sessions/${encodeURIComponent(a.session_id)}/agent-runs`);
        agentRunsBySession.set(a.session_id, pending);
      }
      return pending.then((answer) => newestPlanRun(answer, a.assessment_id)).catch(() => null);
    }),
  );
  return listed.map((a, i) => assessmentRunRow(a, runs[i]));
}

/** One API assessment as an Assessments row; the row opens its overview. */
export function assessmentRunRow(a: ApiAssessmentRow, run: PlanRun): ReportRunRow {
  const ms = Date.parse(a.created_at);
  const waiting = a.pending_approval_count;
  const uid = uidOfRow(a);
  return {
    uid,
    id: a.name || a.engagement_code,
    template: typeLabel(a.type),
    target: redact(a.targets.join(", ")) || "—",
    status: liveStatus(a, run),
    when: Number.isNaN(ms) ? "—" : `${shortDay(ms)} ${hourMinute(ms)}`,
    waiting: waiting ? `${waiting} approval${waiting === 1 ? "" : "s"}` : "",
    findings: a.finding_count, // the API leaves false positives out
    worst: a.worst_severity,
    steps: { done: a.plan_step_done_count, total: a.plan_step_count },
    href: `/?uid=${encodeURIComponent(uid)}`,
  };
}
