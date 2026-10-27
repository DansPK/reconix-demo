/* The sample assessments (written by scripts/make_sample_data.py) as test fixtures, and a saved
   file as an older TUI wrote it, with informational findings (the reader drops them). */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { type Assessment, AssessmentSchema } from "@/lib/data/schema";

export const SAMPLE_DIR = path.join(__dirname, "..", "sample-data");

export function sampleNames(): string[] {
  return readdirSync(SAMPLE_DIR).filter((n) => n.endsWith(".json")).sort();
}

/** One sample file's JSON, as saved (not yet read through the schema). */
export const rawSample = (name: string): Record<string, unknown> & { uid: string; findings: Record<string, unknown>[] } =>
  JSON.parse(readFileSync(path.join(SAMPLE_DIR, name), "utf8"));

export function sampleAssessments(): Assessment[] {
  return sampleNames().map((n) => AssessmentSchema.parse(rawSample(n)));
}

// --- informational findings in an older saved file ---------------------------------------

/** Text that only the informational findings below carry: none of it may show anywhere. */
export const INFO_MARK = "Zz-informational";

/** The informational findings an older TUI could save, each INFO in a different field (and
    case): detected, the analyst's override and effective severity, or both. */
export function infoFindings(base: Record<string, unknown>): Record<string, unknown>[] {
  const make = (n: number, fields: Record<string, string>) => ({
    ...base,
    id: `INFO-${n}`,
    title: `${INFO_MARK} finding ${n}`,
    description: `${INFO_MARK} description ${n}`,
    affected_url: `https://info-${n}.example.test/${INFO_MARK}`,
    references: [`${INFO_MARK}-ref-${n}`],
    evidence: [`GET /${INFO_MARK}/${n}`],
    cwe: [`CWE-${9000 + n}`],
    status: "open",
    validation: "CONFIRMED",
    cvss_score: 9.9, // would top every CVSS list if it leaked
    ...fields,
  });
  return [
    make(1, { severity: "INFO", severity_override: "", effective_severity: "INFO" }), // detected
    make(2, { severity: "HIGH", severity_override: "INFO", effective_severity: "INFO" }), // lowered by the analyst
    make(3, { severity: "INFO", severity_override: "HIGH", effective_severity: "HIGH" }), // raised by the analyst
    make(4, { severity: "LOW", severity_override: "", effective_severity: "info" }), // any case
  ];
}

/** A completed sample run with findings, saved as an older TUI would have saved it: its own
    findings plus the informational ones above. */
export function rawWithInfo(): ReturnType<typeof rawSample> {
  const name = sampleNames().find((n) => {
    const raw = rawSample(n);
    return raw.status === "Completed" && raw.findings.some((f) => f.severity !== "INFO" && f.status !== "false-positive");
  })!;
  const raw = rawSample(name);
  const base = raw.findings.find((f) => f.severity !== "INFO")!;
  return { ...raw, findings: [...raw.findings, ...infoFindings(base)] };
}
