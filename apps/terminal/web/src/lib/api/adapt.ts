/* Core API answers → the Findings view's rows. Pure: no I/O, no invented values. Translating
   happens here only: UPPERCASE ERD V3 enums stay UPPERCASE (UNKNOWN and NONE severities are
   shown), except the triage status, which becomes the view's own words (lib/data/stats.ts). */
import { findingIcon, type ListedFinding } from "@/components/dashboard/derive";
import { plural } from "@/components/dashboard/derive-shared";
import type { EventBadge } from "@/components/dashboard/overview-types";
import type { Stat } from "@/components/dashboard/stat-types";
import { redact } from "@/lib/assistant/redact";
import { evidenceTone } from "@/lib/data/adapt";
import { duration, hourMinute, shortDay } from "@/lib/data/format";
import { type FindingSeverity, isFindingSeverity, SEVERITIES } from "@/lib/data/schema";
import { type Meaning, REPORT_REVIEW, REPORT_STATUS, SEVERITY_META } from "@/lib/status";

import type { ApiAssessment, ApiFinding } from "./findings";
import type { ApiOverview, ApiReport, ReportFormat } from "./reports";

const TRIAGE: Record<string, string> = { OPEN: "open", FIXED: "fixed", FALSE_POSITIVE: "false-positive" };

/** The API's `severity_status` on the web's scale: UPPERCASE ERD V3, and anything off it (a value
    this web does not know yet) reads as UNKNOWN — the tool gave no rating — so one unexpected
    word never drops a run. The TUI's `core_api/adapt.py::severity` does the same. */
export function severityOf(value: string): FindingSeverity {
  const level = value.trim().toUpperCase();
  return isFindingSeverity(level) ? level : "UNKNOWN";
}

/** The assessment a row came from, as the "all assessments" list names it. */
export function runOf(a: Pick<ApiAssessment, "assessment_id" | "name">): NonNullable<ListedFinding["run"]> {
  const id = a.assessment_id;
  return { uid: id, label: a.name || id.slice(0, 8), href: `/findings/${encodeURIComponent(id)}` };
}

/** The assessment picker's choices ("Juice Shop web · 12": its findings, false positives left out). */
export const pickerItems = (assessments: ApiAssessment[]) => assessments.map((a) => ({ id: a.assessment_id, label: `${a.name || a.assessment_id.slice(0, 8)} · ${a.finding_count}` }));

export type FindingClassification = Pick<ApiFinding,
  "finding_category" | "validated_severity_status" | "validated_cvss_score" | "validated_cvss_vector" |
  "validated_cwe_ids" | "validated_cve_ids" | "confidence_level" | "evidence_quality" |
  "verification_status" | "exploitability" | "classification_uncertainty" | "source_claims" | "review_history" |
  "effective_verification" | "ai_notes"
> & {
  severity_status: string;
  cvss_score: string | number | null;
  cwe_ids: string[];
  cve_ids: string[];
  owasp_id: string[];
  finding_status: string;
};

/** Select the API's validated facts once, for both the Findings page and the assistant's runs. */
export function findingFacts(f: FindingClassification) {
  const classified = f.finding_category != null;
  const rawScore = classified ? f.validated_cvss_score : f.cvss_score;
  const numericalScore = rawScore == null ? NaN : Number(rawScore);
  const score = Number.isFinite(numericalScore) && (classified || numericalScore > 0) ? numericalScore : null;
  const cwes = (classified ? f.validated_cwe_ids : f.cwe_ids) ?? [];
  const cves = (classified ? f.validated_cve_ids : f.cve_ids) ?? [];
  const owasp = classified ? [] : f.owasp_id ?? [];
  const falsePositive = f.finding_status === "FALSE_POSITIVE" || f.finding_category === "FALSE_POSITIVE";
  const findingCategory = falsePositive ? "FALSE_POSITIVE" : f.finding_category ?? "INSUFFICIENT_EVIDENCE";
  const status = TRIAGE[f.finding_status] ?? f.finding_status;
  const sourceClaims = (f.source_claims ?? []).map((claim) => {
    const values = [
      claim.scanner_id, claim.title, claim.description,
      claim.source_severity ? `severity ${claim.source_severity}` : "",
      claim.source_cvss_score == null ? "" : `CVSS ${claim.source_cvss_score}`,
      claim.source_cvss_vector ?? "",
      ...(claim.source_cwe_ids ?? []),
      ...(claim.source_cve_ids ?? []),
    ].filter(Boolean);
    return redact(`${claim.source_tool || "Scanner"}: ${values.join(" · ") || "claim recorded"}`);
  });
  const reviewHistory = (f.review_history ?? []).map((review) => {
    const time = review.reviewed_at ?? review.created_at ?? "";
    const transition = [review.previous_status, review.finding_status].filter(Boolean).join(" → ");
    const reviewer = review.reviewed_by ? `by ${review.reviewed_by}` : "";
    return redact([time, transition, reviewer].filter(Boolean).join(" · ") || "Review recorded");
  });
  return {
    severity: severityOf(classified ? f.validated_severity_status ?? "UNKNOWN" : f.severity_status),
    findingCategory,
    confidenceLevel: f.confidence_level ?? "UNKNOWN",
    evidenceQuality: f.evidence_quality ?? "UNKNOWN",
    verificationStatus: f.verification_status ?? "UNKNOWN",
    exploitability: f.exploitability ?? "UNKNOWN",
    classificationUncertainty: f.classification_uncertainty ?? "",
    validatedCvssVector: classified ? f.validated_cvss_vector ?? "" : "",
    sourceClaims, reviewHistory, cwes, cves, owasp, score, status, falsePositive,
    confirmed: findingCategory === "CONFIRMED_VULNERABILITY",
    category: classified ? findingCategory : owasp[0] ?? "",
    references: [...new Set([...cwes, ...owasp, ...cves])],
  };
}

export function preferredProofLine(proofLines?: string[] | null): string | undefined {
  if (!proofLines || proofLines.length === 0) return undefined;
  const nonMarker = proofLines.find((line) => {
    const s = line.trim();
    return !s.startsWith("Start ") && !s.startsWith("Done ");
  });
  return nonMarker ?? proofLines[0];
}

export function apiFindingRow(f: ApiFinding, run: ListedFinding["run"] = null): ListedFinding {
  const { cwes, score, status, confirmed, falsePositive, category, ...facts } = findingFacts(f);
  const id = f.code || f.finding_id.slice(0, 8);
  const ev = f.effective_verification;
  const effectiveVerification = ev
    ? {
        status: ev.status ?? null,
        kind: ev.kind ?? null,
        subject: ev.subject ?? null,
        verifier: ev.verifier ?? null,
        proofLines: ev.proof_lines ?? [],
        legacy: Boolean(ev.legacy),
        reason: ev.reason ?? null,
      }
    : undefined;
  const notes = f.ai_notes;
  const aiNotes = notes
    ? {
        schemaVersion: notes.schema_version,
        explanation: notes.explanation ?? "",
        impact: notes.impact ?? "",
        remediation: notes.remediation ?? "",
        uncertainty: notes.uncertainty ?? "",
        evidenceSummary: notes.evidence_summary ?? "",
        suggestedCategory: notes.suggested_category ?? null,
        evidenceRefs: notes.evidence_refs ?? [],
        model: notes.model ?? null,
      }
    : undefined;
  return {
    ...facts,
    id,
    key: run ? `${run.uid}~${id}` : id,
    run,
    icon: findingIcon({ category, title: f.title }),
    title: f.title,
    target: f.target || "—",
    tool: f.tools.join(", ") || "—",
    cwe: cwes[0] ?? "—",
    category,
    score,
    rating: score === null ? "no CVSS" : `CVSS ${score.toFixed(1)}`,
    validation: f.validation_status,
    confirmed,
    needsReview: status === "open" && !confirmed && !falsePositive,
    falsePositive,
    status,
    description: f.description,
    impact: f.impact ?? "",
    evidenceSummary: notes?.evidence_summary || f.evidence.find((e) => e.kind === "analysis_summary")?.content || "",
    evidence: f.evidence.flatMap((e) => {
      if (e.kind === "analysis_summary") return [];
      const text = [e.location, e.content].filter(Boolean).join("\n");
      return text ? [{ text, tone: evidenceTone(e.content ?? text) }] : [];
    }),
    // Demo: the raw values behind the masked evidence, revealed by the detail screen's
    // "Reveal attacker's view" toggle (synthesized rows carry them, lib/api/local.ts).
    evidenceUnmasked: (f.evidence_unmasked ?? []).map((text) => ({ text, tone: evidenceTone(text) })),
    remediation: (f.remediation ?? "")
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean),
    effectiveVerification,
    aiNotes,
  };
}

/** Every row, named by its code (`F-001`, as links and the address show it); a code two findings
    of one assessment share (the API doesn't make codes unique) falls back to its finding_id. With
    `across` (the assessments), each row also names the assessment it came from. */
export function apiFindingRows(findings: ApiFinding[], across: ApiAssessment[] | null = null): ListedFinding[] {
  const byId = new Map((across ?? []).map((a) => [a.assessment_id, a]));
  const seen = new Map<string, number>();
  for (const f of findings) seen.set(`${f.assessment_id}~${f.code}`, (seen.get(`${f.assessment_id}~${f.code}`) ?? 0) + 1);
  return findings.map((f) => {
    const run = across ? runOf(byId.get(f.assessment_id) ?? { assessment_id: f.assessment_id, name: "" }) : null;
    const row = apiFindingRow(f, run);
    if ((seen.get(`${f.assessment_id}~${f.code}`) ?? 0) < 2) return row;
    return { ...row, key: run ? `${run.uid}~${f.finding_id}` : f.finding_id };
  });
}

const when = (iso: string | null) => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? `${shortDay(ms)} ${hourMinute(ms)}` : "—";
};

/** The Report view's summary strip, from GET /assessments/{id}/overview (false positives are
    already left out of its finding counts). */
export function overviewStats(o: ApiOverview): Stat[] {
  const worst = SEVERITIES.find((s) => (o.findings_by_severity[s] ?? 0) > 0) ?? null;
  const badges: EventBadge[] = worst ? [{ type: "severity", level: worst }] : [];
  const unrated = (o.findings_by_severity.UNKNOWN ?? 0) + (o.findings_by_severity.NONE ?? 0);
  const findingsNote = worst
    ? `${o.findings_by_severity[worst]} ${SEVERITY_META[worst].label.toLowerCase()} · worst severity`
    : unrated
      ? `${plural(unrated, "finding")} with no severity rating`
      : "No findings yet";
  const total = o.plan_step_count;
  const done = o.plan_step_done_count;
  return [
    { label: "Findings", icon: "findings", value: String(o.finding_count), format: "int", unit: null, badges, meter: null, note: findingsNote, link: { view: "findings", filters: {}, label: "Open the findings" } },
    {
      label: "Plan steps",
      icon: "steps",
      value: `${done}/${total}`,
      format: "none",
      unit: null,
      badges: [],
      meter: total ? { frac: done / total, over: false, label: "Plan done" } : null,
      note: total ? `${Math.round((done / total) * 100)}% of the plan done` : "No plan yet",
      link: null,
    },
    { label: "Tool runs", icon: "runs", value: String(o.tool_run_count), format: "int", unit: null, badges: [], meter: null, note: o.duration_seconds ? `${duration(o.duration_seconds)} from the first tool run to the last` : "No tool has run yet", link: null },
    { label: "Masked evidence", icon: "masked", value: String(o.masked_count), format: "int", unit: null, badges: [], meter: null, note: o.masked_count > 0 ? "Values the Core API masked before saving" : "Nothing needed masking", link: null },
  ];
}

/** One report version as the Report view lists it, with whether (and why not) it downloads. */
export interface ReportRow {
  id: string;
  version: number;
  status: Meaning;
  review: Meaning;
  made: string; // "10 Nov 09:00 · tester@lab"
  covers: number; // assessments it covers (2 to 5: a combined report)
  formats: ReportFormat[];
  /** Why its files can't be downloaded yet, or null when they can. */
  locked: string | null;
  summary: string;
}

export function reportRow(r: ApiReport): ReportRow {
  const review = REPORT_REVIEW[r.review_status ?? "NONE"];
  const locked =
    r.report_status !== "READY"
      ? `${REPORT_STATUS[r.report_status].label}: ${REPORT_STATUS[r.report_status].hint}`
      : !r.signed_off
        ? r.review_status === "APPROVED"
          ? "The review shows as approved, but the Core API has not recorded the sign-off: check it in the TUI."
          : `${review.label}: ${review.hint}`
        : !r.formats.length
          ? "The Core API holds no file for this version."
          : null;
  return {
    id: r.report_id,
    version: r.version,
    status: REPORT_STATUS[r.report_status],
    review,
    made: `${when(r.generated_at ?? r.created_at)} · ${r.generated_by}`,
    covers: r.assessment_ids.length,
    formats: r.formats,
    locked,
    summary: r.executive_summary ?? "",
  };
}

