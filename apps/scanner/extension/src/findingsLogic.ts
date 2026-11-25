// Sorting, filtering, merging and counting findings (pure Node, no vscode import).
import type { Finding, Severity, SeverityCounts } from "./shared/contract";
import { renderMarkdown } from "./markdown";
import type { FindingView } from "./shared/messages";

/** Most severe first; UNKNOWN (unrated, may be a risk) before NONE (no risk). */
export const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN", "NONE"];

/**
 * Several raw hits on the same (path, line, CWE) shown as one problem.
 * The Finding fields come from the most severe hit; the arrays list every hit.
 */
export interface MergedFinding extends Finding {
  /** Ids of every raw finding merged into this one (first is the representative). */
  findingIds: string[];
  ruleIds: string[];
  tools: string[];
}

/**
 * Is this a false positive to hide? Core's rule: a person's FALSE_POSITIVE, or the AI's
 * LIKELY_FALSE_POSITIVE unless it is HIGH, CRITICAL or a Gitleaks secret (text in the scanned code
 * can sway the AI, so those stay in sight).
 */
export function hiddenAsFalse(f: Finding): boolean {
  if (f.verdict !== "LIKELY_FALSE_POSITIVE") return false;
  if (f.findingStatus === "FALSE_POSITIVE") return true;
  return f.severity !== "HIGH" && f.severity !== "CRITICAL" && !f.tools.includes("GITLEAKS");
}

export function visibleFindings<T extends Finding>(findings: T[], showLikelyFalsePositives: boolean): T[] {
  if (showLikelyFalsePositives) {
    return [...findings];
  }
  return findings.filter((f) => !hiddenAsFalse(f));
}

/** Severity (CRITICAL first), then path, then line. Returns a new array. */
/** Is this contract path one of `paths`, or inside one of them? (core's rule for a path scan) */
export function underPaths(path: string, paths: string[]): boolean {
  return paths.some((p) => path === p || path.startsWith(`${p.replace(/\/+$/, "")}/`));
}

export function sortFindings<T extends Finding>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      compareStrings(a.path, b.path) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

export function countBySeverity(findings: Finding[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0, NONE: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

/** Merges hits that share path, line and CWE set (Q13). Keeps the order of first appearance. */
export function mergeFindings(findings: Finding[]): MergedFinding[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = mergeKey(f);
    const group = groups.get(key);
    if (group) {
      group.push(f);
    } else {
      groups.set(key, [f]);
    }
  }

  return [...groups.values()].map((group) => {
    // The representative is the most real hit, then the most severe: a false-alarm hit must not turn
    // a real problem into a false alarm (or raise its severity). Stable: on a tie the first hit stays.
    const ordered = [...group].sort((a, b) =>
      VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || severityRank(a.severity) - severityRank(b.severity));
    // One fixable hit makes the problem fixable; it needs a manual fix only if every hit does.
    const manual = ordered.every((f) => f.manualFix) ? ordered[0].manualFix : undefined;
    const { manualFix: _dropped, ...first } = ordered[0];
    return {
      ...first,
      ...(manual ? { manualFix: manual } : {}),
      findingIds: ordered.map((f) => f.id),
      ruleIds: unique(ordered.map((f) => f.ruleId)),
      tools: unique(ordered.flatMap((f) => f.tools)),
    };
  });
}

// Only a likely false alarm ranks last: an unreviewed hit (core's AI may not have got to it yet) is as real.
const VERDICT_RANK: Record<Finding["verdict"], number> = { CONFIRMED: 0, LIKELY_TRUE_POSITIVE: 0, UNVERIFIED: 0, LIKELY_FALSE_POSITIVE: 1 };

function mergeKey(f: Finding): string {
  const cwe = [...(f.cwe ?? [])].sort().join(",");
  return JSON.stringify([f.path, f.line ?? null, cwe]);
}

function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export interface PreparedFindings {
  /** Visible findings, merged and sorted most severe first. */
  findings: MergedFinding[];
  counts: SeverityCounts;
  /** Merged likely false positives left out because the setting is off. */
  hiddenFalsePositives: number;
}

/**
 * Turns raw backend findings (fetched with false positives included) into what the UI shows.
 * Filters before merging, so a false-positive hit never hides a real one on the same line.
 */
export function prepareFindings(raw: Finding[], showLikelyFalsePositives: boolean): PreparedFindings {
  const visible = sortFindings(mergeFindings(visibleFindings(raw, showLikelyFalsePositives)));
  const hiddenFalsePositives = showLikelyFalsePositives
    ? 0
    : mergeFindings(raw.filter(hiddenAsFalse)).length;
  return { findings: visible, counts: countBySeverity(visible), hiddenFalsePositives };
}

/** Strips a finding down to what the webview may see (no snippet). */
export function toFindingView(finding: MergedFinding, outdated = false): FindingView {
  return {
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    verdict: finding.verdict,
    path: finding.path,
    line: finding.line,
    endLine: finding.endLine,
    message: finding.message,
    ruleIds: finding.ruleIds,
    tools: finding.tools,
    cwe: finding.cwe,
    explanationHtml: finding.explanation ? renderMarkdown(finding.explanation) : undefined,
    fixRecommendationHtml: finding.fixRecommendation ? renderMarkdown(finding.fixRecommendation) : undefined,
    manualFix: finding.manualFix,
    outdated,
  };
}

export function firstSentence(text: string | undefined): string {
  const trimmed = (text ?? "").trim();
  const match = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (match ? match[0] : trimmed).replace(/\s+/g, " ").trim();
}

/** Problems-panel text: the title plus the first sentence of how to fix it. */
export function diagnosticMessage(finding: Finding): string {
  const fix = firstSentence(finding.fixRecommendation);
  return fix ? `${finding.title}: ${fix}` : finding.title;
}

/**
 * The chat line after a finished scan. `counts` covers every finding, including the
 * `hidden` likely false positives.
 */
export function scanSummaryText(counts: SeverityCounts, hidden: number, error?: string): string {
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + counts[s], 0);
  // NONE reads as a word in a sentence ("2 none"), so it is named for what it means.
  const parts = SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s === "NONE" ? "informational" : s.toLowerCase()}`);
  let text = total
    ? `Scan finished: ${total} finding${total === 1 ? "" : "s"} (${parts.join(", ")}).`
    : "Scan finished: no findings.";
  if (hidden > 0) {
    const which =
      hidden >= total
        ? total === 1
          ? "It looks like a false alarm"
          : "All of them look like false alarms"
        : `${hidden} of them look like false alarms`;
    text += ` ${which}, so ${hidden === 1 ? "it is" : "they are"} hidden in the Findings tab.`;
  }
  if (error) {
    text += `\n\nSome steps had problems: ${error}`;
  }
  return text;
}
