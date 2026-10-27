// Pure helpers for the in-editor features (status bar, hover, CodeLens, tree, navigation).
// No VS Code API here, so they can be unit tested.

import { Finding, Severity, SEVERITIES } from "./shared/contract";

export type Counts = Partial<Record<Severity, number>>;

export function countBySeverity(findings: Finding[]): Counts {
  const counts: Counts = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

/** The most severe level among the findings, or null when there are none. */
export function worstSeverity(findings: Finding[]): Severity | null {
  let worst: Severity | null = null;
  for (const f of findings) {
    if (worst === null || SEVERITIES.indexOf(f.severity) < SEVERITIES.indexOf(worst)) worst = f.severity;
  }
  return worst;
}

export interface StatusInput {
  connected: boolean;
  scanning: boolean;
  percent: number;
  counts: Counts;
}

/** Status bar text (with a codicon), its tooltip, and how loud it should be. */
export function statusBar(s: StatusInput): { text: string; tooltip: string; tone: "error" | "warning" | null } {
  if (!s.connected) return { text: "$(debug-disconnect) Reconix", tooltip: "Reconix: not connected", tone: null };
  if (s.scanning) {
    return { text: `$(sync~spin) Reconix ${Math.round(s.percent)}%`, tooltip: "Reconix: scanning…", tone: null };
  }
  const parts = SEVERITIES.filter((sev) => s.counts[sev]).map((sev) => `${s.counts[sev]} ${sev}`);
  if (!parts.length) return { text: "$(shield) Reconix", tooltip: "Reconix: no findings", tone: null };
  // Keep the bar short: the two most severe levels; the tooltip has them all.
  const tone = s.counts.critical || s.counts.high ? "error" : s.counts.medium ? "warning" : null;
  return { text: `$(shield) ${parts.slice(0, 2).join(" · ")}`, tooltip: `Reconix findings: ${parts.join(", ")}`, tone };
}

/** Findings whose lines overlap [startLine, endLine] (1-based, inclusive). */
export function findingsInLines<T extends Finding>(findings: T[], startLine: number, endLine = startLine): T[] {
  return findings.filter((f) => f.start_line <= endLine && f.end_line >= startLine);
}

/** "CWE-89" (or "89") -> its MITRE page, or null. */
export function cweUrl(cwe: string | null): string | null {
  const n = /(\d+)/.exec(cwe ?? "")?.[1];
  return n ? `https://cwe.mitre.org/data/definitions/${n}.html` : null;
}

const VERDICT_TEXT: Record<Finding["verdict"], string> = {
  likely_real: "Likely real", likely_false_positive: "Likely false alarm", unsure: "Unsure",
};

/** Markdown for a finding's hover card. `link(command, label)` makes a clickable command link. */
export function hoverMarkdown(f: Finding, link: (command: string, label: string) => string): string {
  const esc = (t: string) => t.replace(/([\\`*_{}[\]()#+!|<>])/g, "\\$1");
  const lines = [`**${f.severity.toUpperCase()}** · ${esc(f.title)}`, ""];
  const verdict = f.explanation ? VERDICT_TEXT[f.verdict] : "Not reviewed yet";
  const cwe = cweUrl(f.cwe);
  lines.push(`_${verdict}_ · \`${f.rule_id}\`${cwe ? ` · [${f.cwe}](${cwe})` : ""} · ${f.tools.join(" + ")}`, "");
  if (f.explanation) lines.push(`**What's wrong:** ${f.explanation}`, "");
  if (f.fix_recommendation) lines.push(`**How to fix:** ${f.fix_recommendation}`, "");
  lines.push([link("vulnScanner.fixFinding", "$(wrench) Fix"), link("vulnScanner.explainFinding", "$(comment-discussion) Explain"),
              link("vulnScanner.ignoreFinding", "$(eye-closed) Ignore")].join(" &nbsp;·&nbsp; "));
  return lines.join("\n");
}

/** File Explorer badge: at most two characters. */
export function badge(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export interface SymbolRange {
  name: string;
  startLine: number; // 1-based
  endLine: number;
}

export interface LensGroup {
  line: number; // 1-based line to show the lens above
  name: string | null;
  ids: string[];
}

/** One CodeLens group per innermost function/class holding findings; findings outside any symbol
 * are grouped at the line of the first of them. */
export function lensGroups(findings: Finding[], symbols: SymbolRange[]): LensGroup[] {
  const groups = new Map<string, LensGroup>();
  for (const f of findings) {
    const holders = symbols.filter((s) => s.startLine <= f.start_line && s.endLine >= f.start_line);
    // innermost = the shortest symbol that contains the line
    const sym = holders.sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];
    const key = sym ? `${sym.startLine}:${sym.name}` : "file";
    const g = groups.get(key) ?? { line: sym ? sym.startLine : f.start_line, name: sym?.name ?? null, ids: [] };
    g.line = sym ? g.line : Math.min(g.line, f.start_line);
    g.ids.push(f.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.line - b.line);
}

/** The next (or previous) finding after a position, by file then line, wrapping around. */
export function stepFinding<T extends Finding>(findings: T[], at: { path: string; line: number } | null,
                                               dir: 1 | -1): T | null {
  if (!findings.length) return null;
  const order = [...findings].sort((a, b) => a.path.localeCompare(b.path) || a.start_line - b.start_line);
  if (!at) return dir === 1 ? order[0] : order[order.length - 1];
  const cmp = (f: T) => f.path.localeCompare(at.path) || f.start_line - at.line;
  if (dir === 1) return order.find((f) => cmp(f) > 0) ?? order[0];
  return [...order].reverse().find((f) => cmp(f) < 0) ?? order[order.length - 1];
}

/** Findings grouped for the tree view: severity, then file, both in display order. */
export function treeGroups<T extends Finding>(findings: T[]): { severity: Severity; files: { path: string; findings: T[] }[] }[] {
  return SEVERITIES.map((severity) => {
    const files = new Map<string, T[]>();
    for (const f of findings.filter((x) => x.severity === severity)) {
      files.set(f.path, [...(files.get(f.path) ?? []), f]);
    }
    return { severity, files: [...files].sort(([a], [b]) => a.localeCompare(b))
      .map(([path, list]) => ({ path, findings: list.sort((a, b) => a.start_line - b.start_line) })) };
  }).filter((g) => g.files.length);
}
