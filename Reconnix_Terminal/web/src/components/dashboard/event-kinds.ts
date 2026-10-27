/* What an activity-log line is about, as the Activity Timeline shows it: one labelled lane per
   kind (its label, colour and meaning), the short label of one line, and the status badge its
   details show. Pure data and functions (derive.ts runs them on the server).

   The meanings come from src/lib/status.ts where it has one (blocked by policy, approved,
   rejected, waiting for approval, running); the kinds themselves are not statuses, so their
   meanings are defined here (lib/status.ts is shared and frozen). */
import { APPROVAL_STATE, type Meaning, POLICY_DECISION, STEP_STATUS } from "@/lib/status";
import type { LogKind, Severity } from "@/lib/data/view-types";

/** The lanes, top to bottom, in the order a run usually goes through them. */
export const LANE_ORDER: readonly LogKind[] = ["scope", "policy", "tool", "finding", "gate", "user", "info", "mask"];

/** Each kind as a lane: its name, colour (a status tone) and what it holds. */
export const EVENT_KIND: Record<LogKind, Meaning> = {
  scope: {
    label: "Scope",
    tone: "success",
    icon: "allowed",
    hint: "The Scope Manifest, its approval and the scope checks that passed.",
  },
  policy: {
    label: "Policy",
    tone: "danger",
    icon: "blocked",
    hint: "Requests the policy blocked: outside the approved scope, so never sent.",
  },
  tool: { label: "Tool", tone: "primary", icon: "new", hint: "Tool steps the run executed inside the scope." },
  finding: { label: "Finding", tone: "warning", icon: "review", hint: "Candidate findings the AI recorded, to review." },
  gate: {
    label: "Approval gate",
    tone: "warning",
    icon: "pending",
    hint: "Risky actions that stopped until the operator decided in the TUI.",
  },
  user: { label: "Operator", tone: "info", icon: "new", hint: "What the operator did: approvals, sign-ins and choices." },
  info: { label: "Info", tone: "info", icon: "new", hint: "Session and run notes." },
  mask: { label: "Mask", tone: "info", icon: "closed", hint: "Evidence or output recorded with its secrets masked." },
};

/** What a line's details show as its status: a status meaning, or a finding's severity. */
export type EventBadge = { type: "status"; meaning: Meaning } | { type: "severity"; level: Severity };

const FINDING_ID = /\bF-\d+\b/;
const MAX_LABEL = 26;

const cut = (text: string) => (text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text);

/** The tool a TOOL line is about: an approved tool it names, else the line shortened
    ("Executing baseline request" → "baseline request"). */
export function toolLabel(text: string, tools: string[]): string {
  const named = tools.find((t) => text.toLowerCase().includes(t.toLowerCase()));
  if (named) return named;
  const part = text.split(" · ")[0].split(":")[0];
  return cut(part.replace(/^(executing|running|continuing on)\s+/i, "").replace(/…$/, ""));
}

/** The approved tools a run's TOOL lines name, in the order they first appear. */
export function toolsNamed(texts: string[], tools: string[]): string[] {
  const seen: string[] = [];
  for (const text of texts) {
    const t = tools.find((name) => text.toLowerCase().includes(name.toLowerCase()));
    if (t && !seen.includes(t)) seen.push(t);
  }
  return seen;
}

/** A line's short label: the tool, the finding ID, the risk of a gate, else its first words. */
export function eventLabel(kind: LogKind, text: string, tools: string[]): string {
  if (kind === "tool") return toolLabel(text, tools);
  if (kind === "finding") return text.match(FINDING_ID)?.[0] ?? cut(text);
  if (kind === "gate") {
    const risk = text.match(/risk:\s*([A-Z]+)/i)?.[1];
    if (risk) return `${risk.toUpperCase()} risk`;
  }
  return cut(text.split(" · ")[0].split(":")[0].trim() || text);
}

/** The status a line records, from who wrote it, its kind and its own words (nothing is guessed
    beyond them): blocked (a policy block), allowed (a scope check the policy passed), approved
    or rejected (only the operator's own USER lines: "Continuing within approved scope" is the
    policy talking, not an approval), waiting (the gate a waiting run stopped at), running (the
    last tool step of a run that is running now), or the severity of the finding it names. */
export function eventBadge(
  kind: LogKind,
  text: string,
  at: { who: string; pendingGate: boolean; liveTool: boolean; severityOf: (id: string) => Severity | undefined },
): EventBadge {
  const status = (meaning: Meaning): EventBadge => ({ type: "status", meaning });
  switch (kind) {
    case "policy":
      return status(POLICY_DECISION.blocked);
    case "gate":
      return status(at.pendingGate ? APPROVAL_STATE.PENDING : EVENT_KIND.gate);
    case "tool":
      return status(at.liveTool ? STEP_STATUS.active : EVENT_KIND.tool);
    case "finding": {
      const level = at.severityOf(text.match(FINDING_ID)?.[0] ?? "");
      return level ? { type: "severity", level } : status(EVENT_KIND.finding);
    }
    case "scope":
    case "user":
      if (at.who === "USER" && /\brejected\b/i.test(text)) return status(APPROVAL_STATE.REJECTED);
      if (at.who === "USER" && /\bapproved\b/i.test(text)) return status(APPROVAL_STATE.APPROVED);
      if (at.who === "POLICY" && /\bpassed\b/i.test(text)) return status(POLICY_DECISION.allowed);
      return status(EVENT_KIND[kind]);
    default:
      return status(EVENT_KIND[kind]);
  }
}
