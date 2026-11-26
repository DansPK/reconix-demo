// Decides what a chat message asks for (pure Node, no vscode import). Rules are checked in order;
// keep them here so they are easy to change. Mirrors the reference's keyword rules and the
// harness's fix_targets, so static mode behaves like the server without an LLM.
import { SEVERITY_ORDER, type MergedFinding } from "./findingsLogic";
import type { ChatCommand, Severity, Verdict } from "./shared/contract";

export type Route =
  | { kind: "empty" }
  | { kind: "cancel"; text: string }
  | { kind: "github"; text: string; url: string }
  | { kind: "rescan"; text: string }
  /** `full`: scan even when nothing changed since the last scan ("from scratch"). */
  | { kind: "scan"; text: string; full: boolean }
  | { kind: "fix"; text: string }
  | { kind: "summarize"; text: string }
  | { kind: "showFindings"; text: string }
  /** `name`: the model the user named ("switch to gpt-4o" → "gpt-4o"). */
  | { kind: "switchModel"; text: string; name: string }
  | { kind: "chat"; text: string };

const GITHUB = /https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+/;

/**
 * `https://github.com/<owner>/<repo>` (core's rule: optionally ending in `.git` or `/`), as that
 * plain form; anything else is undefined.
 */
export function githubRepoUrl(text: string): string | undefined {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(\.git)?\/?$/.exec(text.trim());
  return match && match[2] !== "." && match[2] !== ".." ? `https://github.com/${match[1]}/${match[2]}` : undefined;
}
const CANCEL = /^\s*(stop|cancel|abort)\b/i;
const RESCAN = /\brescan\b|\bre-scan\b/i;
const SCAN_VERB = /\b(scan|analy[sz]e|check)\b/i;
const SCAN_OBJECT = /\b(this|project|workspace|code|folder|everything|again)\b/i;
const FULL = /\bfrom scratch\b|\bfull\b|\beverything again\b|\ball files\b/i;
const FIX = /^\s*(please\s+|can you\s+|could you\s+)?(fix|repair|patch|remediate)\b/i;
const SUMMARIZE = /\bsummar(y|i[sz]e)\b|^\s*overview\b/i;
// The text is trimmed first, so this ends in "$" without trailing "\s*": two "\s*" around
// "[.!]?" made a long run of spaces take seconds to match.
const SHOW_FINDINGS = /^(show|open|list|view)\s+(me\s+)?(the\s+|all\s+)?(findings|results|problems|issues)[.!]?$/i;
// "switch to gpt-4o", "change the model to Qwen", "use the claude model". Plain "use …" is not one
// ("use parameterized queries"): it must end in "model".
// The name starts with a non-space, so the spaces around it can't be matched two ways (slow).
const SWITCH_TO = /^(?:please\s+)?(?:switch|change)\s+(?:the\s+)?(?:model\s+|llm\s+)?to\s+(?:the\s+)?(\S.*?)(?:\s+(?:model|llm))?[.!?]?$/i;
const USE_MODEL = /^(?:please\s+)?use\s+(?:the\s+)?(\S.*?)\s+(?:model|llm)[.!?]?$/i;
/** "switch to dark mode" is no model switch unless a model is named or the message says so. */
const MODEL_WORD = /\b(model|llm)\b/i;
const QUESTION = /^\s*(what|why|how|which|where|when|who|is|are|was|does|do|did|should)\b/i;
const ABOUT_FINDINGS = /\b(finding|findings|result|results)\b|\bf-[0-9a-f]{6,}\b/i;

/** Longer messages are never commands, so no message can make the matching slow. */
export const MAX_COMMAND_CHARS = 300;

export function routeMessage(input: string, withSwitch = true): Route {
  const text = input.trim();
  if (text === "") return { kind: "empty" };
  if (input.length > MAX_COMMAND_CHARS) return { kind: "chat", text };
  if (CANCEL.test(text)) return { kind: "cancel", text };
  const gh = text.match(GITHUB);
  if (gh) return { kind: "github", text, url: gh[0].replace(/[.,;:!?)]+$/, "").replace(/\.git$/, "") };
  if (FIX.test(text)) return { kind: "fix", text };
  if (SUMMARIZE.test(text)) return { kind: "summarize", text };
  if (SHOW_FINDINGS.test(text)) return { kind: "showFindings", text };
  const named = withSwitch ? SWITCH_TO.exec(text) ?? USE_MODEL.exec(text) : null;
  if (named) return { kind: "switchModel", text, name: named[1].trim() };
  // "what did the scan find?" and "check this finding" are questions, not scan requests.
  if (QUESTION.test(text)) return { kind: "chat", text };
  if (RESCAN.test(text)) return { kind: "rescan", text };
  if (ABOUT_FINDINGS.test(text)) return { kind: "chat", text };
  if (SCAN_VERB.test(text) && SCAN_OBJECT.test(text)) return { kind: "scan", text, full: FULL.test(text) };
  return { kind: "chat", text };
}

const SEVERITY_WORDS: Record<string, Severity> = {
  critical: "CRITICAL", crit: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM", med: "MEDIUM",
  low: "LOW",
  unknown: "UNKNOWN",
  info: "NONE", informational: "NONE",
};

/** Finding ids as the static fixtures and the server write them. */
const FINDING_ID = /\bf-[0-9a-f]{6,}\b/gi;

/** Severity words in a message ("high and critical" → HIGH, CRITICAL). */
export function severitiesIn(text: string): Set<Severity> {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.filter((w) => w in SEVERITY_WORDS).map((w) => SEVERITY_WORDS[w]));
}

/** Findings whose path, or a file name longer than three characters, appears in the message. */
export function pathsIn<T extends { path: string }>(text: string, findings: T[]): Set<string> {
  const tokens = new Set(text.match(/[\w./-]+/g) ?? []);
  const paths = new Set<string>();
  for (const f of findings) {
    const name = f.path.split("/").pop() ?? f.path;
    if (tokens.has(f.path) || (name.length > 3 && tokens.has(name))) paths.add(f.path);
  }
  return paths;
}

/** Findings a message names by id (raw or merged id), in the order they are named. */
export function findingsNamed(text: string, findings: MergedFinding[]): MergedFinding[] {
  const out: MergedFinding[] = [];
  for (const id of text.match(FINDING_ID) ?? []) {
    const found = findings.find((f) => f.id === id.toLowerCase() || f.findingIds.includes(id.toLowerCase()));
    if (found && !out.includes(found)) out.push(found);
  }
  return out;
}

const VERDICT_RANK: Record<Verdict, number> = { CONFIRMED: 0, LIKELY_TRUE_POSITIVE: 0, UNVERIFIED: 1, LIKELY_FALSE_POSITIVE: 2 };

/**
 * The findings a fix request means (the harness's fix_targets): ids first; else severities and
 * files, leaving out likely false alarms. "fix all/everything" means every finding that is not a
 * likely false alarm. Most serious first. Empty when the message names nothing.
 */
export function fixTargets(text: string, findings: MergedFinding[]): MergedFinding[] {
  const named = findingsNamed(text, findings);
  if (named.length > 0) return named;
  const severities = severitiesIn(text);
  const paths = pathsIn(text, findings);
  const all = /\b(all|every|everything)\b/i.test(text);
  if (severities.size === 0 && paths.size === 0 && !all) return [];
  return findings
    .filter((f) => f.verdict !== "LIKELY_FALSE_POSITIVE"
      && (severities.size === 0 || severities.has(f.severity))
      && (paths.size === 0 || paths.has(f.path)))
    .sort((a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      || VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]
      || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      || (a.line ?? 0) - (b.line ?? 0));
}

/** "fix it", "fix these": the message points back at what the last reply talked about. */
export function refersBack(text: string): boolean {
  return /\b(it|this|that|those|these|them)\b/i.test(text);
}

export interface CommandContext {
  /** The latest scan's merged findings (false alarms included); empty before any scan. */
  findings: MergedFinding[];
  /** Finding ids the last reply talked about, for "fix it". */
  lastMentioned: string[];
  /** The models the chat can switch to; missing or empty: "switch to …" names none. */
  providers?: { id: string; displayName: string; modelName: string }[];
}

/** The name is one model's, or part of one or more (3+ letters): a switch, even if it must ask which. */
function namesAProvider(name: string, providers: { displayName: string; modelName: string }[]): boolean {
  const want = name.trim().toLowerCase();
  if (want.length < 3) return providerNamed(name, providers) !== undefined;
  return providers.some((p) => p.displayName.toLowerCase().includes(want) || p.modelName.toLowerCase().includes(want));
}

/**
 * The model a name means: its display or model name exactly (any case), else the only one whose
 * name contains it. Undefined when none or several do.
 */
export function providerNamed<T extends { displayName: string; modelName: string }>(name: string, providers: T[]): T | undefined {
  const want = name.trim().toLowerCase();
  if (!want) return undefined;
  const exact = providers.filter((p) => p.displayName.toLowerCase() === want || p.modelName.toLowerCase() === want);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  // A part of a name must be long enough to mean something ("c" is in half of them).
  if (want.length < 3) return undefined;
  const partial = providers.filter((p) => p.displayName.toLowerCase().includes(want) || p.modelName.toLowerCase().includes(want));
  return partial.length === 1 ? partial[0] : undefined;
}

/**
 * The command a message asks for, or undefined for a question. Static mode's chat decides with
 * this (the server asks its LLM instead), and the controller falls back to it when chat fails.
 */
export function commandFor(text: string, context: CommandContext): ChatCommand | undefined {
  const route = routeMessage(text);
  // "switch to the findings tab": names no model and says no "model", so the other rules decide.
  if (route.kind === "switchModel" && !namesAProvider(route.name, context.providers ?? []) && !MODEL_WORD.test(text)) {
    return commandForRoute(routeMessage(text, false), context);
  }
  return commandForRoute(route, context);
}

function commandForRoute(route: Route, context: CommandContext): ChatCommand | undefined {
  switch (route.kind) {
    case "cancel":
      return { kind: "cancel" };
    case "github":
      return { kind: "scanGithub", url: route.url };
    case "rescan":
      return { kind: "scan" };
    case "scan":
      return route.full ? { kind: "scan", full: true } : { kind: "scan" };
    case "fix":
      return { kind: "fix", findingIds: fixIds(route.text, context) };
    case "summarize":
      return { kind: "summarize" };
    case "showFindings":
      return { kind: "showFindings" };
    case "switchModel": {
      const provider = providerNamed(route.name, context.providers ?? []);
      return provider ? { kind: "switchModel", providerId: provider.id } : { kind: "switchModel" };
    }
    default:
      return undefined;
  }
}

/** fixTargets, else the findings the last reply named when the message points back ("fix it"). */
function fixIds(text: string, context: CommandContext): string[] {
  const targets = fixTargets(text, context.findings);
  if (targets.length > 0) return targets.map((f) => f.id);
  return refersBack(text) ? [...context.lastMentioned] : [];
}
