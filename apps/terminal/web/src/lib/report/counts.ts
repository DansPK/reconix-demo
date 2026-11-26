/* The report totals derived from a saved assessment. Keep the category and severity populations
   in one place so JSON, HTML and DOCX exports agree. */
import { type Finding, type FindingSeverity, isFindingSeverity, isSeverity, SEVERITIES } from "@/lib/data/schema";

export const CATEGORY_ORDER = [
  "CONFIRMED_VULNERABILITY",
  "POTENTIAL_VULNERABILITY",
  "SECURITY_MISCONFIGURATION",
  "SECURITY_HARDENING_RECOMMENDATION",
  "INFORMATIONAL_DISCOVERY",
  "FALSE_POSITIVE",
  "INSUFFICIENT_EVIDENCE",
] as const;

export type FindingCategory = (typeof CATEGORY_ORDER)[number];

const VULNERABILITY_CATEGORIES = new Set<FindingCategory>([
  "CONFIRMED_VULNERABILITY",
  "POTENTIAL_VULNERABILITY",
]);
const RATED_SECURITY_CATEGORIES = new Set<FindingCategory>([
  ...VULNERABILITY_CATEGORIES,
  "SECURITY_MISCONFIGURATION",
]);

export interface ReportCounts {
  severity_counts: Record<(typeof SEVERITIES)[number], number>;
  category_counts: Record<FindingCategory, number>;
  vulnerability_counts: Record<"CONFIRMED_VULNERABILITY" | "POTENTIAL_VULNERABILITY", number>;
}

/** Whether a snapshot finding carries an explicit validated taxonomy category. */
export function isClassifiedFinding(finding: Pick<Finding, "finding_category">): boolean {
  const category = finding.finding_category?.trim().toUpperCase();
  return Boolean(category && CATEGORY_ORDER.includes(category as FindingCategory));
}

/** Old snapshots have no validated category. Count them as insufficient evidence, never as a
    confirmed vulnerability. An analyst's false-positive status takes precedence. */
export function findingCategory(finding: Pick<Finding, "finding_category" | "status">): FindingCategory {
  if (finding.status === "false-positive" || finding.finding_category?.trim().toUpperCase() === "FALSE_POSITIVE") {
    return "FALSE_POSITIVE";
  }
  const category = finding.finding_category?.trim().toUpperCase();
  return CATEGORY_ORDER.includes(category as FindingCategory)
    ? (category as FindingCategory)
    : "INSUFFICIENT_EVIDENCE";
}

export function isRatedSecurityCategory(category: FindingCategory): boolean {
  return RATED_SECURITY_CATEGORIES.has(category);
}

/** Validated severity for report summaries and tables. Unclassified historical rows have no
    validated severity ("UNKNOWN"), keeping legacy/scanner ratings labeled as claims only. */
export function severityForReport(
  finding: Pick<Finding, "finding_category" | "severity" | "validated_severity_status">,
): FindingSeverity {
  if (!isClassifiedFinding(finding)) return "UNKNOWN";
  if (finding.validated_severity_status !== undefined) {
    const validated = finding.validated_severity_status?.trim().toUpperCase() ?? "UNKNOWN";
    return isFindingSeverity(validated) ? validated : "UNKNOWN";
  }
  return isFindingSeverity(finding.severity) ? finding.severity : "UNKNOWN";
}

export function isRatedSecurityFinding(
  finding: Pick<Finding, "finding_category" | "status" | "severity" | "validated_severity_status">,
): boolean {
  return isRatedSecurityCategory(findingCategory(finding)) && isSeverity(severityForReport(finding));
}

export function scoreForReport(
  finding: Pick<Finding, "finding_category" | "cvss_score" | "validated_cvss_score">,
): number | null {
  if (isClassifiedFinding(finding)) {
    const score = finding.validated_cvss_score;
    return typeof score === "number" && Number.isFinite(score) ? score : null;
  }
  return finding.cvss_score > 0 ? finding.cvss_score : null;
}

export function vectorForReport(
  finding: Pick<Finding, "finding_category" | "cvss_vector" | "validated_cvss_vector">,
): string {
  if (isClassifiedFinding(finding)) {
    if (finding.validated_cvss_vector !== undefined) {
      return finding.validated_cvss_vector ?? "";
    }
    return finding.cvss_vector || "";
  }
  return finding.cvss_vector || "";
}

export function identifiersForReport(
  finding: Pick<Finding, "finding_category" | "references" | "validated_cwe_ids" | "validated_cve_ids">,
): string[] {
  if (isClassifiedFinding(finding)) {
    if (finding.validated_cwe_ids !== undefined || finding.validated_cve_ids !== undefined) {
      return [...(finding.validated_cwe_ids ?? []), ...(finding.validated_cve_ids ?? [])];
    }
    return finding.references;
  }
  return finding.references;
}

export function originalRatingClaim(
  finding: Pick<Finding, "severity" | "cvss_score">,
): string {
  return [`Severity ${finding.severity}`, finding.cvss_score > 0 ? `CVSS ${finding.cvss_score.toFixed(1)}` : ""]
    .filter(Boolean)
    .join(" · ");
}

/** Count every category, vulnerabilities by validation category, and only rated security severity. */
export function reportCounts(findings: Finding[]): ReportCounts {
  const severityCounts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as ReportCounts["severity_counts"];
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as ReportCounts["category_counts"];
  const vulnerabilityCounts: ReportCounts["vulnerability_counts"] = {
    CONFIRMED_VULNERABILITY: 0,
    POTENTIAL_VULNERABILITY: 0,
  };

  for (const finding of findings) {
    const category = findingCategory(finding);
    const severity = severityForReport(finding);
    categoryCounts[category] += 1;
    if (category === "CONFIRMED_VULNERABILITY" || category === "POTENTIAL_VULNERABILITY") {
      vulnerabilityCounts[category] += 1;
    }
    if (RATED_SECURITY_CATEGORIES.has(category) && isSeverity(severity)) {
      severityCounts[severity] += 1;
    }
  }

  return {
    severity_counts: severityCounts,
    category_counts: categoryCounts,
    vulnerability_counts: vulnerabilityCounts,
  };
}

export const ratedSecurityCount = (counts: ReportCounts["severity_counts"]) =>
  Object.values(counts).reduce((total, count) => total + count, 0);

export const categoryLabel = (category: FindingCategory) =>
  category.split("_").map((word) => word[0] + word.slice(1).toLowerCase()).join(" ");
