/* What every status, state and level means on screen: one label, one colour, one icon and a
   one-line explanation, so the dashboard and the AI Assistant say the same thing the same way,
   never with colour alone (components/ui/status-badge.tsx draws them). Colours are token names
   from reconix/theme.py (WEB_TOKENS); severity uses the TUI's own scale. Pure data: server and
   client components both import it. */
import type { Severity, Status } from "./data/schema";

/** A meaning's colour: teal = AI activity / progress, green = done, amber = waiting or to
    review, red = errors and blocked, slate = informational or neutral. */
export type Tone = "primary" | "success" | "warning" | "danger" | "info";

export type IconName =
  | "new"
  | "running"
  | "waiting"
  | "done"
  | "stopped"
  | "interrupted"
  | "planned"
  | "allowed"
  | "blocked"
  | "approved"
  | "rejected"
  | "pending"
  | "unreached"
  | "confirmed"
  | "review"
  | "closed"
  | "severity";

export interface Meaning {
  label: string;
  tone: Tone;
  icon: IconName;
  hint: string; // the tooltip: what it means and what to do
}

/** The CSS colour of a tone. */
export const toneColor = (tone: Tone) => `var(--${tone})`;

/** A run (saved assessment). There is no "failed": the saved data never records one. */
export const RUN_STATUS: Record<Status, Meaning> = {
  New: { label: "Not started", tone: "info", icon: "new", hint: "Saved before the run began." },
  Running: { label: "Running", tone: "primary", icon: "running", hint: "The TUI is playing this run now." },
  "Awaiting input": {
    label: "Waiting for you",
    tone: "warning",
    icon: "waiting",
    hint: "Paused until you decide in the TUI: an approval, or the target's sign-in.",
  },
  Completed: { label: "Completed", tone: "success", icon: "done", hint: "Every planned step ran." },
  Stopped: { label: "Stopped", tone: "info", icon: "stopped", hint: "You stopped this run in the TUI." },
  Interrupted: {
    label: "Interrupted",
    tone: "warning",
    icon: "interrupted",
    hint: "The TUI closed or went quiet before the run ended; it can't continue.",
  },
};

/** A plan step (phase) of a run. */
export const STEP_STATUS: Record<"pending" | "active" | "done", Meaning> = {
  pending: { label: "Planned", tone: "info", icon: "planned", hint: "Not started yet." },
  active: { label: "Running", tone: "primary", icon: "running", hint: "This step is going now." },
  done: { label: "Done", tone: "success", icon: "done", hint: "This step finished." },
};

/** An approval request of a gated (risky) action. Approvals are only ever given in the TUI. */
export const APPROVAL_STATE: Record<"APPROVED" | "REJECTED" | "PENDING" | "NOT REACHED", Meaning> = {
  APPROVED: { label: "Approved", tone: "success", icon: "approved", hint: "The operator approved this action in the TUI." },
  REJECTED: { label: "Rejected", tone: "danger", icon: "rejected", hint: "The operator rejected this action; it did not run." },
  PENDING: { label: "Waiting for approval", tone: "warning", icon: "pending", hint: "Decide in the TUI." },
  "NOT REACHED": { label: "Not reached", tone: "info", icon: "unreached", hint: "The run ended before it got here." },
};

/** A policy (scope) check of one request. */
export const POLICY_DECISION: Record<"allowed" | "blocked", Meaning> = {
  allowed: { label: "Allowed", tone: "success", icon: "allowed", hint: "Inside the approved scope." },
  blocked: { label: "Blocked by policy", tone: "danger", icon: "blocked", hint: "Outside the approved scope: it was never sent." },
};

/** A finding's review state. */
export const FINDING_REVIEW: Record<"confirmed" | "review" | "closed", Meaning> = {
  confirmed: { label: "Confirmed", tone: "success", icon: "confirmed", hint: "Validated with evidence." },
  review: { label: "Needs review", tone: "warning", icon: "review", hint: "Open and not confirmed yet." },
  closed: { label: "Closed", tone: "info", icon: "closed", hint: "Fixed, accepted or a false positive." },
};

/** Severity, on the TUI's four-level scale (theme.SEVERITY): its own colours, always with its
    name. There is no Info level: an older file's informational findings are never shown. */
export const SEVERITY_META: Record<Severity, { label: string; color: string; hint: string }> = {
  CRITICAL: { label: "Critical", color: "var(--sev-critical)", hint: "Fix first: severe impact, easy to exploit." },
  HIGH: { label: "High", color: "var(--sev-high)", hint: "Serious: fix soon." },
  MEDIUM: { label: "Medium", color: "var(--sev-medium)", hint: "Worth fixing; limited impact or harder to exploit." },
  LOW: { label: "Low", color: "var(--sev-low)", hint: "Minor." },
};

/** An approval's risk, as the TUI colours it (LOW green, MEDIUM amber, HIGH red). */
const RISK_TONE: Record<string, Tone> = { LOW: "success", MEDIUM: "warning", HIGH: "danger" };
export function riskMeaning(risk: string): Meaning {
  const name = risk ? `${risk[0]}${risk.slice(1).toLowerCase()}` : "Unknown";
  return {
    label: `${name} risk`,
    tone: RISK_TONE[risk] ?? "info",
    icon: "severity",
    hint: risk === "HIGH" ? "High risk: approved only after a double check in the TUI." : `${name} risk: needs the operator's approval in the TUI.`,
  };
}

/** A Scope Manifest's state. Testing starts only once the operator approves it in the TUI. */
export const SCOPE_STATE: Record<"approved" | "draft" | "none", Meaning> = {
  approved: { label: "Approved", tone: "success", icon: "approved", hint: "The operator approved this boundary in the TUI; testing stays inside it." },
  draft: { label: "Not approved", tone: "warning", icon: "pending", hint: "Drafted, not approved yet: testing waits until the operator approves it in the TUI." },
  none: { label: "No scope", tone: "info", icon: "unreached", hint: "No Scope Manifest yet: the TUI drafts one after the target and template are set." },
};

/** The state of a saved scope (`APPROVED`, `DRAFT`, …), or of none. */
export const scopeMeaning = (status: string | null): Meaning =>
  status === null ? SCOPE_STATE.none : status === "APPROVED" ? SCOPE_STATE.approved : SCOPE_STATE.draft;

/** A run's time against the limit its scope set. */
export const TIME_LIMIT: Record<"within" | "over", Meaning> = {
  within: { label: "Within the limit", tone: "success", icon: "done", hint: "The run ended inside the time limit its scope allowed." },
  over: { label: "Over the time limit", tone: "danger", icon: "interrupted", hint: "The run went on past the time limit its scope allowed." },
};
