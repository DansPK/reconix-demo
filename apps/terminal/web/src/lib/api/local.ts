/* Demo seam (static, offline): the Core API's answer shapes, synthesized read-only from the
   saved runs. lib/api/{findings,reports,assessments}.ts fall back to these answers only when
   the Core API cannot be reached (a status-0 CoreApiError/CoreError); a reachable API that
   refuses still shows its own error, exactly as upstream. Everything here derives from the
   saved files via lib/data/store.ts (the demo's sample-data), so the dashboard's Findings and
   Reports views render the same designed UI with the demo's runs while nothing talks to a
   network. Server only. */
import "server-only";

import type { ApiAssessmentRow } from "./assessments";
import { CoreApiError } from "./client";
import type { ApiAssessment, ApiFinding } from "./findings";
import type { ApiOverview, ApiReport } from "./reports";
import type { Assessment, Finding } from "../data/schema";
import { loadLibrary } from "../data/store";

/** The saved runs' own ids (`20260929-112000-8c51_RCX-001`) double as their assessment ids:
    the routes' `<id>` place and the view matching both accept them (see isAssessmentId). */
const saved = async (): Promise<Assessment[]> => (await loadLibrary()).assessments;

const findSaved = async (assessmentId: string): Promise<Assessment | null> =>
  (await saved()).find((a) => a.uid === assessmentId || a.core_id === assessmentId) ?? null;

const notFound = (what: string) => new CoreApiError("ASSESSMENT_NOT_FOUND", `The Core API has no ${what} with that id.`);

/** A run's status on the Core API's scale. */
const apiStatus = (a: Assessment): ApiAssessmentRow["assessment_status"] =>
  a.status === "Completed" ? "COMPLETED" : a.status === "Stopped" || a.status === "Interrupted" ? "CANCELLED" : "ACTIVE";

/** The severity the reports and rows count by: the analyst's override, else the detected one. */
const effectiveSeverity = (f: Finding): string => f.effective_severity || f.severity_override || f.severity;

// --- assessments (the Findings view's picker and the all-reports table) -------------------

export async function localAssessments(): Promise<ApiAssessment[]> {
  return (await saved()).map((a) => ({
    assessment_id: a.uid,
    name: a.template.name,
    targets: [a.target_url || a.target],
    assessment_status: apiStatus(a) as ApiAssessment["assessment_status"],
    finding_count: a.findings.length,
    created_at: a.created_at,
  }));
}

// --- findings -----------------------------------------------------------------------------

const asClaims = (claims?: string[]) => claims?.map((description) => ({ description }));
const asReviews = (history?: string[]) => history?.map((finding_status) => ({ finding_status }));

function localFinding(a: Assessment, f: Finding): ApiFinding {
  const category = f.finding_category || null; // "" reads as unclassified
  return {
    finding_id: `${a.uid}~${f.id}`,
    assessment_id: a.uid,
    code: f.id,
    title: f.title,
    target: f.affected_url || f.path || a.target,
    description: f.description,
    severity_status: f.severity,
    cvss_score: f.cvss_score > 0 ? String(f.cvss_score) : null,
    cwe_ids: f.cwe,
    owasp_id: f.owasp,
    cve_ids: f.cve,
    impact: f.impact || null,
    remediation: f.remediation || null,
    validation_status: f.validation || "UNCONFIRMED",
    finding_status: f.status.toUpperCase(),
    finding_category: category,
    // The saved files predate the Core API's validated_* fields; fill them from the plain
    // ones so a classified finding keeps its severity and CVSS score.
    validated_severity_status: f.validated_severity_status ?? f.severity,
    validated_cwe_ids: f.validated_cwe_ids ?? f.cwe,
    validated_cve_ids: f.validated_cve_ids ?? f.cve,
    validated_cvss_score: f.validated_cvss_score ?? f.cvss_score,
    validated_cvss_vector: f.validated_cvss_vector ?? f.cvss_vector ?? null,
    confidence_level: f.confidence_level ?? null,
    evidence_quality: f.evidence_quality ?? null,
    verification_status: f.verification_status ?? null,
    exploitability: f.exploitability ?? null,
    classification_uncertainty: f.classification_uncertainty ?? null,
    source_claims: asClaims(f.source_claims),
    review_history: asReviews(f.review_history),
    tools: f.tool ? [f.tool] : [],
    evidence: f.evidence.map((content) => ({ kind: "log", content, location: null })),
    // Demo: the raw values behind the masked evidence, swapped in by the detail screen's
    // "Reveal attacker's view" toggle. Exports re-mask (lib/report/mask.ts).
    evidence_unmasked: f.evidence_unmasked,
    effective_verification: f.effective_verification
      ? {
          ...f.effective_verification,
          proof_lines: f.effective_verification.proof_lines ?? [],
          legacy: Boolean(f.effective_verification.legacy),
        }
      : undefined,
    ai_notes: f.ai_notes
      ? {
          ...f.ai_notes,
          explanation: f.ai_notes.explanation ?? "",
          impact: f.ai_notes.impact ?? "",
          remediation: f.ai_notes.remediation ?? "",
          uncertainty: f.ai_notes.uncertainty ?? "",
          evidence_summary: f.ai_notes.evidence_summary ?? "",
          evidence_refs: f.ai_notes.evidence_refs ?? [],
        }
      : undefined,
    latest_validation: null,
  };
}

export async function localFindings(assessmentId: string | null): Promise<ApiFinding[]> {
  const all = await saved();
  const chosen = assessmentId ? all.filter((a) => a.uid === assessmentId || a.core_id === assessmentId) : all;
  if (assessmentId && chosen.length === 0) throw notFound("assessment");
  return chosen.flatMap((a) => a.findings.map((f) => localFinding(a, f)));
}

// --- the Report view ----------------------------------------------------------------------

export async function localReports(assessmentId: string): Promise<ApiReport[]> {
  const a = await findSaved(assessmentId);
  if (!a) throw notFound("assessment");
  return a.reports.map((r) => ({
    report_id: r.report_id,
    version: r.version,
    report_status: r.report_status,
    executive_summary: null,
    methodology: a.methodology.join("\n") || null,
    formats: r.formats,
    generated_by: a.operator,
    generated_at: r.generated_at,
    created_at: r.generated_at ?? a.saved_at,
    assessment_id: a.uid,
    assessment_ids: [a.uid],
    review_status: (["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const).find((s) => s === r.review_status) ?? null,
    signed_off: r.signed_off,
  }));
}

export async function localOverview(assessmentId: string): Promise<ApiOverview> {
  const a = await findSaved(assessmentId);
  if (!a) throw notFound("assessment");
  const counted = a.findings.filter((f) => f.finding_category !== "FALSE_POSITIVE" && f.status !== "false-positive");
  const bySeverity: Record<string, number> = {};
  for (const f of counted) {
    const level = effectiveSeverity(f);
    bySeverity[level] = (bySeverity[level] ?? 0) + 1;
  }
  const started = a.run.started_at ? Date.parse(a.run.started_at) : NaN;
  const finished = a.run.finished_at ? Date.parse(a.run.finished_at) : NaN;
  const durationSeconds = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, Math.round((finished - started) / 1000)) : 0;
  const masked = a.findings.reduce((n, f) => n + f.evidence.filter((line) => /•|masked/i.test(line)).length, 0);
  return {
    assessment: {
      assessment_id: a.uid,
      name: a.template.name,
      engagement_code: a.label,
      assessment_status: apiStatus(a) as ApiOverview["assessment"]["assessment_status"],
      created_at: a.created_at,
    },
    targets: [a.target_url || a.target],
    finding_count: counted.length,
    findings_by_severity: bySeverity,
    findings_by_validation: {},
    plan_step_count: a.plan.length,
    plan_step_done_count: a.plan.filter((p) => p.status === "done").length,
    tool_run_count: Object.keys(a.run.progress).length,
    request_count: a.run.requests,
    masked_count: masked,
    pending_approval_count: 0,
    duration_seconds: durationSeconds,
  };
}

// --- the Assessments view's live rows ------------------------------------------------------

/** The Core API's assessment rows, synthesized from the saved runs (ids pass through as the
    saved uids, so the live poll matches the rows the page already shows). */
export async function localAssessmentRows(): Promise<ApiAssessmentRow[]> {
  const all = await saved();
  const worst = (a: Assessment): ApiAssessmentRow["worst_severity"] => {
    const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE", "UNKNOWN"];
    const levels = a.findings.filter((f) => f.finding_category !== "FALSE_POSITIVE").map((f) => effectiveSeverity(f));
    return (order.find((level) => levels.includes(level)) ?? null) as ApiAssessmentRow["worst_severity"];
  };
  return all.map((a) => ({
    assessment_id: a.uid,
    engagement_code: a.label,
    name: a.template.name,
    type: a.template.id,
    assessment_status: apiStatus(a),
    created_at: a.created_at,
    session_id: a.session,
    targets: [a.target_url || a.target],
    finding_count: a.findings.filter((f) => f.finding_category !== "FALSE_POSITIVE").length,
    worst_severity: worst(a),
    pending_approval_count: 0,
    plan_step_count: a.plan.length,
    plan_step_done_count: a.plan.filter((p) => p.status === "done").length,
    last_activity_at: a.saved_at,
  }));
}

/** The assistant's library, straight from the saved files (the demo's runs are what the
    assistant's cards, prompts and scope picker show). */
export { loadLibrary as localLibrary };
