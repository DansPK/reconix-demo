/* The shape of one saved assessment (schema "reconix.assessment/v1").
   It mirrors reconix/store/snapshot.py; every file is checked against it before use,
   so a malformed or foreign file is reported and skipped instead of breaking a page.
   A run that was still going when the TUI quit (`session_closed`) can never continue,
   so it is read as "Interrupted". An informational finding from an older file is dropped as
   the file is read (`withoutInfo`), so nothing past this module ever sees one. */
import { z } from "zod";

/** The severity scale, worst first: these four, everywhere (the TUI's too). */
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
/** What a saved finding's `severity` may hold: older TUIs also wrote INFO. Such a file still
    loads, but its INFO findings are left out of every list, count, chart and report. */
export const SAVED_SEVERITIES = [...SEVERITIES, "INFO"] as const;
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
  // Enriched fields (older saved files predate them, so each has a default).
  cvss_score: z.number().default(0),
  cvss_vector: text.default(""),
  category: text.default(""),
  cwe: z.array(text).default([]),
  owasp: z.array(text).default([]),
  cve: z.array(text).default([]),
  status: text.default("open"),
  severity_override: text.default(""),
  effective_severity: text.default(""),
  triage_note: text.default(""),
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

const TimelineEntrySchema = z.object({
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
export type Status = (typeof STATUSES)[number];
type SavedFinding = z.infer<typeof FindingSchema>;
/** A finding as the dashboard reads it: every severity field on the four-level scale (the
    analyst's two are "" when unset). */
export type Finding = Omit<SavedFinding, "severity" | "severity_override" | "effective_severity"> & {
  severity: Severity;
  severity_override: Severity | "";
  effective_severity: Severity | "";
};

export const isSeverity = (value: string): value is Severity => (SEVERITIES as readonly string[]).includes(value);

/** An informational finding from an older saved file: INFO (in any case) as its detected,
    overridden or effective severity. It is dropped, never remapped to another level. */
export const isInfoFinding = (f: { severity: string; severity_override?: string; effective_severity?: string }) =>
  [f.severity, f.severity_override ?? "", f.effective_severity ?? ""].some((s) => s.trim().toUpperCase() === "INFO");

/** The saved findings as the dashboard reads them: the informational ones dropped, and an
    analyst's severity that is not one of the four read as unset. */
export function withoutInfo(findings: SavedFinding[]): Finding[] {
  const level = (s: string): Severity | "" => (isSeverity(s) ? s : "");
  return findings.flatMap((f) =>
    isInfoFinding(f) || !isSeverity(f.severity)
      ? []
      : [{ ...f, severity: f.severity, severity_override: level(f.severity_override), effective_severity: level(f.effective_severity) }],
  );
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
