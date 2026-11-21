/* The AI Assistant's data from the Core API, in the run shape its cards, prompts and scope
   picker read (lib/data/schema.ts `Assessment`), so they show the API's real assessments and
   never the saved demo files. Per assessment: GET /assessments/{id}/overview, /findings,
   /actions and /timeline; the approvals once (PENDING, APPROVED, REJECTED). Only what the API
   records is filled in; the rest stays empty. Server only. */
import "server-only";

import { cache } from "react";
import { ZodError } from "zod";

import { liveRefreshMs } from "../live-refresh";
import { type Assessment, AssessmentSchema, STATUSES } from "../data/schema";
import type { Library } from "../data/store";
import { findingFacts, type FindingClassification } from "./adapt";
import { liveStatus, newestPlanRun, typeLabel } from "./assessments";
import { CoreError, coreBase, coreJson } from "./core";
import { localLibrary } from "./local";
import { asMain, sessionEpoch } from "./sessions";

const MAX_ASSESSMENTS = 50;

type Row = {
  assessment_id: string;
  engagement_code: string;
  name: string;
  type: string;
  assessment_status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  session_id: string;
  targets: string[];
  pending_approval_count: number;
};
type Overview = {
  targets: string[];
  first_started_at: string | null;
  last_finished_at: string | null;
  request_count: number;
  plan_step_count: number;
  plan_step_done_count: number;
  time_window_seconds?: number | null;
};
type CoreFinding = FindingClassification & {
  code: string;
  title: string;
  target: string;
  description: string;
  impact: string | null;
  remediation: string | null;
  validation_status: string;
  tools: string[];
  triage_note?: string;
};
type CoreAction = {
  action_id: string;
  tool: string;
  args: string[];
  target: string;
  purpose: string;
  risk_level: string | null;
  action_status: string;
  guardrail_report: Record<string, unknown>;
  created_at: string;
  approval_id: string | null;
  tool_runs: { request_count: number }[];
};
type CoreApproval = {
  approval_id: string;
  kind: string;
  subject_snapshot: Record<string, unknown>;
  subject_hash: string;
  risk_level: string | null;
  approval_status: string;
  reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  action_id: string | null;
};
type CoreEvent = { event_type: string; at: string; actor: string; details: Record<string, unknown> };
export type CoreMessage = { message_id: string; sequence_no: number; role: string; content_masked: string; created_at: string; session_id: string };

/** A run id the dashboard's links accept: "<yyyymmdd-hhmmss>-<4 hex>_<code>". */
export function uidOf(row: Pick<Row, "assessment_id" | "created_at" | "engagement_code">): string {
  const t = new Date(row.created_at);
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = Number.isNaN(t.getTime())
    ? "00000000-000000"
    : `${t.getUTCFullYear()}${two(t.getUTCMonth() + 1)}${two(t.getUTCDate())}-${two(t.getUTCHours())}${two(t.getUTCMinutes())}${two(t.getUTCSeconds())}`;
  const code = row.engagement_code.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 64) || "assessment";
  return `${stamp}-${row.assessment_id.replace(/-/g, "").slice(0, 4).toLowerCase()}_${code}`;
}

/** The API's status as the run's: an ACTIVE one with an approval waiting is "Awaiting input". */
export function statusOf(status: string, waiting: boolean): (typeof STATUSES)[number] {
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Stopped";
  if (status === "DRAFT") return "New";
  return waiting ? "Awaiting input" : "Running";
}

const STEP: Record<string, "pending" | "active" | "done"> = { COMPLETED: "done", FAILED: "done", APPROVED: "active", PENDING: "pending" };

const words = (eventType: string) => eventType.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const detail = (d: Record<string, unknown>, key: string) => (typeof d[key] === "string" ? (d[key] as string) : "");

/** A timeline event as an activity line: its author and words decide its kind (adapt.ts). */
function entryOf(e: CoreEvent, seq: number): Assessment["timeline"][number] {
  const t = e.event_type;
  const what = [detail(e.details, "tool"), detail(e.details, "target")].filter(Boolean).join(" ");
  const text = what ? `${words(t)}: ${what}` : words(t);
  const [who, tone] = /^TOOL_RUN/.test(t)
    ? ["TOOL", ""]
    : /BLOCKED/.test(t)
      ? ["POLICY", "block"]
      : /^APPROVAL/.test(t)
        ? ["POLICY", "warn"]
        : t === "SCOPE_APPROVED"
          ? ["USER", ""]
          : /^FINDING/.test(t)
            ? ["AI", ""]
            : ["SYSTEM", ""];
  return { seq, at: e.at, type: "activity", who, kind: t, text: t === "SCOPE_APPROVED" ? "Scope approved" : /^FINDING/.test(t) ? `Finding: ${what || words(t)}` : text, tone, rows: [] };
}

/** The same validated fields the Findings page displays, in the assistant's saved-run shape. */
function findingOf(f: CoreFinding) {
  const facts = findingFacts(f);
  return {
    id: f.code,
    severity: facts.severity,
    title: f.title,
    path: f.target,
    validation: f.validation_status,
    description: f.description ?? "",
    affected_url: f.target,
    impact: f.impact ?? "",
    remediation: f.remediation ?? "",
    tool: f.tools ? f.tools.join(", ") : "",
    references: facts.references,
    evidence: [],
    cvss_score: facts.score ?? 0,
    validated_cvss_score: f.finding_category ? facts.score : null,
    cvss_vector: facts.validatedCvssVector,
    cwe: facts.cwes,
    owasp: facts.owasp,
    cve: facts.cves,
    status: facts.status,
    finding_category: facts.findingCategory,
    category: facts.category,
    confidence_level: facts.confidenceLevel,
    evidence_quality: facts.evidenceQuality,
    verification_status: facts.verificationStatus,
    exploitability: facts.exploitability,
    classification_uncertainty: facts.classificationUncertainty,
    source_claims: facts.sourceClaims,
    review_history: facts.reviewHistory,
  };
}

const snap = (a: CoreApproval, key: string) => {
  const v = a.subject_snapshot[key];
  return Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : "";
};

/** One API assessment as a run. `live`: the status its newest plan run gives
 *  (assessments.ts liveStatus, the Assessments view's too); without it, the API's own status. */
export function runOf(
  row: Row,
  overview: Overview,
  findings: CoreFinding[],
  actions: CoreAction[],
  approvals: CoreApproval[],
  events: CoreEvent[],
  messagesOrLive: CoreMessage[] | (typeof STATUSES)[number] | null = [],
  liveStatusParam: (typeof STATUSES)[number] | null = null,
): Assessment {
  let messages: CoreMessage[] = [];
  let live: (typeof STATUSES)[number] | null = null;
  if (typeof messagesOrLive === "string") {
    live = messagesOrLive;
  } else if (Array.isArray(messagesOrLive)) {
    messages = messagesOrLive;
    live = liveStatusParam;
  }

  const ids = new Set(actions.map((a) => a.action_id));
  const mine = approvals.filter((a) => a.kind === "action" && a.action_id && ids.has(a.action_id));
  const pending = mine.filter((a) => a.approval_status === "PENDING");
  const status = live ?? statusOf(row.assessment_status, pending.length > 0);
  const target = overview.targets[0] ?? row.targets[0] ?? "";
  const blocked = actions.filter((a) => a.action_status === "BLOCKED");

  const chatEntries: Assessment["timeline"] = messages.map((m) => ({
    seq: 0,
    at: m.created_at,
    type: "chat" as const,
    who: m.role === "user" ? "you" : "reconix",
    kind: "text",
    text: m.content_masked,
    tone: "default",
    rows: [],
  }));
  const activityEntries = events.map(entryOf);
  const allTimeline = [...chatEntries, ...activityEntries]
    .sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      return ta - tb;
    })
    .map((e, idx) => ({ ...e, seq: idx + 1 }));

  const saved = {
    schema: "reconix.assessment/v1" as const,
    uid: uidOf(row),
    session: row.session_id,
    label: row.engagement_code,
    assessment_id: row.engagement_code,
    core_id: row.assessment_id,
    target,
    target_url: target,
    target_kind: row.type,
    template: { id: row.type, name: typeLabel(row.type), confirmed: true },
    operator: row.created_by,
    created_at: row.created_at,
    saved_at: row.updated_at,
    status,
    waiting_gate: pending.length ? "approval" : "",
    waiting_request_id: pending[0]?.approval_id ?? "",
    waiting_for: pending.length ? "an approval" : "",
    stopped_reason: "",
    run: {
      phase: "",
      started_at: overview.first_started_at,
      finished_at: overview.last_finished_at,
      completed: row.assessment_status === "COMPLETED",
      requests: overview.request_count,
      progress: overview.plan_step_count ? { plan: Math.round((100 * overview.plan_step_done_count) / overview.plan_step_count) } : {},
      report_path: "",
    },
    login: { kind: "", provided: false },
    plan: actions.map((a) => ({ key: a.action_id, label: [a.tool, a.target].filter(Boolean).join(" "), status: STEP[a.action_status] ?? "pending" })),
    scope: target
      ? {
          kind: row.type,
          target_url: target,
          assessment_type: row.type,
          status: row.assessment_status === "DRAFT" ? "DRAFT" : "APPROVED",
          allowed_actions: [],
          allowed_methods: [],
          excluded_paths: [],
          allowed_ports: [],
          time_limit_minutes: overview.time_window_seconds ? Math.round(overview.time_window_seconds / 60) : 0,
          tools: [],
        }
      : null,
    verdicts: [
      ...actions.filter((a) => a.action_status !== "BLOCKED").map((a) => ({ method: a.tool, path: a.target, allowed: true, reason: "", at: a.created_at })),
      ...blocked.map((a) => ({ method: a.tool, path: a.target, allowed: false, reason: String((a.guardrail_report as { reason?: unknown }).reason ?? "Blocked by the safety checks"), at: a.created_at })),
    ],
    approvals: mine.map((a) => ({
      request_id: a.approval_id,
      risk: a.risk_level ?? "",
      action: snap(a, "tool"),
      target: snap(a, "target"),
      method: "",
      path: snap(a, "target"),
      purpose: snap(a, "purpose"),
      impact: "",
      command: [snap(a, "tool"), snap(a, "args")].filter(Boolean).join(" "),
      command_hash: a.subject_hash,
    })),
    decisions: mine
      .filter((a) => a.approval_status === "APPROVED" || a.approval_status === "REJECTED")
      .map((a) => ({ request_id: a.approval_id, decision: a.approval_status as "APPROVED" | "REJECTED", operator: a.decided_by ?? "", reason: a.reason ?? "", command_hash: a.subject_hash, at: a.decided_at })),
    findings: findings.map(findingOf),
    timeline: allTimeline,
    requests: [],
  };
  return AssessmentSchema.parse(saved);
}

/** An ACTIVE assessment's status from its newest plan run (GET /sessions/{id}/agent-runs), as
 *  the Assessments view shows it. null for one that isn't ACTIVE, or when its session's runs
 *  can't be read (then runOf keeps the API's own status, so the run is not dropped for it). */
async function liveOf(
  row: Row,
  get: <T>(path: string) => Promise<T>,
  agentRunsBySession: Map<string, Promise<unknown>>,
): Promise<(typeof STATUSES)[number] | null> {
  if (row.assessment_status !== "ACTIVE") return null;
  try {
    let pending = agentRunsBySession.get(row.session_id);
    if (!pending) {
      pending = get<unknown>(`/sessions/${row.session_id}/agent-runs`);
      agentRunsBySession.set(row.session_id, pending);
    }
    return liveStatus(row, newestPlanRun(await pending, row.assessment_id));
  } catch {
    return null;
  }
}

const LIBRARY_CONCURRENCY = 8;

export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Why one assessment could not be shown: the API's refusal as it said it, or which of its
 *  fields didn't fit the run shape (names only, never a value). */
function problemOf(error: unknown): string {
  if (error instanceof CoreError) return `The Core API refused a call: ${error.message} (${error.code}).`;
  if (error instanceof ZodError) {
    const fields = [...new Set(error.issues.map((i) => i.path.join(".")))].slice(0, 5).join(", ");
    return `Its data doesn't fit the dashboard (${fields || "unknown field"}).`;
  }
  return "The Core API could not give all of it.";
}

const DEFAULT_LIBRARY_CACHE_TTL_MS = 5_000;
const LIBRARY_STALE_WINDOW_MS = 60_000;

type LibraryCacheState = {
  key: string;
  value: Library | null;
  freshUntil: number;
  staleUntil: number;
  inflight: Promise<Library> | null;
};

const CACHE_KEY = Symbol.for("reconix.web.apiLibraryCache");
const globalCache = globalThis as unknown as Record<symbol, LibraryCacheState | undefined>;

function cacheState(): LibraryCacheState {
  globalCache[CACHE_KEY] ??= { key: "", value: null, freshUntil: 0, staleUntil: 0, inflight: null };
  return globalCache[CACHE_KEY];
}

function libraryCacheKey(): string {
  const base = (() => {
    try {
      return coreBase();
    } catch {
      return "";
    }
  })();
  return `${base}|${sessionEpoch()}`;
}

/** Short fresh window so route switches don't re-run the full N×6 fan-out; stays shorter than fast live-refresh intervals. */
function libraryCacheTtlMs(): number {
  const refresh = liveRefreshMs();
  if (refresh > 0 && refresh < DEFAULT_LIBRARY_CACHE_TTL_MS) return Math.max(0, refresh - 200);
  return DEFAULT_LIBRARY_CACHE_TTL_MS;
}

/** Clears the in-memory library cache (used in tests). */
export function resetApiLibraryCache(): void {
  const s = cacheState();
  s.key = "";
  s.value = null;
  s.freshUntil = 0;
  s.staleUntil = 0;
  s.inflight = null;
}

function startLibraryFetch(s: LibraryCacheState, key: string, ttl: number): Promise<Library> {
  if (s.inflight) return s.inflight;
  const pending = fetchApiLibrary()
    .then((lib) => {
      if (ttl > 0 && s.key === key) {
        const now = Date.now();
        s.value = lib;
        s.freshUntil = now + ttl;
        s.staleUntil = now + LIBRARY_STALE_WINDOW_MS;
      }
      return lib;
    })
    .finally(() => {
      if (s.inflight === pending) s.inflight = null;
    });
  s.inflight = pending;
  return pending;
}

async function fetchApiLibrary(): Promise<Library> {
  const get = <T>(path: string) => asMain((token) => coreJson<T>(path, { token }));
  const [allRows, ...approvalSets] = await Promise.all([
    get<Row[]>("/assessments"),
    ...["PENDING", "APPROVED", "REJECTED"].map((s) => get<CoreApproval[]>(`/approvals?status=${s}`).catch(() => [])),
  ]);
  const rows = allRows.slice(0, MAX_ASSESSMENTS);
  if (rows.length === 0) return { dir: "Core API", readAt: Date.now(), assessments: [], problems: [] };
  const approvals = approvalSets.flat();
  const agentRunsBySession = new Map<string, Promise<unknown>>();
  const problems: Library["problems"] = [];
  const runs = await mapLimit(rows, LIBRARY_CONCURRENCY, async (row) => {
    const id = row.assessment_id;
    try {
      const [overview, findings, actions, timeline, messages, live] = await Promise.all([
        get<Overview>(`/assessments/${id}/overview`),
        get<CoreFinding[]>(`/findings?assessment_id=${id}`),
        get<CoreAction[]>(`/assessments/${id}/actions`),
        get<{ events: CoreEvent[] }>(`/assessments/${id}/timeline`),
        get<CoreMessage[]>(`/sessions/${row.session_id}/messages`).catch(() => []),
        liveOf(row, get, agentRunsBySession),
      ]);
      return runOf(row, overview, findings, actions, approvals, timeline.events, messages, live);
    } catch (error) {
      problems.push({ file: row.engagement_code, reason: problemOf(error) });
      return null;
    }
  });
  return { dir: "Core API", readAt: Date.now(), assessments: runs.filter((r): r is Assessment => r !== null), problems };
}

/** Every assessment the Core API has (newest first, at most MAX_ASSESSMENTS), as runs.
 *  Uses stale-while-revalidate in server memory so route switches never block on the N×6 fan-out
 *  after the first load (even when a background LiveRefresh is in flight). */
export const loadApiLibrary = cache(async (): Promise<Library> => {
  const s = cacheState();
  const key = libraryCacheKey();
  if (s.key !== key) {
    s.key = key;
    s.value = null;
    s.freshUntil = 0;
    s.staleUntil = 0;
    s.inflight = null;
  }
  const ttl = libraryCacheTtlMs();
  const now = Date.now();
  if (ttl > 0 && s.value) {
    if (now < s.freshUntil) return s.value;
    if (now < s.staleUntil) {
      // Serve immediately and refresh in the background so navigation never stalls.
      void startLibraryFetch(s, key, ttl).catch(() => undefined);
      return s.value;
    }
  }
  return startLibraryFetch(s, key, ttl).catch((error: unknown) => {
    // Static demo: the Core API is never there; the saved runs answer instead (read-only,
    // lib/api/local.ts), so the assistant's cards and prompts show the demo's runs.
    if (error instanceof CoreError && error.code === "OFFLINE") return localLibrary();
    throw error;
  });
});
