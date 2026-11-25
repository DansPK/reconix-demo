// Applying fix-agent edits and describing its results (pure Node, no vscode import).
import type { MergedFinding } from "./findingsLogic";
import type { FixEdit, FixOutcome, FixStatus } from "./shared/contract";

/** The fix agent takes at most this many findings per request. */
export const MAX_FIX_FINDINGS = 200;

/** "Fix all" asks before fixing more than this many findings. */
export const CONFIRM_FIX_ABOVE = 10;

/** The chat lists at most this many findings in a fix report; the rest are counted. */
const LIST_MAX = 15;

const OUTCOME_LABEL: Record<FixStatus, string> = {
  FIXED: "✅ fixed:",
  STILL_REPORTED: "⚠️ still reported:",
  NOT_VERIFIED: "🔎 changed, rescan to confirm:",
  NOT_FIXED: "⏭️ not changed:",
};

/** Edits from several fixes of one file, sorted, without the ones that overlap an earlier edit. */
export function mergeEdits(edits: FixEdit[]): { kept: FixEdit[]; dropped: FixEdit[] } {
  const kept: FixEdit[] = [];
  const dropped: FixEdit[] = [];
  for (const edit of [...edits].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine)) {
    const last = kept[kept.length - 1];
    if (last && edit.startLine <= last.endLine) {
      dropped.push(edit);
    } else {
      kept.push(edit);
    }
  }
  return { kept, dropped };
}

/** Applies non-overlapping line edits to a file's text, keeping its line endings. */
export function applyEdits(text: string, edits: FixEdit[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  for (const edit of [...edits].sort((a, b) => b.startLine - a.startLine)) {
    if (edit.startLine < 1 || edit.endLine < edit.startLine || edit.endLine > lines.length) {
      throw new Error(`lines ${edit.startLine}-${edit.endLine} are outside the file`);
    }
    const replacement = edit.replacement === "" ? [] : edit.replacement.split(/\r?\n/);
    lines.splice(edit.startLine - 1, edit.endLine - edit.startLine + 1, ...replacement);
  }
  return lines.join(eol);
}

/**
 * "Fix all": every shown finding that is not a likely false alarm and has no manualFix, most
 * serious first, as long as their raw hits fit in one request (the backend counts raw hits, not
 * merged findings). `manual` counts the findings left out because they need a manual fix.
 */
export function fixAllIds(findings: MergedFinding[]): { ids: string[]; leftOut: number; manual: number } {
  const real = findings.filter((f) => f.verdict !== "LIKELY_FALSE_POSITIVE");
  const candidates = real.filter((f) => !f.manualFix);
  const ids: string[] = [];
  let rawHits = 0;
  for (const finding of candidates) {
    if (rawHits + finding.findingIds.length > MAX_FIX_FINDINGS) break;
    rawHits += finding.findingIds.length;
    ids.push(finding.id);
  }
  return { ids, leftOut: candidates.length - ids.length, manual: real.length - candidates.length };
}

export interface FixPlan {
  /** Distinct finding ids the fix command named; raw scanner hits when they came from the server. */
  hits: number;
  /** The merged findings those ids name (several scanners can report the same problem). */
  merged: number;
  /** Of those, the ones that need a manual fix and are left out. */
  manual: number;
  /** The rest, which the fix agent can try. */
  fixable: number;
  /** Of the fixable ones, those that fit in one request. */
  chosen: number;
  /** Files the chosen findings are in. */
  files: number;
  /** The one chosen finding, named, when only one is chosen. */
  single?: string;
}

/**
 * What a chat fix command says before it starts, and whether it asks first (more than
 * CONFIRM_FIX_ABOVE findings). It counts merged findings and says so when the command named
 * more scanner hits than that, so its numbers add up.
 */
export function fixPlanText(plan: FixPlan): { text: string; ask: boolean } {
  const n = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;
  const hits = plan.hits > plan.merged ? ` (${n(plan.hits, "scanner hit")})` : "";
  const scope = plan.manual > 0
    ? `Of ${n(plan.merged, "finding")}${hits}, ${plan.manual} need${plan.manual === 1 ? "s" : ""} a manual fix ` +
      `(see the Findings tab), so I'm leaving ${plan.manual === 1 ? "it" : "them"} out. `
    : hits ? `Those ${n(plan.hits, "scanner hit")} are ${n(plan.merged, "finding")}: some problems were reported by more than one scanner. ` : "";
  const more = plan.chosen < plan.fixable ? ` (the first ${plan.chosen} of ${plan.fixable})` : "";
  if (plan.chosen === 1 && plan.single) {
    return { text: `${scope}Preparing a fix for ${plan.single}. You'll see the change before it is applied.`, ask: false };
  }
  if (plan.chosen <= CONFIRM_FIX_ABOVE) {
    return { text: `${scope}Preparing fixes for ${n(plan.chosen, "finding")}${more}. You'll see every change before it is applied.`, ask: false };
  }
  return {
    text: `${scope}Fix ${plan.manual > 0 ? "the other " : ""}${n(plan.chosen, "finding")}${more} in ${n(plan.files, "file")}? ` +
      "When the agent is done you can apply all changes at once or review each file first.",
    ask: true,
  };
}

const STATUS_RANK: Record<FixStatus, number> ={ FIXED: 0, NOT_VERIFIED: 1, STILL_REPORTED: 2, NOT_FIXED: 3 };

/**
 * One outcome per merged finding: the worst status among its raw hits (a problem is only fixed
 * when every hit is), and NOT_FIXED for a finding the backend returned nothing for.
 */
export function mergedOutcomes(results: FixOutcome[], targets: MergedFinding[]): FixOutcome[] {
  return targets.map((target) => {
    const own = results.filter((r) => target.findingIds.includes(r.findingId));
    if (own.length === 0) {
      return { findingId: target.id, status: "NOT_FIXED", note: "The fix agent returned no result for this finding." };
    }
    const worst = own.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a));
    return { ...worst, findingId: target.id };
  });
}

/**
 * The chat report after the fix agent: counts per status, its summary, and the findings that
 * were not fixed. `title` names a finding by id.
 */
export function fixOutcomeText(summary: string, results: FixOutcome[], title: (findingId: string) => string): string {
  // Nothing changed: lead with why, not with "0 fixed".
  if (results.length > 0 && results.every((r) => r.status === "NOT_FIXED")) {
    if (results.length === 1) return `Not changed: ${title(results[0].findingId)}.\n\n${results[0].note}`;
    return `Nothing was changed. None of these ${results.length} findings can be fixed automatically:\n\n` +
      results.slice(0, LIST_MAX).map((r) => `- ${title(r.findingId)}: ${r.note}`).join("\n") +
      (results.length > LIST_MAX ? `\n- …and ${results.length - LIST_MAX} more.` : "");
  }
  const counts: Record<FixStatus, number> = { FIXED: 0, STILL_REPORTED: 0, NOT_VERIFIED: 0, NOT_FIXED: 0 };
  for (const r of results) counts[r.status] += 1;
  const parts = [
    `Fix agent: ${counts.FIXED} fixed and confirmed by the scanners` +
      (counts.NOT_VERIFIED ? `, ${counts.NOT_VERIFIED} changed but not rechecked` : "") +
      (counts.STILL_REPORTED ? `, ${counts.STILL_REPORTED} still reported` : "") +
      (counts.NOT_FIXED ? `, ${counts.NOT_FIXED} not changed` : "") +
      ".",
  ];
  if (summary) parts.push(summary);
  const problems = results.filter((r) => r.status === "STILL_REPORTED" || r.status === "NOT_FIXED");
  if (problems.length) {
    const more = problems.length - LIST_MAX;
    parts.push(problems.slice(0, LIST_MAX).map((r) => outcomeLine(r, title)).join("\n") +
      // Their notes are only in this report, so point at a rescan, not at the Findings tab.
      (more > 0 ? `\n- …and ${more} more not fixed. Rescan to see which findings remain.` : ""));
  }
  return parts.join("\n\n");
}

/** Scanners whose findings are dependency upgrades (core's DEPENDENCY_TOOLS). */
const DEPENDENCY_TOOLS = new Set(["TRIVY", "GRYPE", "OSV_SCANNER", "SYFT"]);

/** Manifests and lockfiles, by file name (core's code_scans.MANIFEST). */
const MANIFEST = new RegExp(
  "^(?:requirements[^/]*\\.txt|pyproject\\.toml|poetry\\.lock|uv\\.lock|Pipfile|Pipfile\\.lock" +
  "|package\\.json|package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|go\\.mod|go\\.sum|Cargo\\.lock" +
  "|pom\\.xml|build\\.gradle|build\\.gradle\\.kts|gradle\\.lockfile|Gemfile\\.lock|composer\\.lock" +
  "|packages\\.lock\\.json|pubspec\\.lock|mix\\.lock)$",
);

/**
 * Why core's fix agent refuses a finding without trying it, or undefined. Mirrors core's
 * code_fixes.not_fixable (same rule, same notes), so server mode marks these as manual fixes
 * up front instead of sending them and getting NOT_FIXED back.
 * A hand copy of reconix-core-backend services/api/src/reconix_api/services/code_fixes.py
 * (not_fixable, DEPENDENCY_TOOLS, the notes) and code_scans.py (MANIFEST): change both together
 * (PLAN_QUESTIONS.md Q21).
 */
export function coreNotFixable(finding: { tools: string[]; path: string; line?: number }): string | undefined {
  if (finding.tools.includes("GITLEAKS")) {
    return "A leaked secret is not fixed by changing code: rotate it, then remove it from the code and its history.";
  }
  const fileName = finding.path.slice(finding.path.lastIndexOf("/") + 1);
  if (finding.tools.length > 0 && finding.tools.every((t) => DEPENDENCY_TOOLS.has(t)) && MANIFEST.test(fileName)) {
    return "Upgrade the package to a fixed version in its manifest and reinstall; the fix agent does not change dependencies.";
  }
  if (!finding.path || !finding.line) return "This finding has no line in the code to change.";
  return undefined;
}

export function outcomeLine(result: FixOutcome, title: (findingId: string) => string): string {
  return `- ${OUTCOME_LABEL[result.status]} ${title(result.findingId)}: ${result.note}`;
}

export function outcomeLabel(status: FixStatus): string {
  return OUTCOME_LABEL[status];
}
