/* One saved assessment → the viewer's terms (AssessmentView). Pure: no I/O, no invented
   values. Anything the snapshot doesn't record is left out rather than filled in.

   The log is the TUI's activity log (timeline entries of type "activity"); each line gets a
   kind from who wrote it and what it says (see `kindOf`). */
import { clock, day, hourMinute, minutesLimit, parseTime, shortDay } from "./format";
import type { Assessment, Finding, TimelineEntry } from "./schema";
import { effectiveSeverity, isConfirmed, isFalsePositive, isUnfinished, needsReview, waitingApproval } from "./stats";
import type {
  ApprovalView,
  AssessmentView,
  EvidenceLine,
  FindingView,
  LibraryItem,
  LogKind,
  LogLine,
  PhaseView,
  ScopeView,
} from "./view-types";

// --- log ---------------------------------------------------------------------------------

/** The kind of an activity line, from its author (`who`), tone and text. */
export function kindOf(e: Pick<TimelineEntry, "who" | "tone" | "text">): LogKind {
  const t = e.text;
  switch (e.who) {
    case "POLICY":
      if (e.tone === "block" || /^blocked/i.test(t)) return "policy"; // a request refused by scope
      return e.tone === "warn" ? "gate" : "scope"; // approval / code gates; scope checks passed
    case "TOOL":
      return "tool";
    case "USER":
      return /^scope approved/i.test(t) ? "scope" : "user";
    case "AI":
      if (/mask/i.test(t)) return "mask";
      if (/^(candidate|finding)/i.test(t)) return "finding";
      return /scope/i.test(t) ? "scope" : "info";
    default:
      return /mask/i.test(t) ? "mask" : "info";
  }
}

function logLines(a: Assessment): { lines: LogLine[]; startMs: number; spanSec: number } {
  const entries = a.timeline.filter((e) => e.type === "activity");
  const times = entries.map((e) => parseTime(e.at)).filter((ms): ms is number => ms !== null);
  const startMs = times.length ? Math.min(...times) : (parseTime(a.created_at) ?? 0);
  const endMs = times.length ? Math.max(...times) : startMs;
  let lastSec = 0;
  const lines = entries.map((e) => {
    const ms = parseTime(e.at);
    if (ms !== null) lastSec = (ms - startMs) / 1000;
    return { t: ms === null ? "—" : clock(ms), sec: lastSec, kind: kindOf(e), who: e.who, text: e.text };
  });
  return { lines, startMs, spanSec: Math.max(1, (endMs - startMs) / 1000) };
}

// --- findings ----------------------------------------------------------------------------

const REQUEST = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TCP|read)\b/;

function evidenceTone(text: string): EvidenceLine["tone"] {
  if (/•|masked/i.test(text)) return "masked";
  return REQUEST.test(text) ? "request" : "response";
}

export function findingView(f: Finding): FindingView {
  const score = f.cvss_score > 0 ? f.cvss_score : null;
  return {
    id: /^\d+$/.test(f.id) ? `F-${f.id}` : f.id,
    title: f.title,
    severity: effectiveSeverity(f),
    target: f.affected_url || f.path || "—",
    tool: f.tool || "—",
    cwe: f.cwe[0] ?? f.references.find((r) => /^CWE-\d+$/.test(r)) ?? "—",
    category: f.category,
    score,
    rating: score === null ? "no CVSS" : `CVSS ${score.toFixed(1)}`,
    validation: f.validation || "UNCONFIRMED",
    confirmed: isConfirmed(f),
    needsReview: needsReview(f),
    falsePositive: isFalsePositive(f),
    status: f.status,
    description: f.description,
    impact: f.impact,
    evidence: f.evidence.map((text) => ({ text, tone: evidenceTone(text) })),
    remediation: f.remediation
      .split(/;\s+/)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r[0].toUpperCase() + r.slice(1)),
    references: [...new Set([...f.references, ...f.owasp, ...f.cve])],
  };
}

// --- scope and approvals -----------------------------------------------------------------

function scopeView(a: Assessment): ScopeView | null {
  const s = a.scope;
  if (!s) return null;
  return {
    status: s.status,
    approved: s.status === "APPROVED",
    target: s.target_url || a.target,
    include: [s.target_url || a.target, ...s.allowed_ports.map((p) => `port ${p}`)],
    exclude: s.excluded_paths,
    ports: s.allowed_ports.map(String),
    methods: s.allowed_methods,
    actions: s.allowed_actions,
    tools: s.tools,
    limits: [
      { label: "Methods", value: s.allowed_methods.join(", ") || "—" },
      { label: "Ports", value: s.allowed_ports.length ? s.allowed_ports.join(", ") : "default" },
      { label: "Window", value: minutesLimit(s.time_limit_minutes) },
    ],
    windowMinutes: s.time_limit_minutes,
  };
}

function approvalViews(a: Assessment): ApprovalView[] {
  const waiting = waitingApproval(a)?.request_id;
  return a.approvals.map((p) => {
    const decision = a.decisions.find((d) => d.request_id === p.request_id);
    const state = decision ? decision.decision : p.request_id === waiting ? "PENDING" : "NOT REACHED";
    return { id: p.request_id, action: p.action, risk: p.risk, target: p.target, state };
  });
}

/** What the run waits on now: an approval, or another input the TUI asked for. */
function gateOf(a: Assessment, lines: LogLine[]): AssessmentView["gate"] {
  if (a.status !== "Awaiting input") return null;
  const lastGate = [...lines].reverse().find((l) => l.kind === "gate");
  const time = lastGate?.t ?? clock(parseTime(a.saved_at) ?? Date.now());
  const approval = waitingApproval(a);
  if (approval) return { time, text: `${approval.action} · risk ${approval.risk} · awaiting approval` };
  return a.waiting_for ? { time, text: `${a.waiting_for} · awaiting input` } : null;
}

// --- run -------------------------------------------------------------------------------

function phases(a: Assessment): PhaseView[] {
  return a.plan.map((p) => ({
    key: p.key,
    label: p.label,
    status: p.status,
    pct: Math.round(a.run.progress[p.key] ?? (p.status === "done" ? 100 : 0)),
  }));
}

function progressOf(a: Assessment): number {
  if (a.run.completed || a.status === "Completed") return 100;
  const values = Object.values(a.run.progress);
  return values.length ? Math.round(values.reduce((n, v) => n + v, 0) / values.length) : 0;
}

/** Seconds from the run's start to its end (or to the last save while it goes on). */
function durationSec(a: Assessment): number {
  const start = parseTime(a.run.started_at) ?? parseTime(a.created_at);
  const end = parseTime(a.run.finished_at) ?? parseTime(a.saved_at);
  return start !== null && end !== null ? Math.max(0, (end - start) / 1000) : 0;
}

export function assessmentView(a: Assessment): AssessmentView {
  const { lines, startMs, spanSec } = logLines(a);
  const created = parseTime(a.created_at) ?? startMs;
  const allowed = a.verdicts.filter((v) => v.allowed).length;
  return {
    uid: a.uid,
    id: a.assessment_id || a.label || a.uid, // never empty: the RUN column and every run link name it
    name: [a.client, a.template.name || "Reconix", "assessment"].filter(Boolean).join(" "),
    target: a.target,
    template: a.template.name || "—",
    status: a.status,
    unfinished: isUnfinished(a),
    operator: a.operator || "—",
    startMs,
    spanSec,
    createdMs: created,
    startedAt: `${hourMinute(created)} · ${day(created)}`,
    durationSec: durationSec(a),
    progress: progressOf(a),
    phases: phases(a),
    log: lines,
    findings: a.findings.map(findingView),
    scope: scopeView(a),
    apiSpec: a.api_spec
      ? { label: [a.api_spec.title, a.api_spec.version].filter(Boolean).join(" "), endpoints: a.api_spec.endpoints }
      : null,
    approvals: approvalViews(a),
    checks: { total: a.verdicts.length, allowed, blocked: a.verdicts.length - allowed },
    requests: a.run.requests,
    gate: gateOf(a, lines),
  };
}

export function libraryItem(a: Assessment): LibraryItem {
  const created = parseTime(a.created_at) ?? 0;
  return {
    uid: a.uid,
    id: a.assessment_id || a.label || a.uid, // never empty: the RUN column and every run link name it
    template: a.template.name || "—",
    target: a.target,
    status: a.status,
    when: `${shortDay(created)} ${hourMinute(created)}`,
    waiting: a.status === "Awaiting input" ? a.waiting_for || "a decision" : "",
  };
}
