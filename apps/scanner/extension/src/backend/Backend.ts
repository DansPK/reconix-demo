// The single data-access interface. The controller and webview only ever talk to a Backend
// and never check which implementation (static or server) is behind it.
import type {
  AgentEvent,
  ChatReply,
  ConnectionStatus,
  FileEntry,
  FindingsPage,
  FindingsQuery,
  FixResult,
  LlmProvider,
  LlmProviderInput,
  LlmProviderUpdate,
  ProviderActivation,
  ProviderTest,
  ScanSummary,
  Session,
  SessionDetail,
  SummaryReply,
  SyncResult,
} from "../shared/contract";

export interface Unsubscribe {
  dispose(): void;
}

/** One method per server operation. */
export interface Backend {
  /** Connection state for the header (label already human-readable). */
  status(): Promise<ConnectionStatus>;

  createSession(title?: string): Promise<Session>;
  listSessions(): Promise<Session[]>;
  getSession(sessionId: string): Promise<SessionDetail>;
  renameSession(sessionId: string, title: string): Promise<Session>;
  deleteSession(sessionId: string): Promise<void>;

  /** Tell the server which files exist; it answers which ones it still needs. */
  syncFiles(sessionId: string, files: FileEntry[]): Promise<SyncResult>;
  /** Sends the files syncFiles reported missing, as one .tar.gz, to the server's copy of the session's code. */
  uploadCode(sessionId: string, archivePath: string, signal?: AbortSignal): Promise<void>;

  /** Scans the session's stored code. `paths` limits it to workspace-relative folders or files; missing means all. */
  startScan(sessionId: string, paths?: string[]): Promise<ScanSummary>;
  /** Replaces the session's code with a GitHub repo's, ready for startScan. Scripted: no host is contacted. */
  cloneRepo(sessionId: string, url: string, signal?: AbortSignal): Promise<void>;
  /** Calls onUpdate on every progress change until the scan ends or the handle is disposed. */
  watchScan(scanId: string, onUpdate: (scan: ScanSummary) => void): Unsubscribe;
  cancelScan(scanId: string): Promise<void>;
  getActiveScan?(sessionId: string): Promise<ScanSummary | undefined>;
  cancelSessionScan?(sessionId: string): Promise<ScanSummary | undefined>;
  getFindings(scanId: string, query?: FindingsQuery): Promise<FindingsPage>;

  /** The LLM providers chat and fixes can use; exactly one is active. The built-in RECONIX one is always there. */
  listProviders(): Promise<LlmProvider[]>;
  /** Adds a provider, inactive. */
  createProvider(input: LlmProviderInput): Promise<LlmProvider>;
  /** Not for the built-in or the active provider. */
  updateProvider(providerId: string, update: LlmProviderUpdate): Promise<LlmProvider>;
  /** Not for the built-in or the active provider. */
  deleteProvider(providerId: string): Promise<void>;
  /** The models an OLLAMA provider has; other provider types reject. */
  listProviderModels(providerId: string): Promise<string[]>;
  testProvider(providerId: string): Promise<ProviderTest>;
  /** A local provider becomes active at once; any other returns an approvalId to approve first. */
  activateProvider(providerId: string): Promise<ProviderActivation>;
  /** Approves a request from activateProvider, which makes that provider active. */
  approve(approvalId: string): Promise<void>;

  /** Every chat message comes here; the reply's `run` says when it is a command, not a question. */
  chat(sessionId: string, text: string, signal?: AbortSignal, onPiece?: (text: string) => void): Promise<ChatReply>;
  summarizeFindings(scanId: string): Promise<SummaryReply>;
  /**
   * Runs the fix agent on findings of the latest finished scan (at most 200). Streams its work
   * through onEvent and returns proposed edits; nothing is changed until the user applies them.
   */
  fixFindings(
    sessionId: string,
    findingIds: string[],
    onEvent: (event: AgentEvent) => void,
    signal?: AbortSignal,
  ): Promise<FixResult>;
}
