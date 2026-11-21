/* The Core API's assessments and findings, read for the Findings view (server only).

   Each answer is checked against the fields this view reads (docs/openapi.json AssessmentRowOut
   and FindingOut); one that doesn't match fails loudly as BAD_RESPONSE rather than showing a
   half-read list. shortcut: hand-written subset of the contract until `gen-api-types`
   (openapi-typescript) is set up; switch to the generated types then. */
import "server-only";

import { cache } from "react";
import { z } from "zod";

import { requireSignedIn } from "../auth/guard";
import { apiGet, CoreApiError } from "./client";
import { localAssessments, localFindings } from "./local";

const str = z.string();
const opt = z.string().nullable();

export const SEVERITY_STATUS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE", "UNKNOWN"] as const;

const AssessmentRow = z.object({
  assessment_id: str,
  name: str,
  targets: z.array(str),
  assessment_status: str,
  finding_count: z.number(),
  created_at: str,
});
export type ApiAssessment = z.infer<typeof AssessmentRow>;

const Evidence = z.object({ kind: str, content: opt, location: opt });
const SourceClaim = z.object({
  source_tool: opt.optional(),
  scanner_id: opt.optional(),
  title: opt.optional(),
  description: opt.optional(),
  source_severity: opt.optional(),
  source_cwe_ids: z.array(str).optional(),
  source_cve_ids: z.array(str).optional(),
  source_cvss_score: z.union([str, z.number()]).nullable().optional(),
  source_cvss_vector: opt.optional(),
}).passthrough();
const ReviewHistory = z.object({
  previous_status: opt.optional(),
  finding_status: opt.optional(),
  reviewed_by: opt.optional(),
  reviewed_at: opt.optional(),
  created_at: opt.optional(),
}).passthrough();

const EffectiveVerification = z
  .object({
    status: opt.optional(),
    kind: opt.optional(),
    subject: z.record(z.string(), z.unknown()).nullable().optional(),
    verifier: opt.optional(),
    proof_lines: z.array(str).optional().default([]),
    legacy: z.boolean().optional().default(false),
    reason: opt.optional(),
  })
  .passthrough()
  .optional();
export type ApiEffectiveVerification = z.infer<typeof EffectiveVerification>;

const AiNotes = z
  .object({
    schema_version: z.number().optional(),
    explanation: str.optional().default(""),
    impact: str.optional().default(""),
    remediation: str.optional().default(""),
    uncertainty: str.optional().default(""),
    evidence_summary: str.optional().default(""),
    suggested_category: opt.optional(),
    evidence_refs: z.array(str).optional().default([]),
    model: opt.optional(),
    provider_type: opt.optional(),
    agent_run_id: opt.optional(),
    created_at: opt.optional(),
  })
  .passthrough()
  .optional();
export type ApiAiNotes = z.infer<typeof AiNotes>;

const ValidationRunOut = z
  .object({
    validation_run_id: str.optional(),
    tool: opt.optional(),
    proof_lines: z.array(str).optional().default([]),
    method: str.optional(),
    validation_status: str.optional(),
    reason: opt.optional(),
  })
  .passthrough()
  .nullable()
  .optional();
export type ApiValidationRun = z.infer<typeof ValidationRunOut>;

const FindingOut = z.object({
  finding_id: str,
  assessment_id: str,
  code: str,
  title: str,
  target: str,
  description: str,
  severity_status: z.enum(SEVERITY_STATUS),
  cvss_score: opt,
  cwe_ids: z.array(str),
  owasp_id: z.array(str),
  cve_ids: z.array(str),
  impact: opt,
  remediation: opt,
  validation_status: str,
  finding_status: str,
  finding_category: str.nullable().optional(),
  validated_severity_status: z.enum(SEVERITY_STATUS).nullable().optional(),
  validated_cwe_ids: z.array(str).nullish(),
  validated_cve_ids: z.array(str).nullish(),
  validated_cvss_score: z.union([str, z.number()]).nullable().optional(),
  validated_cvss_vector: opt.optional(),
  confidence_level: str.nullable().optional(),
  evidence_quality: str.nullable().optional(),
  verification_status: str.nullable().optional(),
  exploitability: str.nullable().optional(),
  classification_uncertainty: opt.optional(),
  source_claims: z.array(SourceClaim).optional(),
  review_history: z.array(ReviewHistory).optional(),
  tools: z.array(str).optional().default([]),
  evidence: z.array(Evidence).optional().default([]),
  // Demo: the raw values behind the masked evidence (the detail screen's "Reveal attacker's
  // view" toggle); absent on real Core API rows.
  evidence_unmasked: z.array(str).optional(),
  effective_verification: EffectiveVerification,
  ai_notes: AiNotes,
  latest_validation: ValidationRunOut,
});
export type ApiFinding = z.infer<typeof FindingOut>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A saved run's own id (`20260929-112000-8c51_RCX-001`): in the static demo these double as
    the assessment ids the routes and addresses use (the demo synthesizes the Core API's
    answers from the saved files, src/lib/api/local.ts). */
const SAVED_UID = /^\d{8}-\d{6}-[0-9a-f]{4}_[A-Za-z0-9-]{1,64}$/i;
export const isAssessmentId = (value: unknown): value is string =>
  typeof value === "string" && (UUID.test(value) || SAVED_UID.test(value));

export function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new CoreApiError("BAD_RESPONSE", `The Core API's ${what} don't match docs/openapi.json.`);
  return r.data;
}

/** GET /assessments: every assessment the API knows, as the API orders them. Unreachable in
    the static demo: the saved runs answer instead (src/lib/api/local.ts). */
export const listAssessments = cache(async (): Promise<ApiAssessment[]> => {
  await requireSignedIn(); // a second lock behind src/proxy.ts, as lib/data/store.ts
  try {
    return parse(z.array(AssessmentRow), await apiGet("/assessments"), "assessments");
  } catch (error) {
    if (error instanceof CoreApiError && error.code === "OFFLINE") return localAssessments();
    throw error;
  }
});

/** GET /findings, for one assessment or (null) every one. */
export const listFindings = cache(async (assessmentId: string | null): Promise<ApiFinding[]> => {
  await requireSignedIn();
  if (assessmentId !== null && !isAssessmentId(assessmentId)) throw new CoreApiError("BAD_REQUEST", "Not an assessment id.");
  const query = assessmentId ? `?assessment_id=${encodeURIComponent(assessmentId)}` : "";
  try {
    return parse(z.array(FindingOut), await apiGet(`/findings${query}`), "findings");
  } catch (error) {
    if (error instanceof CoreApiError && error.code === "OFFLINE") return localFindings(assessmentId);
    throw error;
  }
});
