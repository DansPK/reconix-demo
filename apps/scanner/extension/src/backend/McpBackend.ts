// Backend over the bundled scanner server's MCP tools (server/server.ts), on this computer only.
// The server's snake_case is mapped here (wire.ts); nothing above this file sees it. Models are
// local (localProviders.ts).
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { HarnessClient, ServerUnreachableError, TokenRejectedError } from "../client";
import { makeFetch } from "../http";
import { fetchAllFindings } from "../scanFlow";
import type {
  AgentEvent, ChatReply, ConnectionStatus, FileEntry, FindingsPage, FindingsQuery, FixResult, FixStatus, LlmProvider,
  LlmProviderInput, LlmProviderUpdate, ProviderActivation, ProviderTest, ScanSummary, Session, SessionDetail, SummaryReply, SyncResult,
} from "../shared/contract";
import { uploadFile, UploadError } from "../upload";
import { hashFile } from "../workspaceFiles";
import type { Backend, Unsubscribe } from "./Backend";
import { isLoopback, LocalProviders } from "./localProviders";
import { staticSummary } from "./staticChat";
import { toFinding, toScan, type SessionInfo } from "./wire";

export interface McpBackendOptions {
  /** e.g. http://127.0.0.1:7357. Any address off this computer is refused. */
  serverUrl: string;
  /** From SecretStorage on demand. */
  getToken: () => Promise<string | undefined>;
  caCertificatePath?: string;
  /** How often a running scan is polled (tests make it short). */
  pollMs?: number;
}

/** A dropped connection during a scan is polled again this many times. */
const RECONNECT_ATTEMPTS = 6;
const DEFAULT_PAGE_LIMIT = 200;
const MAX_TITLE = 120;
const NOT_LOCAL = "The scanner server must run on this computer. Check reconix.serverUrl.";

export class McpBackend implements Backend {
  private client: HarnessClient | undefined;
  private clientToken: string | undefined;
  private readonly providers = new LocalProviders();
  /** Per session: the upload the next scan uses. */
  private readonly uploads = new Map<string, string>();
  /** Per session: the finding ids the last reply or summary offered to fix ("fix it" means these). */
  private readonly lastMentioned = new Map<string, string[]>();

  constructor(private readonly options: McpBackendOptions) {}

  async status(): Promise<ConnectionStatus> {
    const { serverUrl } = this.options;
    const settings = { label: "Open Settings", command: "reconix.openSettings" };
    const token = { label: "Set Token", command: "reconix.setToken" };
    if (!serverUrl) return { state: "disconnected", reason: "No server URL is set.", action: settings };
    if (!isLoopback(serverUrl)) return { state: "disconnected", reason: NOT_LOCAL, action: settings };
    if (!(await this.options.getToken())) return { state: "disconnected", reason: "No token is set.", action: token };
    try {
      await (await this.connection()).listSessions();
      return { state: "connected", label: "Connected to MCP Server" };
    } catch (err) {
      const action = err instanceof TokenRejectedError ? token : { label: "Retry", command: "reconix.reconnect" };
      return { state: "disconnected", reason: (err as Error).message, action };
    }
  }

  async createSession(title?: string): Promise<Session> {
    const client = await this.connection();
    const { session_id } = await client.createSession(cleanTitle(title) || undefined);
    return toSession((await client.getSession(session_id)).session);
  }

  /** Most recently active first. */
  async listSessions(): Promise<Session[]> {
    const { sessions } = await (await this.connection()).listSessions();
    return sessions.map(toSession).reverse().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(sessionId: string): Promise<SessionDetail> {
    const { session, messages } = await (await this.connection()).getSession(sessionId, 200);
    return {
      ...toSession(session),
      messages: messages.map((m, i) => ({ id: `${sessionId}-${i}`, role: m.role, text: m.text, createdAt: m.created_at })),
    };
  }

  async renameSession(sessionId: string, title: string): Promise<Session> {
    const clean = cleanTitle(title);
    if (!clean) throw new Error("A session name can't be empty.");
    const client = await this.connection();
    await client.renameSession(sessionId, clean);
    return toSession((await client.getSession(sessionId)).session);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await (await this.connection()).deleteSession(sessionId);
    this.uploads.delete(sessionId);
    this.lastMentioned.delete(sessionId);
  }

  async syncFiles(sessionId: string, files: FileEntry[]): Promise<SyncResult> {
    this.uploads.delete(sessionId);
    const manifest = files.map((f) => ({ path: f.path, sha256: f.sha256, size: f.sizeBytes }));
    return { missing: (await (await this.connection()).syncFiles(sessionId, manifest)).need };
  }

  async uploadCode(sessionId: string, archivePath: string, signal?: AbortSignal): Promise<void> {
    const client = await this.connection();
    const size = (await stat(archivePath)).size;
    const sha256 = await hashFile(archivePath);
    for (let attempt = 1; ; attempt++) {
      const ticket = await client.requestUpload(sessionId, size, sha256);
      try {
        await uploadFile(ticket.upload_url, archivePath, size, undefined, signal, client.fetchFn);
        this.uploads.set(sessionId, ticket.upload_id);
        return;
      } catch (err) {
        // An expired link gets one more try with a fresh one.
        if (!(err instanceof UploadError && err.status === 403 && attempt === 1)) throw err;
      }
    }
  }

  async cloneRepo(sessionId: string, url: string, signal?: AbortSignal): Promise<void> {
    await (await this.connection()).cloneRepo(sessionId, url, signal);
  }

  async startScan(sessionId: string, paths?: string[]): Promise<ScanSummary> {
    const client = await this.connection();
    const { scan_id } = await client.startScan(sessionId, { upload_id: this.uploads.get(sessionId), paths });
    this.uploads.delete(sessionId);
    return toScan(await client.getScanStatus(scan_id));
  }

  watchScan(scanId: string, onUpdate: (scan: ScanSummary) => void): Unsubscribe {
    let disposed = false;
    let last: ScanSummary | undefined;
    const poll = async (): Promise<void> => {
      let failures = 0;
      while (!disposed) {
        try {
          const scan = toScan(await (await this.connection()).getScanStatus(scanId));
          failures = 0;
          if (disposed) return;
          last = scan;
          onUpdate(scan);
          if (scan.status !== "RUNNING") return;
        } catch (err) {
          if (!(err instanceof ServerUnreachableError) || ++failures > RECONNECT_ATTEMPTS) {
            if (!disposed) onUpdate({ ...(last ?? UNKNOWN_SCAN), scanId, status: "FAILED", error: (err as Error).message });
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, this.options.pollMs ?? 400));
      }
    };
    void poll();
    return { dispose: () => { disposed = true; } };
  }

  async cancelScan(scanId: string): Promise<void> {
    await (await this.connection()).cancelScan(scanId);
  }

  async getFindings(scanId: string, query: FindingsQuery = {}): Promise<FindingsPage> {
    const client = await this.connection();
    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const { session_id } = await client.getScanStatus(scanId);
    // Every caller asks for false alarms too and filters them itself.
    const page = await client.getFindings(session_id, { scan_id: scanId, offset, limit });
    return { items: page.findings.map((f, i) => toFinding(f, scanId, offset + i)), total: page.total, offset, limit };
  }

  async listProviders(): Promise<LlmProvider[]> {
    return this.providers.list();
  }

  async createProvider(input: LlmProviderInput): Promise<LlmProvider> {
    return this.providers.create(input);
  }

  async updateProvider(providerId: string, update: LlmProviderUpdate): Promise<LlmProvider> {
    return this.providers.update(providerId, update);
  }

  async deleteProvider(providerId: string): Promise<void> {
    this.providers.delete(providerId);
  }

  async listProviderModels(providerId: string): Promise<string[]> {
    return this.providers.models(providerId);
  }

  async testProvider(providerId: string): Promise<ProviderTest> {
    return this.providers.test(providerId);
  }

  async activateProvider(providerId: string): Promise<ProviderActivation> {
    return this.providers.activate(providerId);
  }

  async approve(approvalId: string): Promise<void> {
    this.providers.approve(approvalId);
  }

  async chat(sessionId: string, text: string, signal?: AbortSignal, onPiece?: (text: string) => void): Promise<ChatReply> {
    signal?.throwIfAborted();
    const providers = this.providers.list().map(({ id, displayName, modelName }) => ({ id, displayName, modelName }));
    const answer = await (await this.connection()).chat(sessionId, text,
      { last_mentioned: this.lastMentioned.get(sessionId) ?? [], providers }, signal);
    const offered = answer.actions.find((a) => a.kind === "fixFindings" && a.findingIds?.length);
    if (offered?.findingIds) this.lastMentioned.set(sessionId, offered.findingIds);
    if (answer.reply) onPiece?.(answer.reply);
    return {
      message: { id: randomUUID(), role: "assistant", text: answer.reply, createdAt: new Date().toISOString() },
      actions: answer.actions,
      ...(answer.action ? { run: answer.action } : {}),
    };
  }

  /** The card, worked out from the scan's findings. */
  async summarizeFindings(scanId: string): Promise<SummaryReply> {
    const { session_id } = await (await this.connection()).getScanStatus(scanId);
    const { items } = await fetchAllFindings(this, scanId, { includeLikelyFalsePositives: true });
    const { card, text } = staticSummary(items);
    this.lastMentioned.set(session_id, card.fixFirst.flatMap((x) => x.findingIds));
    return { scanId, text, counts: card.counts, card };
  }

  async fixFindings(sessionId: string, findingIds: string[], onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<FixResult> {
    try {
      const result = await (await this.connection()).fixFindings(sessionId, findingIds, onEvent, signal);
      return {
        files: result.files.map((f) => ({
          path: f.path, fileSha256: f.file_sha256,
          edits: f.edits.map((e) => ({ startLine: e.start_line, endLine: e.end_line, replacement: e.replacement })),
        })),
        summary: result.summary,
        results: result.results.map((r) => ({ findingId: r.finding_id, status: r.status.toUpperCase() as FixStatus, note: r.note })),
      };
    } catch (err) {
      // The MCP client's own error has another name; the controller reads AbortError as "stopped".
      signal?.throwIfAborted();
      throw err;
    }
  }

  /** The client for the current token (a new token makes a new one). */
  private async connection(): Promise<HarnessClient> {
    if (!isLoopback(this.options.serverUrl)) throw new Error(NOT_LOCAL);
    const token = (await this.options.getToken()) ?? "";
    if (!this.client || token !== this.clientToken) {
      const old = this.client;
      this.client = new HarnessClient(this.options.serverUrl, token, makeFetch(this.options.caCertificatePath));
      this.clientToken = token;
      await old?.close();
    }
    return this.client;
  }
}

const UNKNOWN_SCAN: Omit<ScanSummary, "scanId" | "status"> = {
  sessionId: "", stage: "SCANNING", progress: 0, startedAt: "", notes: [],
  counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0, NONE: 0 },
};

function toSession(s: SessionInfo): Session {
  return { id: s.session_id, title: s.name, createdAt: s.created_at, updatedAt: s.last_scan_at ?? s.created_at };
}

function cleanTitle(title: string | undefined): string {
  return (title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
}
