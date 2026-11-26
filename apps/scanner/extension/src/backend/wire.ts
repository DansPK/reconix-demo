// What the bundled scanner server sends over MCP (snake_case), and its mapping to the contract the UI uses.
import type * as contract from "../shared/contract";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface ManifestEntry {
  path: string;
  sha256: string;
  size: number;
}

export interface SessionInfo {
  session_id: string;
  name: string;
  target_type: "workspace" | "github";
  repo_url: string | null;
  created_at: string;
  last_scan_at: string | null;
  last_scan_status: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  created_at: string;
}

export interface SessionDetail {
  session: SessionInfo;
  messages: ChatMessage[];
  latest_scan_id: string | null;
  file_count: number;
}

export interface SyncResult {
  need: string[];
  delete: string[];
  unchanged_count: number;
}

export interface UploadTicket {
  upload_id: string;
  upload_url: string;
  expires_at: string;
}

export type ScanStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface ScanSummary {
  scan_id: string;
  session_id: string;
  status: ScanStatus;
  stage: string;
  /** What the stage does, for people. */
  label: string;
  percent: number;
  counts: Partial<Record<Severity, number>>;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface Finding {
  id: string;
  tools: string[];
  rule_id: string;
  title: string;
  severity: Severity;
  cwe: string | null;
  path: string;
  start_line: number;
  end_line: number;
  start_col: number | null;
  end_col: number | null;
  file_sha256: string;
  message: string;
  snippet: string;
  verdict: "likely_real" | "likely_false_positive" | "unsure";
  explanation: string;
  fix_recommendation: string;
  suggested_patch: string | null;
  status: "new" | "existing";
  web_url: string | null;
}

export interface FindingsPage {
  findings: Finding[];
  total: number;
}

/** Replace lines start_line..end_line (1-based, inclusive) with `replacement` ("" deletes them). */
export interface FixEdit {
  start_line: number;
  end_line: number;
  replacement: string;
}

/** The fix agent's changes to one file. They apply only to the file whose hash is `file_sha256`. */
export interface FileFix {
  path: string;
  file_sha256: string;
  edits: FixEdit[];
}

/** fixed: the scanners no longer report it; still_reported: they still do; not_verified: changed, but
 * SonarQube cannot recheck one file; not_fixed: its file was not changed (`note` says why). */
export interface FixOutcome {
  finding_id: string;
  status: "fixed" | "still_reported" | "not_verified" | "not_fixed";
  note: string;
}

/** One progress event of fix_findings (its progress `message` is this, as JSON). Text and thinking
 * stream in pieces to append; heartbeat events only keep the request alive. */
export interface AgentEvent {
  file: string | null;
  kind: "start" | "thinking" | "text" | "tool" | "result" | "status" | "done" | "heartbeat";
  text: string;
}

/** What fix_findings returns. */
export interface FixResult {
  files: FileFix[];
  summary: string;
  results: FixOutcome[];
}

export interface ChatReply {
  /** Empty when the message is a command: `action` says which. */
  reply: string;
  actions: contract.ChatAction[];
  action: contract.ChatCommand | null;
}

/** What the server needs from the extension to understand a message: only names and ids. */
export interface ChatContext {
  last_mentioned: string[];
  providers: { id: string; displayName: string; modelName: string }[];
}

const SEVERITY: Record<Severity, contract.Severity> = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW", info: "NONE" };
const VERDICT: Record<Finding["verdict"], contract.Verdict> = {
  likely_real: "LIKELY_TRUE_POSITIVE", likely_false_positive: "LIKELY_FALSE_POSITIVE", unsure: "UNVERIFIED",
};
const STATUS: Record<ScanStatus, contract.ScanStatus> = {
  queued: "RUNNING", running: "RUNNING", done: "COMPLETED", failed: "FAILED", cancelled: "CANCELLED",
};

/** A finding as the extension shows it. `index` numbers it ("RCX-001"). */
export function toFinding(f: Finding, scanId: string, index: number): contract.Finding {
  return {
    id: f.id, code: `RCX-${String(index + 1).padStart(3, "0")}`, scanId, tools: f.tools.map((t) => t.toUpperCase().replace(/-/g, "_")),
    findingStatus: "OPEN", ruleId: f.rule_id, title: f.title, severity: SEVERITY[f.severity], verdict: VERDICT[f.verdict],
    path: f.path, line: f.start_line, endLine: f.end_line, message: f.message, snippet: f.snippet,
    cwe: f.cwe ? [f.cwe] : [], fileSha256: f.file_sha256 || undefined,
    explanation: f.explanation || undefined, fixRecommendation: f.fix_recommendation || undefined,
  };
}

export function toScan(s: ScanSummary): contract.ScanSummary {
  const counts: contract.SeverityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0, NONE: 0 };
  for (const [k, n] of Object.entries(s.counts)) counts[SEVERITY[k as Severity]] = n;
  const running = s.status === "running" || s.status === "queued";
  return {
    scanId: s.scan_id, sessionId: s.session_id, status: STATUS[s.status],
    stage: !running ? "DONE" : s.stage === "analysis" ? "ANALYZING" : "SCANNING", progress: s.percent, counts, notes: [],
    startedAt: s.started_at ?? new Date().toISOString(), finishedAt: s.finished_at ?? undefined, error: s.error ?? undefined,
    ...(running ? { activeTool: s.stage, detail: s.label } : {}),
  };
}
