/* The shapes the dashboard reads: one saved assessment, mapped by adapt.ts into the terms the
   viewer uses (log lines with a kind, findings with display fields, the scope as lists).
   Types only, so client components may import them freely. */
import type { Severity, Status } from "./schema";

export type { Severity, Status };

/** What a log line is about; it picks the line's chip, colour and chart height. */
export type LogKind = "scope" | "policy" | "tool" | "finding" | "mask" | "gate" | "user" | "info";

export interface LogLine {
  t: string; // local clock "14:03:09", or "—" when the line has no time
  sec: number; // seconds since the first line of the run
  kind: LogKind;
  who: string; // SYS, AI, TOOL, POLICY, USER (the TUI's activity log)
  text: string;
}

export interface EvidenceLine {
  text: string;
  tone: "request" | "response" | "masked";
}

export interface FindingView {
  id: string; // "F-001"
  title: string;
  severity: Severity;
  target: string;
  tool: string;
  cwe: string;
  category: string;
  score: number | null; // CVSS, when the finding has one
  rating: string; // "CVSS 6.5" or "no CVSS"
  validation: string; // CONFIRMED, UNCONFIRMED, INCONCLUSIVE, …
  confirmed: boolean;
  needsReview: boolean;
  falsePositive: boolean;
  status: string; // triage: open, fixed, accepted, false-positive
  description: string;
  impact: string;
  evidence: EvidenceLine[];
  remediation: string[];
  references: string[];
}

export type ApprovalState = "APPROVED" | "REJECTED" | "PENDING" | "NOT REACHED";

export interface ApprovalView {
  id: string;
  action: string;
  risk: string;
  target: string;
  state: ApprovalState;
}

export interface ScopeView {
  status: string; // APPROVED, DRAFT, …
  approved: boolean;
  target: string;
  include: string[];
  exclude: string[];
  ports: string[]; // allowed ports ("443"); empty: the template's defaults
  methods: string[];
  actions: string[];
  tools: string[];
  limits: { label: string; value: string }[];
  windowMinutes: number;
}

export interface PhaseView {
  key: string;
  label: string;
  status: "pending" | "active" | "done";
  pct: number;
}

export interface AssessmentView {
  uid: string;
  id: string;
  name: string;
  target: string;
  template: string;
  status: Status;
  unfinished: boolean;
  operator: string;
  startMs: number; // first line of the run (the charts' left edge)
  spanSec: number; // first to last line (the charts' width)
  createdMs: number; // when the assessment was created (places it on the all-runs axis)
  startedAt: string; // "14:03 · 5 Oct 2026"
  durationSec: number;
  progress: number; // 0–100
  phases: PhaseView[];
  log: LogLine[];
  findings: FindingView[];
  scope: ScopeView | null;
  apiSpec: { label: string; endpoints: number } | null; // the attached OpenAPI file, if any
  approvals: ApprovalView[];
  checks: { total: number; allowed: number; blocked: number };
  requests: number;
  gate: { time: string; text: string } | null; // what the run waits on, if it waits
}

/** One row of the assessment switcher. */
export interface LibraryItem {
  uid: string;
  id: string;
  template: string;
  target: string;
  status: Status;
  when: string; // "5 Oct 14:23"
  waiting: string; // what the run waits on ("HIGH approval for secret_validation"), or ""
}

/** A saved file the dashboard could not read, and why (see store.ts). */
export interface SkippedFile {
  file: string;
  reason: string;
}
