// Pure helpers for the in-editor add-ons (gutter icons, hover cards, Explorer badges).
// No vscode import, so they are unit-testable. Lines are 1-based, like the contract.
import * as path from "node:path";
import { SEVERITY_ORDER } from "./findingsLogic";
import type { Finding, Severity, Verdict } from "./shared/contract";

/** The five gutter icons: UNKNOWN and NONE share the "info" one. */
export type GutterIcon = "critical" | "high" | "medium" | "low" | "info";

export function gutterIcon(severity: Severity): GutterIcon {
  return severity === "UNKNOWN" || severity === "NONE" ? "info" : (severity.toLowerCase() as GutterIcon);
}

/** A finding without a line is drawn on line 1 (like its Problems entry). */
export function startLine(f: Finding): number {
  return Math.max(f.line ?? 1, 1);
}

export function endLine(f: Finding): number {
  return Math.max(f.endLine ?? f.line ?? 1, startLine(f));
}

/** The most severe level among the findings, or undefined when there are none. */
export function worstSeverity(findings: Finding[]): Severity | undefined {
  let worst: Severity | undefined;
  for (const f of findings) {
    if (worst === undefined || SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(worst)) worst = f.severity;
  }
  return worst;
}

/** Findings whose lines overlap [from, to] (1-based, inclusive). */
export function findingsInLines<T extends Finding>(findings: T[], from: number, to = from): T[] {
  return findings.filter((f) => startLine(f) <= to && endLine(f) >= from);
}

/** One gutter icon per line, on each finding's first line: the most severe finding there wins. */
export function gutterLines(findings: Finding[]): Map<GutterIcon, number[]> {
  const worstAt = new Map<number, Severity>();
  for (const f of findings) {
    const line = startLine(f);
    const now = worstAt.get(line);
    if (now === undefined || SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(now)) worstAt.set(line, f.severity);
  }
  const byIcon = new Map<GutterIcon, number[]>();
  for (const [line, severity] of [...worstAt].sort(([a], [b]) => a - b)) {
    const icon = gutterIcon(severity);
    byIcon.set(icon, [...(byIcon.get(icon) ?? []), line]);
  }
  return byIcon;
}

export interface StatusInput {
  /** "unknown": nothing asked yet (the chat hasn't loaded); drawn like connected, without a spinner. */
  connection: "connected" | "connecting" | "disconnected" | "unknown";
  /** Why it is disconnected, in plain words. */
  reason?: string;
  /** A scan is running: its progress, 0..100. */
  scanning?: number;
  counts: Partial<Record<Severity, number>>;
}

const SEVERITY_WORD: Record<Severity, string> = {
  CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low", UNKNOWN: "unknown", NONE: "info",
};

/** Status bar text (with a codicon), its tooltip, and how loud it is. */
export function statusBar(s: StatusInput): { text: string; tooltip: string; tone?: "error" | "warning" } {
  if (s.connection === "disconnected") {
    return { text: "$(debug-disconnect) Reconix", tooltip: `Reconix: not connected${s.reason ? `. ${s.reason}` : ""}` };
  }
  if (s.connection === "connecting") return { text: "$(sync~spin) Reconix", tooltip: "Reconix: connecting…" };
  if (s.scanning !== undefined) {
    return { text: `$(sync~spin) Reconix ${Math.round(s.scanning)}%`, tooltip: "Reconix: scanning…" };
  }
  const parts = SEVERITY_ORDER.filter((sev) => s.counts[sev]).map((sev) => `${s.counts[sev]} ${SEVERITY_WORD[sev]}`);
  if (!parts.length) return { text: "$(shield) Reconix", tooltip: "Reconix: no findings" };
  // Keep the bar short: the two most severe levels; the tooltip has them all.
  const tone = s.counts.CRITICAL || s.counts.HIGH ? "error" : s.counts.MEDIUM ? "warning" : undefined;
  return { text: `$(shield) ${parts.slice(0, 2).join(" · ")}`, tooltip: `Reconix findings: ${parts.join(", ")}`, tone };
}

/** Findings for the tree: severity, then file, then line, each in display order. */
export function treeGroups<T extends Finding>(findings: T[]): { severity: Severity; files: { path: string; findings: T[] }[] }[] {
  return SEVERITY_ORDER.map((severity) => {
    const files = new Map<string, T[]>();
    for (const f of findings.filter((x) => x.severity === severity)) files.set(f.path, [...(files.get(f.path) ?? []), f]);
    return {
      severity,
      files: [...files]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([path, list]) => ({ path, findings: [...list].sort((a, b) => startLine(a) - startLine(b)) })),
    };
  }).filter((g) => g.files.length);
}

/** File Explorer badge: at most two characters. */
export function badge(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/** "CWE-89" (or "89") -> its MITRE page, or undefined. */
export function cweUrl(cwe: string): string | undefined {
  const n = /(\d+)/.exec(cwe)?.[1];
  return n ? `https://cwe.mitre.org/data/definitions/${n}.html` : undefined;
}

/** Same words as the chat's finding cards. */
const VERDICT_TEXT: Record<Verdict, string> = {
  CONFIRMED: "Confirmed",
  LIKELY_TRUE_POSITIVE: "Likely real",
  LIKELY_FALSE_POSITIVE: "Likely false alarm",
  UNVERIFIED: "Unsure",
};

/**
 * Scanner and server text is untrusted: escape every Markdown character, so it can't add links
 * (a `command:` link would run a command) or change the layout. Newlines become spaces.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/([\\`*_{}[\]()#+\-.!|<>~&:$])/g, "\\$1");
}

/**
 * Untrusted text for a code span: one line (a blank line would end the span and start a new,
 * fully parsed paragraph), no backticks.
 */
export function codeSpan(text: string): string {
  return `\`${text.replace(/\s+/g, " ").trim().replace(/`/g, "'")}\``;
}

export type CardAction = "fix" | "explain" | "ignore";

/**
 * Markdown for a finding's hover card, ending in its Fix, Explain and Ignore command links
 * (`link(action, label)`); Fix is left out for a manual fix. A merged finding lists all its rules.
 */
export function hoverMarkdown(f: Finding & { ruleIds?: string[] }, link: (action: CardAction, label: string) => string): string {
  const rules = f.ruleIds?.length ? f.ruleIds : [f.ruleId];
  const meta = [`_${VERDICT_TEXT[f.verdict] ?? "Unsure"}_`, ...rules.map(codeSpan)];
  for (const cwe of f.cwe ?? []) {
    const url = cweUrl(cwe);
    meta.push(url ? `[${escapeMarkdown(cwe)}](${url})` : escapeMarkdown(cwe));
  }
  if (f.tools.length) meta.push(escapeMarkdown(f.tools.join(" + ")));
  const lines = [`**${f.severity}** · ${escapeMarkdown(f.title)}`, "", meta.join(" · "), ""];
  if (f.explanation) lines.push(`**What's wrong:** ${escapeMarkdown(f.explanation)}`, "");
  if (f.fixRecommendation) lines.push(`**How to fix:** ${escapeMarkdown(f.fixRecommendation)}`, "");
  if (f.manualFix) lines.push(`**Manual fix:** ${escapeMarkdown(f.manualFix)}`, "");
  const links = [
    ...(f.manualFix ? [] : [link("fix", "$(wrench) Fix")]),
    link("explain", "$(comment-discussion) Explain"),
    link("ignore", "$(eye-closed) Ignore"),
  ];
  lines.push(links.join(" &nbsp;·&nbsp; "));
  return lines.join("\n").trimEnd();
}

const byPathThenLine = (a: Finding, b: Finding): number =>
  (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || startLine(a) - startLine(b);

/**
 * The next (dir 1) or previous (dir -1) finding from a position, by path then line, wrapping
 * around. With no position (no editor, or a file outside the scanned folder): the first or last.
 */
export function stepFinding<T extends Finding>(findings: T[], at: { path: string; line: number } | undefined, dir: 1 | -1): T | undefined {
  if (!findings.length) return undefined;
  const order = [...findings].sort(byPathThenLine);
  if (!at) return dir === 1 ? order[0] : order[order.length - 1];
  const cmp = (f: T): number => (f.path < at.path ? -1 : f.path > at.path ? 1 : 0) || startLine(f) - at.line;
  if (dir === 1) return order.find((f) => cmp(f) > 0) ?? order[0];
  return [...order].reverse().find((f) => cmp(f) < 0) ?? order[order.length - 1];
}

export interface SymbolRange {
  name: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
}

export interface LensGroup {
  /** 1-based line the lens sits above. */
  line: number;
  /** The function or class, or undefined for findings outside any. */
  name?: string;
  ids: string[];
}

/**
 * One CodeLens per innermost function or class holding findings; findings outside any symbol
 * share one lens, above the first of them.
 */
export function lensGroups(findings: Finding[], symbols: SymbolRange[]): LensGroup[] {
  const groups = new Map<string, LensGroup>();
  for (const f of [...findings].sort(byPathThenLine)) {
    const line = startLine(f);
    const holder = symbols
      .filter((s) => s.startLine <= line && s.endLine >= line)
      .sort((a, b) => a.endLine - a.startLine - (b.endLine - b.startLine))[0];
    const key = holder ? `${holder.startLine}:${holder.name}` : "";
    const group = groups.get(key) ?? { line: holder ? holder.startLine : line, name: holder?.name, ids: [] };
    group.ids.push(f.id);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.line - b.line);
}

/**
 * A file's contract path (forward slashes) inside the scanned folder, or undefined outside it.
 * path.relative ignores drive-letter and path casing on Windows, like the file system.
 */
export function relativeContractPath(rootFsPath: string, fileFsPath: string, p: typeof path = path): string | undefined {
  const rel = p.relative(rootFsPath, fileFsPath);
  if (!rel || rel === ".." || rel.startsWith(`..${p.sep}`) || p.isAbsolute(rel)) return undefined;
  return rel.split(p.sep).join("/");
}

/**
 * The chat question for Explain on a finding. It names the finding (its id, which the static chat
 * recognises), the file, line and rule, never the code itself: the server reads its uploaded copy.
 */
export function explainFindingText(f: Finding): string {
  return `Explain finding ${f.id} ("${f.title.replace(/\s+/g, " ").trim()}") in ${f.path}:${startLine(f)} (rule ${f.ruleId}): `
    + "why is it a problem here, and how should I fix it?";
}

/** 1-based lines of a selection; one that ends at column 0 of a later line leaves that line out. */
export function selectionLines(sel: { start: { line: number }; end: { line: number; character: number } }): { first: number; last: number } {
  const first = sel.start.line + 1;
  const endsAtLineStart = sel.end.character === 0 && sel.end.line > sel.start.line;
  return { first, last: Math.max(first, sel.end.line + (endsAtLineStart ? 0 : 1)) };
}

/** The chat question for Explain Selection: the path and lines only, never the selected code. */
export function explainSelectionText(contractPath: string, first: number, last: number): string {
  const lines = first === last ? `line ${first}` : `lines ${first}-${last}`;
  return `Look at ${contractPath} ${lines}: is there a security problem in that code, and how would I fix it?`;
}
