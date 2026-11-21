/* The shape of one saved assessment (schema "reconix.assessment/v1").
   It mirrors reconix/store/snapshot.py; every file is checked against it before use,
   so a malformed or foreign file is reported and skipped instead of breaking a page.
   A run that was still going when the TUI quit (`session_closed`) can never continue,
   so it is read as "Interrupted". An informational finding from an older file is dropped as
   the file is read (`withoutInfo`), so nothing past this module ever sees one. */
import { z } from "zod";

/** The severity scale, worst first: these four, everywhere (the TUI's too). */
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
/** A finding's severity as the Core API records it: the four levels plus `UNKNOWN` (the tool gave
    no rating) and `NONE` (informational). Both are shown, never dropped â€” the same six the TUI's
    `store/findings.py` SEVERITY_ORDER holds, worst first, so an unrated finding sorts after LOW. */
export const FINDING_SEVERITIES = [...SEVERITIES, "NONE", "UNKNOWN"] as const;
/** What a saved finding's `severity` may hold: the six, plus INFO, which older TUIs wrote and the
    reader drops (`withoutInfo`). Such a file still loads, but its INFO findings are left out of
    every list, count, chart and report. */
export const SAVED_SEVERITIES = [...FINDING_SEVERITIES, "INFO"] as const;
export const STATUSES = ["New", "Running", "Awaiting input", "Completed", "Stopped", "Interrupted"] as const;
/** Statuses of a run that has not ended (it can still move, unless its TUI is gone). */
export const UNFINISHED: ReadonlySet<string> = new Set(["New", "Running", "Awaiting input"]);

const text = z.string().max(20_000);
const isoTime = z.string().max(40);

export const FindingSchema = z.object({
  id: text,
  severity: z.enum(SAVED_SEVERITIES),
  title: text,
  path: text,
  validation: text,
  description: text,
  affected_url: text,
  impact: text,
  remediation: text,
  tool: text,
  references: z.array(text),
  evidence: z.array(text),
  evidence_summary: text.default(""),
  // Demo field: raw values behind the masked `evidence`, revealed by the detail
  // screen's "Reveal attacker's view" toggle. Never exported (lib/report/mask.ts re-masks).
  evidence_unmasked: z.array(text).default([]),
  // Enriched fields (older saved files predate them, so each has a default).
  cvss_score: z.number().default(0),
  cvss_vector: text.default(""),
  validated_severity_status: z.enum(FINDING_SEVERITIES).nullish(),
  validated_cvss_score: z.number().nullish(),
  validated_cvss_vector: text.nullish(),
  validated_cwe_ids: z.array(text).nullish(),
  validated_cve_ids: z.array(text).nullish(),
  finding_category: text.nullish(),
  confidence_level: text.optional(),
  evidence_quality: text.optional(),
  verification_status: text.optional(),
  exploitability: text.optional(),
  classification_uncertainty: text.optional(),
  source_claims: z.array(text).optional(),
  review_history: z.array(text).optional(),
  category: text.default(""),
  cwe: z.array(text).default([]),
  owasp: z.array(text).default([]),
  cve: z.array(text).default([]),
  status: text.default("open"),
  severity_override: text.default(""),
  effective_severity: text.default(""),
  triage_note: text.default(""),
  effective_verification: z
    .object({
      status: text.nullable().optional(),
      kind: text.nullable().optional(),
      subject: z.record(z.string(), z.unknown()).nullable().optional(),
      verifier: text.nullable().optional(),
      proof_lines: z.array(text).optional(),
      legacy: z.boolean().optional(),
      reason: text.nullable().optional(),
    })
    .nullable().transform((value) => value ?? undefined).optional(),
  ai_notes: z
    .object({
      schema_version: z.number().optional(),
      explanation: text.optional().default(""),
      impact: text.optional().default(""),
      remediation: text.optional().default(""),
      uncertainty: text.optional().default(""),
      evidence_summary: text.optional().default(""),
      suggested_category: text.nullable().optional(),
      evidence_refs: z.array(text).optional().default([]),
      model: text.nullable().optional(),
    })
    .passthrough()
    .optional(),
});

const ScopeSchema = z.object({
  kind: text,
  target_url: text,
  assessment_type: text,
  status: text,
  allowed_actions: z.array(text),
  allowed_methods: z.array(text),
  excluded_paths: z.array(text),
  allowed_ports: z.array(z.number()),
  time_limit_minutes: z.number(),
  tools: z.array(text),
});

/** The OpenAPI file an operator attached to an API run: a summary, never the file. */
const ApiSpecSchema = z.object({
  title: text,
  version: text,
  spec_version: text,
  endpoints: z.number(),
  methods: z.array(text),
  servers: z.array(text),
});

export const TimelineEntrySchema = z.object({
  seq: z.number(),
  at: isoTime.nullable(),
  type: z.enum(["chat", "activity"]),
  who: text,
  kind: text,
  text: text,
  tone: text,
  rows: z.array(z.tuple([text, text])),
});

const SavedAssessmentSchema = z.object({
  schema: z.literal("reconix.assessment/v1"),
  uid: text,
  session: text,
  label: text,
  assessment_id: text,
  target: text,
  target_url: text,
  target_kind: text,
  template: z.object({ id: text, name: text, confirmed: z.boolean() }),
  api_spec: ApiSpecSchema.nullish(),
  operator: text,
  client: text.default(""),
  mode: text.default(""),
  methodology: z.array(text).default([]),
  report_version: text.default("1.0"),
  created_at: isoTime,
  saved_at: isoTime,
  status: z.enum(STATUSES),
  waiting_gate: text.default(""),
  waiting_request_id: text.default(""),
  waiting_for: text,
  stopped_reason: text,
  session_closed: z.boolean().default(false),
  core_id: text.default(""),
  run: z.object({
    phase: text,
    started_at: isoTime.nullable(),
    finished_at: isoTime.nullable(),
    completed: z.boolean(),
    requests: z.number(),
    progress: z.record(z.string(), z.number()),
    report_path: text,
  }),
  login: z.object({ kind: text, provided: z.boolean() }),
  // Demo field: the saved run's report versions, which drive the Report view's version
  // list and the signed-off check on the export route (formats render from saved data).
  reports: z
    .array(
      z.object({
        report_id: text,
        version: z.number().int().positive(),
        report_status: z.enum(["GENERATING", "READY", "FAILED"]),
        review_status: text.nullable(),
        signed_off: z.boolean(),
        formats: z.array(z.enum(["PDF", "DOCX", "JSON"])),
        generated_at: isoTime.nullable(),
      }),
    )
    .default([]),
  plan: z.array(z.object({ key: text, label: text, status: z.enum(["pending", "active", "done"]) })),
  scope: ScopeSchema.nullable(),
  verdicts: z.array(z.object({ method: text, path: text, allowed: z.boolean(), reason: text, at: isoTime.nullable() })),
  approvals: z.array(
    z.object({
      request_id: text,
      risk: text,
      action: text,
      target: text,
      method: text,
      path: text,
      purpose: text,
      impact: text,
      command: text,
      command_hash: text,
    }),
  ),
  decisions: z.array(
    z.object({
      request_id: text,
      decision: z.enum(["APPROVED", "REJECTED"]),
      operator: text,
      reason: text,
      command_hash: text,
      at: isoTime.nullable(),
    }),
  ),
  findings: z.array(FindingSchema),
  timeline: z.array(TimelineEntrySchema),
  requests: z.array(z.object({ text, at: isoTime.nullable() })),
});

export type Severity = (typeof SEVERITIES)[number];
/** A finding's severity on the whole scale, so an unrated one is still a severity the UI can show. */
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export type Status = (typeof STATUSES)[number];
type SavedFinding = z.infer<typeof FindingSchema>;
/** A finding as the dashboard reads it: its severity on the whole scale, the analyst's two on the
    four levels ("" when unset). */
export type Finding = Omit<SavedFinding, "severity" | "severity_override" | "effective_severity"> & {
  severity: FindingSeverity;
  severity_override: Severity | "";
  effective_severity: Severity | "";
};

export const isSeverity = (value: string): value is Severity => (SEVERITIES as readonly string[]).includes(value);
export const isFindingSeverity = (value: string): value is FindingSeverity => (FINDING_SEVERITIES as readonly string[]).includes(value);

/** An informational finding from an older saved file: INFO (in any case) as its detected,
    overridden or effective severity. It is dropped, never remapped to another level. */
export const isInfoFinding = (f: { severity: string; severity_override?: string; effective_severity?: string }) =>
  [f.severity, f.severity_override ?? "", f.effective_severity ?? ""].some((s) => s.trim().toUpperCase() === "INFO");

/** The saved findings as the dashboard reads them: the informational (INFO) ones dropped, an
    analyst's severity that is not one of the four read as unset, and UNKNOWN and NONE kept â€”
    only INFO is ever dropped. */
export function withoutInfo(findings: SavedFinding[]): Finding[] {
  const level = (s: string): Severity | "" => (isSeverity(s) ? s : "");
  return findings.flatMap((f): Finding[] => {
    if (isInfoFinding(f) || !isFindingSeverity(f.severity)) return [];
    return [{ ...f, severity: f.severity, severity_override: level(f.severity_override), effective_severity: level(f.effective_severity) }];
  });
}

export const AssessmentSchema = SavedAssessmentSchema.transform((saved) => {
  const a = { ...saved, findings: withoutInfo(saved.findings) };
  return a.session_closed && UNFINISHED.has(a.status)
    ? { ...a, status: "Interrupted" as const, waiting_gate: "", waiting_request_id: "", waiting_for: "" }
    : a;
});
export type Assessment = z.output<typeof AssessmentSchema>;
export type TimelineEntry = Assessment["timeline"][number];
export type Approval = Assessment["approvals"][number];
export type Decision = Assessment["decisions"][number];
