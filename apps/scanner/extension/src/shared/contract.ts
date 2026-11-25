// Data shapes shared by the extension host, the webview and every Backend.
// This file IS the shared contract: the official shape of everything the extension and the
// Reconix server exchange. The server team builds against it; change it deliberately.
//
// Rules:
// - All file paths are workspace-relative and use forward slashes ("src/app.ts"), never absolute.
// - Timestamps are ISO-8601 strings.
// - Domain enum values (Severity, Verdict, ScanStatus, ScanStage) are UPPERCASE, as in Reconix-Core.
// - Pure types only: no runtime code, no vscode import (the webview imports this too).

/**
 * Same values as Reconix-Core's SeverityStatus.
 * - UNKNOWN: may be a real problem, but the scanner gave no usable severity (an advisory with no CVSS score).
 * - NONE: no risk; information only (a scanner's "info" result, an open port).
 */
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | "NONE";

/** Analyzer verdict on a raw scanner hit. */
export type Verdict = "CONFIRMED" | "LIKELY_TRUE_POSITIVE" | "LIKELY_FALSE_POSITIVE" | "UNVERIFIED";

/** Same values as Reconix-Core's AgentRunStatus. WAITING_APPROVAL: paused until a person approves a step. */
export type ScanStatus = "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";

/** Where a running scan is in its pipeline. */
export type ScanStage = "COLLECTING" | "ARCHIVING" | "UPLOADING" | "SCANNING" | "ANALYZING" | "DONE";

/** A button that fixes a connection problem: a "reconix." command, e.g. Set Token. */
export interface ConnectionAction {
  label: string;
  command: string;
}

export type ConnectionStatus =
  /** label: text for the header, e.g. "Connected (static data)". */
  | { state: "connected"; label: string }
  | { state: "connecting" }
  /** reason: what is wrong, in plain words; action: the button that fixes it, if there is one. */
  | { state: "disconnected"; reason: string; action?: ConnectionAction };

/** One workspace file offered to the server, used to skip unchanged uploads. */
export interface FileEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface SyncResult {
  /** Paths the server does not have yet (must be uploaded). */
  missing: string[];
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Can be read but not written to here (chat, scans): opened elsewhere, or before a server restart.
   * Worked out by the extension (no stored token for the session); the server does not send it.
   */
  readOnly?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
}

export interface SessionDetail extends Session {
  messages: Message[];
  lastScan?: ScanSummary;
}

export type SeverityCounts = Record<Severity, number>;

export interface ScanSummary {
  scanId: string;
  sessionId: string;
  status: ScanStatus;
  stage: ScanStage;
  /** 0..100, best effort. */
  progress: number;
  startedAt: string;
  finishedAt?: string;
  counts: SeverityCounts;
  /** Short lines about steps, e.g. "GITLEAKS FAILED" (a step that did not finish while the scan did). */
  notes: string[];
  error?: string;
  activeTool?: string;
  detail?: string;
}

/** Same values as Reconix-Core's FindingStatus: a person's review of a finding. */
export type FindingStatus = "OPEN" | "FALSE_POSITIVE" | "FIXED";

export interface Finding {
  id: string;
  /** Core's short name for the finding, e.g. "RCX-001". */
  code: string;
  scanId: string;
  /** Scanners that found it, named as core names them, e.g. ["SEMGREP"], ["OSV_SCANNER"]. */
  tools: string[];
  findingStatus: FindingStatus;
  ruleId: string;
  title: string;
  severity: Severity;
  verdict: Verdict;
  path: string;
  line?: number;
  endLine?: number;
  message: string;
  snippet?: string;
  cwe?: string[];
  /** SHA-256 of the file when it was scanned; the extension uses it to spot out-of-date findings. */
  fileSha256?: string;
  /** Plain explanation of the problem (from the analyzer review). */
  explanation?: string;
  /** Plain steps to fix it (from the analyzer review). */
  fixRecommendation?: string;
  /** Set when the fix agent cannot fix this automatically: why, and what to do instead. */
  manualFix?: string;
}

export interface FindingsPage {
  items: Finding[];
  total: number;
  offset: number;
  limit: number;
  /** Findings the server has that point at no file (e.g. a dependency problem); not in `items`. */
  withoutFile?: number;
}

/** A button the assistant offers under a reply. */
export interface ChatAction {
  kind: "scanWorkspace" | "rescan" | "showFindings" | "summarize" | "fixFindings";
  label: string;
  findingIds?: string[];
}

/**
 * Something the chat asks the extension to do now, decided by the backend (the server's LLM,
 * or static mode's keyword rules). The extension runs it; `actions` are only buttons.
 */
export interface ChatCommand {
  kind: "scan" | "scanGithub" | "cancel" | "fix" | "summarize" | "showFindings" | "switchModel";
  /** scan: scan every file again, even when nothing changed. */
  full?: boolean;
  /** scan: workspace-relative folders or files to limit the scan to; empty or missing means all. */
  paths?: string[];
  /** scanGithub: the https://github.com/owner/repo URL. */
  url?: string;
  /** fix: the findings to fix; empty when the message named none. */
  findingIds?: string[];
  /** switchModel: the LlmProvider to activate (core's SWITCH_MODEL). */
  providerId?: string;
  /** Ask the user Yes/No before running it. */
  confirm?: boolean;
}

export interface ChatReply {
  /** Shown in the chat unless its text is empty (a command with nothing to say). */
  message: Message;
  actions: ChatAction[];
  run?: ChatCommand;
}

/** Same values as Reconix-Core's ProviderType. */
export type ProviderType = "RECONIX" | "OPENAI" | "ANTHROPIC" | "DEEPSEEK" | "OLLAMA" | "OPENAI_API_COMPATIBLE";

/**
 * One LLM the chat and fix agent can run on: a provider with one model, as core stores it.
 * An API key goes in (LlmProviderInput) but never comes out; only its last 4 characters do.
 */
export interface LlmProvider {
  id: string;
  providerType: ProviderType;
  /** e.g. "GPT-4o". */
  displayName: string;
  /** e.g. "gpt-4o", "llama3.1:8b". */
  modelName: string;
  /** Empty: the cloud service's own address, or the server's default Ollama. */
  baseUrl?: string;
  apiKeyLast4?: string;
  /** The one chat and fixes use now. */
  isActive: boolean;
  /** Runs on the server's computer: it becomes active at once. Any other needs an approval first. */
  isLocal: boolean;
}

export interface LlmProviderInput {
  providerType: ProviderType;
  displayName: string;
  modelName: string;
  baseUrl?: string;
  /** OPENAI, ANTHROPIC and DEEPSEEK need one. Never logged or sent to the webview. */
  apiKey?: string;
}

/** Only the fields given change. apiKey null removes the stored key. */
export interface LlmProviderUpdate {
  displayName?: string;
  modelName?: string;
  baseUrl?: string;
  apiKey?: string | null;
}

/** The result of one fixed test prompt (with no Reconix data in it). */
export interface ProviderTest {
  ok: boolean;
  modelName: string;
  latencyMs: number;
  /** Why it failed, e.g. "MODEL_UNAVAILABLE". */
  code?: string;
  message?: string;
}

export interface ProviderActivation {
  provider: LlmProvider;
  /** Set when the provider is not local: it becomes active once this approval is approved. */
  approvalId?: string;
}

/** The card drawn after a scan: counts, then what to fix first. */
export interface SummaryCard {
  /** Merged findings, likely false alarms included. */
  total: number;
  counts: SeverityCounts;
  /** Findings verified or likely real. Absent when the server does not count verdicts (core today). */
  likelyReal?: number;
  falseAlarms?: number;
  /** Up to three files with the most findings worth fixing. */
  files: { path: string; count: number }[];
  /** One sentence on the overall state; absent when there is nothing to say. */
  overall?: string;
  /**
   * Up to three things to fix first; `findingIds` link to the findings (ids are not in `text`).
   * Core sends only the ids; without `text` the card shows the finding's title.
   */
  fixFirst: { text?: string; findingIds: string[] }[];
}

export interface SummaryReply {
  scanId: string;
  /** Markdown, the card as text (for the chat history and clients that do not draw cards). */
  text: string;
  counts: SeverityCounts;
  card: SummaryCard;
}

/** One line edit: replaces lines startLine..endLine (1-based, inclusive) with `replacement`. */
export interface FixEdit {
  startLine: number;
  endLine: number;
  /** New text for those whole lines, without a final newline; empty deletes them. */
  replacement: string;
}

/** The fix agent's changes to one file. Edits are sorted and never overlap. */
export interface FileFix {
  path: string;
  /** SHA-256 of the file the edits were made for; apply only if the file still has it. */
  fileSha256: string;
  edits: FixEdit[];
}

export type FixStatus =
  /** The scanners no longer report it. */
  | "FIXED"
  | "STILL_REPORTED"
  /** Changed, but it could not be rechecked; rescan to confirm. */
  | "NOT_VERIFIED"
  /** Its file was not changed; the note says why. */
  | "NOT_FIXED";

export interface FixOutcome {
  findingId: string;
  status: FixStatus;
  /** One plain sentence. */
  note: string;
}

/** What fixFindings returns. Nothing is changed on either side until the user applies it. */
export interface FixResult {
  files: FileFix[];
  /** Markdown: what the agent changed and why. */
  summary: string;
  /** One entry per requested finding. */
  results: FixOutcome[];
}

/**
 * Streamed while the fix agent works. `file` is the file an agent works on, or null for the whole
 * request; events of different files interleave.
 * - start: an agent starts on `file` ("3 findings")
 * - thinking / text: a streamed piece; append it to the previous piece of the same kind
 * - tool: one line per tool call ("Read db.py", "Edit db.py")
 * - result: one short line about the last tool's result ("+2 −1 lines")
 * - status: a line about the whole request ("Checking all changes with the scanners")
 * - done: the agent for `file` finished ("Finished 2 of 5 files")
 * - heartbeat: nothing to show; keeps the request alive
 */
export interface AgentEvent {
  file: string | null;
  kind: "start" | "thinking" | "text" | "tool" | "result" | "status" | "done" | "heartbeat";
  text: string;
}

export interface FindingsQuery {
  offset?: number;
  limit?: number;
  includeLikelyFalsePositives?: boolean;
}
