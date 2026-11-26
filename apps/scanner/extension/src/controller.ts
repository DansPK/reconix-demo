// The only place that coordinates VS Code (commands, notifications, editor) with the Backend and
// the webview. It never checks which Backend is active.
import { realpath } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Backend } from "./backend/Backend";
import { affectsBackend, TOKEN_SECRET_KEY } from "./backend/createBackend";
import { findingRange, findingUri, type FindingsDisplay } from "./diagnostics";
import {
  countBySeverity,
  mergeFindings,
  prepareFindings,
  scanSummaryText,
  toFindingView,
  underPaths,
  type MergedFinding,
} from "./findingsLogic";
import { errorAction } from "./errorActions";
import { ADDABLE_TYPES, MODEL_PLACEHOLDER, PRESET_MODELS, PROVIDER_LABEL, providerFields, providerSave, testStatus } from "./providerLogic";
import { explainFindingText, explainSelectionText, relativeContractPath, selectionLines } from "./editorLogic";
import {
  applyEdits,
  CONFIRM_FIX_ABOVE,
  fixAllIds,
  fixOutcomeText,
  fixPlanText,
  MAX_FIX_FINDINGS,
  mergedOutcomes,
  mergeEdits,
  outcomeLabel,
} from "./fixLogic";
import { log } from "./log";
import { renderMarkdown } from "./markdown";
import { commandFor, githubRepoUrl, type CommandContext } from "./routing";
import { DEFAULT_CANCEL_GRACE_MS, fetchAllFindings, liveRefresh, runScanFlow, scanAndWatch, watchUntilDone } from "./scanFlow";
import { sessionFitsFolder, sessionToOpen } from "./sessionLogic";
import type { ChatCommand, ChatReply, FileFix, Finding, FixOutcome, ConnectionAction, FixResult, LlmProvider, LlmProviderInput, Message, ProviderTest, ScanStage, ScanSummary, Session } from "./shared/contract";
import type { HostToWebview, MessageView, WebviewToHost } from "./shared/messages";
import { hashFile, isSafeContractPath, toContractPath } from "./workspaceFiles";

const SCAN_RUNNING_CONTEXT = "reconix.scanRunning";
const CONFIG_SECTION = "reconix";
/** Chat errors the keyword rules must not paper over: the session refused the message. */
const NO_KEYWORD_FALLBACK = /^(CHAT_IN_PROGRESS|SESSION_READ_ONLY|NOT_YOUR_SESSION|SESSION_CLOSED|NOT_VSCODE_SESSION)\b/;
/** scanOnSave waits this long after the last save, so several quick saves start one scan. */
const SCAN_ON_SAVE_DELAY_MS = 2000;
/** Findings of a running scan are re-fetched at most this often (like the reference). */
const LIVE_REFRESH_MS = 1500;
const OUTDATED_TEXT = "This file changed since the scan. The line may have moved. Click Rescan to update.";
/** workspaceState: the session this workspace had open last. */
const LAST_SESSION_KEY = "reconix.lastSession";
/** globalState: session id → absolute path of the folder it scans (session ids are global). */
const SESSION_FOLDERS_KEY = "reconix.sessionFolders";
/** workspaceState, per session: raw finding ids the user chose to ignore here (local only). */
const IGNORED_KEY = "reconix.ignored";
/** globalState: chat history the extension kept before the backend did (Phase 2); removed once. */
const OLD_HISTORY_KEY = "reconix.history";
/** Virtual documents holding a proposed fix, shown on the right of the diff editor. */
// Not "reconix-fix": the released extension uses that, and both can be installed.
const FIX_SCHEME = "reconix-local-fix";

/** What the notification says while the extension prepares files, before the backend scan starts. */
const PREPARE_TEXT: Partial<Record<ScanStage, string>> = {
  COLLECTING: "Looking at your files...",
  ARCHIVING: "Packing files...",
  UPLOADING: "Uploading files...",
};

/** The latest scan's messages, re-sent when the webview reloads its state. */
interface LastScan {
  sessionId: string;
  /** The scanned folder; for a GitHub repo, its https URL (no local files). */
  rootUri: vscode.Uri;
  /** Set for a GitHub repo scan: no Problems entries, findings open on GitHub, no fixes. */
  repoUrl?: string;
  /** Findings the backend has that point at no file, so they aren't listed. */
  withoutFile?: number;
  scanId?: string;
  progress?: Extract<HostToWebview, { type: "progress" }>;
  findings?: Extract<HostToWebview, { type: "findings" }>;
  /** The summary card, re-sent after a reload like the findings. */
  summary?: Extract<HostToWebview, { type: "summary" }>;
  /** Every finding the backend returned (with false positives), re-filtered when settings change. */
  raw: Finding[];
  /** A path scan's findings outside its paths, kept from the scan before (core lists only the paths'). */
  kept: Finding[];
  byId: Map<string, MergedFinding>;
}

/** What a session's last scan saw, so an unchanged rescan can be skipped. */
interface ScanRecord {
  folder: string;
  fingerprint: string;
  completed: boolean;
}

export class Controller {
  private post: (message: HostToWebview) => void = () => undefined;
  private currentSessionId: string | undefined;
  /** The current session's chat history (see remember / loadHistory). */
  private messages: Message[] = [];
  private runningScan: AbortController | undefined;
  /** Each session's latest scan, kept while VS Code runs, so switching back shows its findings. */
  private readonly scansBySession = new Map<string, LastScan>();
  private readonly scanRecords = new Map<string, ScanRecord>();
  private fixing = false;
  /** Finding ids the last reply offered to fix, for "fix it" / "fix these". */
  private lastMentioned: string[] = [];
  /** Yes/No questions waiting for an answer from the chat, by id. */
  private readonly pending = new Map<string, { yes: string; no: string; onYes: () => Promise<void>; onNo?: () => void }>();
  /** Proposed file contents for the fix diff editor, by virtual URI. */
  private readonly proposed = new Map<string, string>();
  /** Contract paths with findings saved since the last scan: the Rescan button counts them. */
  private readonly savedWithFindings = new Set<string>();
  private scanOnSaveTimer: ReturnType<typeof setTimeout> | undefined;
  /** The models as last sent to the model menu: "switch to …" looks names up here. */
  private providers: LlmProvider[] = [];
  /** A question from the editor (Explain) waiting for the chat to load; sent on "ready". */
  private queuedAsk: string | undefined;
  /** The chat's script has loaded ("ready") and its view is still open. */
  private viewReady = false;
  /** A model picked in the Command Palette while the chat was loading: activated on "ready". */
  private queuedActivation: string | undefined;
  /** Active chat request to backend; aborts if the user clicks the square stop button. */
  private activeChatAbort: AbortController | undefined;

  private backend: Backend;
  /** A setting the backend is built from changed; reconnect builds it again. */
  private backendStale = false;

  constructor(
    /** Builds the Backend for the current settings; called again when they change (see reconnect). */
    private readonly makeBackend: () => Backend,
    /** Where the current findings are drawn: the Problems panel and the editor add-ons. */
    private readonly diagnostics: FindingsDisplay,
    /** globalState: which folder each session scans. */
    private readonly store: vscode.Memento,
    /** workspaceState: the session this workspace had open last. */
    private readonly workspaceStore: vscode.Memento,
    /** The only place the token is kept. */
    private readonly secrets: vscode.SecretStorage,
  ) {
    this.backend = makeBackend();
    // History now comes from the backend; drop what older versions kept in globalState (a no-op once gone).
    void this.store.update(OLD_HISTORY_KEY, undefined);
    void this.store.update(LAST_SESSION_KEY, undefined);
  }

  /** The current session's latest scan. */
  private get lastScan(): LastScan | undefined {
    return this.currentSessionId ? this.scansBySession.get(this.currentSessionId) : undefined;
  }

  private set lastScan(scan: LastScan | undefined) {
    if (scan) this.scansBySession.set(scan.sessionId, scan);
  }

  /** Serves the proposed side of fix diffs; extension.ts disposes it. */
  registerFixDocuments(): vscode.Disposable {
    return vscode.workspace.registerTextDocumentContentProvider(FIX_SCHEME, {
      provideTextDocumentContent: (uri) => this.proposed.get(uri.toString()) ?? "",
    });
  }

  /** Wired by extension.ts once the chat view provider exists. */
  attachView(post: (message: HostToWebview) => void): void {
    this.post = post;
  }

  async onWebviewMessage(message: WebviewToHost): Promise<void> {
    try {
      switch (message.type) {
        case "ready": {
          this.viewReady = true;
          await this.sendState();
          const queued = this.queuedAsk;
          this.queuedAsk = undefined;
          if (queued) this.post({ type: "ask", text: queued });
          const activation = this.queuedActivation;
          this.queuedActivation = undefined;
          if (activation) await this.activateProvider(activation);
          return;
        }
        case "send":
          await this.handleSend(message.text);
          return;
        case "selectSession":
          await this.selectSession(message.sessionId);
          return;
        case "renameSession":
          await this.renameSession(message.sessionId, message.title);
          return;
        case "deleteSession":
          await this.deleteSession(message.sessionId, message.confirmed ?? false);
          return;
        case "deleteAllSessions":
          await this.deleteAllSessions();
          return;
        case "newSession":
          await this.newSession();
          return;
        case "runAction":
          await this.runAction(message.action);
          return;
        case "cancelScan":
          await this.cancelScan();
          return;
        case "cancelChat":
          this.cancelChat();
          return;
        case "insertCode": {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            void vscode.window.showInformationMessage("Reconix: Open a file in the editor to insert code.");
            return;
          }
          await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, message.text);
          });
          return;
        }
        case "openFinding":
          await this.openFinding(message.findingId);
          return;
        case "answerConfirm":
          await this.answerConfirm(message.id, message.accept);
          return;
        case "activateProvider":
          await this.activateProvider(message.providerId);
          return;
        case "saveProvider":
          await this.saveProvider(message.formId, message.providerId, message.provider);
          return;
        case "testProvider":
          await this.testProvider(message.formId, message.providerId);
          return;
        case "deleteProvider":
          await this.deleteProvider(message.providerId);
          return;
        case "runCommand":
          // The page may only start our own commands, never any VS Code command.
          if (message.command.startsWith(`${CONFIG_SECTION}.`)) {
            await vscode.commands.executeCommand(message.command);
          }
          return;
        case "showFalsePositives":
          // The configuration listener re-renders the findings.
          await vscode.workspace
            .getConfiguration(CONFIG_SECTION)
            .update("showLikelyFalsePositives", message.on, vscode.ConfigurationTarget.Global);
          return;
      }
    } catch (err) {
      log.error(`webview message "${message.type}" failed`, err);
      this.postError(errorText(err));
    }
  }

  // ---- commands --------------------------------------------------------------------------

  /** Saves a token (asked for in a password box when not given) in SecretStorage, then reconnects. */
  async setToken(token?: string): Promise<void> {
    const value = token ?? await vscode.window.showInputBox({
      title: "Reconix Code Scanner: server token",
      prompt: "Paste the token of your Reconix scanner server.",
      password: true,
      ignoreFocusOut: true,
    });
    if (!value?.trim()) return;
    await this.secrets.store(TOKEN_SECRET_KEY, value.trim());
    log.info("sign-in: saved in secure storage");
    void vscode.window.showInformationMessage("Reconix Code Scanner: the token is saved in secure storage.");
    await this.reconnect();
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete(TOKEN_SECRET_KEY);
    log.info("sign-in: removed from secure storage");
    void vscode.window.showInformationMessage("Reconix Code Scanner: the token is removed.");
    await this.reconnect();
  }

  async openSettings(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.openSettings", `${CONFIG_SECTION}.serverUrl`);
  }

  /**
   * Shows "Connecting…" and asks the backend for its status again (the Retry button). After a
   * change to a setting the backend is built from, it builds a new one first and starts clean.
   */
  async reconnect(): Promise<void> {
    if (this.backendStale) {
      const busy = this.busyText();
      if (busy) {
        this.postError(`${busy} The new server settings apply after that: run Reconnect then.`, this.busyAction());
        return;
      }
      for (const id of this.pending.keys()) this.post({ type: "confirmDone", id });
      this.pending.clear();
      this.backend = this.makeBackend();
      this.backendStale = false;
      this.providers = []; // the old backend's models mean nothing to the new one
      this.scansBySession.clear();
      this.scanRecords.clear();
      this.diagnostics.clear();
      this.currentSessionId = undefined;
      this.messages = [];
      this.lastMentioned = [];
      log.info("backend: built again for the new settings");
    }
    this.post({ type: "connection", connection: { state: "connecting" } });
    await this.sendState();
  }

  /**
   * A token pasted into the reconix.token user setting moves to SecretStorage, and the
   * setting is cleared. Returns whether it moved one.
   * Only the user (global) value counts: a cloned repo's .vscode/settings.json must never be able
   * to swap the token (the setting is also "scope": "application" in package.json).
   */
  async moveTokenFromSettings(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const value = (config.inspect<string>("token")?.globalValue ?? "").trim();
    if (!value) return false;
    await this.secrets.store(TOKEN_SECRET_KEY, value);
    await config.update("token", undefined, vscode.ConfigurationTarget.Global).then(undefined, (err: unknown) =>
      log.warn(`sign-in: could not clear the settings value (${errorText(err)})`));
    log.info("sign-in: moved from settings to secure storage");
    void vscode.window.showInformationMessage("Reconix Code Scanner: the token was saved in secure storage and removed from your settings file.");
    return true;
  }

  async openChat(): Promise<void> {
    await vscode.commands.executeCommand("reconix.chat.focus");
  }

  // ---- sessions ------------------------------------------------------------------------

  async newSession(): Promise<void> {
    if (this.busyText()) {
      this.postError(this.busyText()!, this.busyAction());
      return;
    }
    const session = await this.backend.createSession();
    log.info(`session: created ${session.id}`);
    await this.selectSession(session.id);
    await this.openChat();
  }

  /** The Command Palette's Switch Session: a quick pick over every session, newest first. */
  async switchSession(): Promise<void> {
    const sessions = await this.backend.listSessions();
    const pick = await vscode.window.showQuickPick(
      sessions.map((s) => ({
        label: s.title,
        description: s.id === this.currentSessionId ? "current" : undefined,
        detail: `Last active ${new Date(s.updatedAt).toLocaleString()}`,
        id: s.id,
      })),
      { placeHolder: "Switch to which session?" },
    );
    if (!pick) return;
    await this.selectSession(pick.id);
    await this.openChat();
  }

  /** Why the session can't change now (a scan or the fix agent is running), or undefined. */
  /** The button for busyText: a running scan can be stopped; the fix agent can't. */
  private busyAction(): ConnectionAction | undefined {
    return this.runningScan ? { label: "Cancel Scan", command: "reconix.cancelScan" } : undefined;
  }

  private busyText(): string | undefined {
    if (this.runningScan) return "A scan is running. Switch sessions after it finishes, or stop it first.";
    if (this.fixing) return "The fix agent is running. Switch sessions after it finishes.";
    return undefined;
  }

  /** Opens a session: its history, its last scan's findings and Problems-panel entries. */
  private async selectSession(sessionId: string): Promise<void> {
    if (sessionId === this.currentSessionId) return;
    if (this.busyText()) {
      this.postError(this.busyText()!, this.busyAction());
      return;
    }
    // A question from the old session (Apply fix / Skip ...) can't be answered from the new one.
    for (const id of this.pending.keys()) this.post({ type: "confirmDone", id });
    this.pending.clear();
    await this.open(sessionId);
    await this.sendState();
  }

  /** Makes `sessionId` current: its history from the backend, and its last scan's Problems entries. */
  private async open(sessionId: string): Promise<void> {
    this.currentSessionId = sessionId;
    const history = await this.loadHistory(sessionId);
    // Another session was opened while this history loaded: keep that one's.
    if (this.currentSessionId !== sessionId) return;
    this.messages = history;
    this.lastMentioned = [];
    this.savedWithFindings.clear();
    await this.workspaceStore.update(LAST_SESSION_KEY, sessionId);
    const scan = this.lastScan;
    if (scan?.scanId && !scan.repoUrl) this.diagnostics.show(scan.rootUri, [...scan.byId.values()]);
    else this.diagnostics.clear();
    const active = await this.backend.getActiveScan?.(sessionId);
    if (active && !["COMPLETED", "FAILED", "CANCELLED"].includes(active.status)) {
      this.postProgress(active);
    }
    log.info(`session: opened ${sessionId} (${this.messages.length} messages)`);
  }

  private async renameSession(sessionId: string, title: string): Promise<void> {
    if (!title.trim()) return;
    await this.backend.renameSession(sessionId, title);
    await this.postSessions();
  }

  /** The History menu asks inside the row and passes `confirmed`; anything else gets a modal first. */
  private async deleteSession(sessionId: string, confirmed: boolean): Promise<void> {
    if (!confirmed) {
      const title = (await this.backend.listSessions()).find((s) => s.id === sessionId)?.title ?? sessionId;
      const answer = await vscode.window.showWarningMessage(`Delete the session "${title}"? Its history and findings are removed.`, { modal: true }, "Delete");
      if (answer !== "Delete") return;
    }
    if (sessionId === this.currentSessionId && this.busyText()) {
      this.postError(this.busyText()!, this.busyAction());
      return;
    }
    await this.removeSession(sessionId);
    await this.afterDelete();
  }

  /** "Delete all" in the History menu (confirmed there). */
  private async deleteAllSessions(): Promise<void> {
    if (this.busyText()) {
      this.postError(this.busyText()!, this.busyAction());
      return;
    }
    const sessions = await this.backend.listSessions();
    for (const s of sessions) await this.removeSession(s.id);
    log.info(`session: deleted all ${sessions.length}`);
    await this.afterDelete();
  }

  private async removeSession(sessionId: string): Promise<void> {
    await this.backend.deleteSession(sessionId);
    this.scansBySession.delete(sessionId);
    await this.workspaceStore.update(`${IGNORED_KEY}.${sessionId}`, undefined);
    const { [sessionId]: _removed, ...folders } = this.sessionFolders();
    await this.store.update(SESSION_FOLDERS_KEY, folders);
    if (sessionId === this.currentSessionId) {
      this.currentSessionId = undefined;
      this.messages = [];
      this.diagnostics.clear();
    }
    log.info(`session: deleted ${sessionId}`);
  }

  /** After a delete: stay in the open session, else open the newest one, else a new one. */
  private async afterDelete(): Promise<void> {
    if (this.currentSessionId) {
      await this.postSessions();
      return;
    }
    const sessions = await this.backend.listSessions();
    await this.selectSession(sessions[0]?.id ?? (await this.backend.createSession()).id);
  }

  /** Just the session list (after a rename or delete), without redrawing the chat. */
  private async postSessions(): Promise<void> {
    this.post({ type: "sessions", sessions: await this.backend.listSessions(), currentSessionId: this.currentSessionId });
  }

  /** The session's history as the backend stored it (the user's messages and the replies). */
  private async loadHistory(sessionId: string): Promise<Message[]> {
    try {
      return (await this.backend.getSession(sessionId)).messages;
    } catch (err) {
      log.warn(`session: could not load the history of ${sessionId} (${errorText(err)})`);
      return [];
    }
  }

  /**
   * Adds a message to what the chat shows now. Only the backend keeps history, so the extension's
   * own lines (scan cards, "Switched to ...") are gone after a reload (decided 2026-11-06).
   */
  private remember(message: Message): void {
    this.messages.push(message);
  }

  private sessionFolders(): Record<string, string> {
    return this.store.get<Record<string, string>>(SESSION_FOLDERS_KEY, {});
  }

  private openFolders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  }

  /**
   * Scan a workspace folder. With nothing changed since the last finished scan it stops early,
   * unless `full` ("scan everything again from scratch"). `quiet`: a background scan (scan on
   * save): no chat focus, no notification, no card or "nothing changed" lines.
   */
  async scanWorkspace(full = false, paths?: string[], inFolder?: vscode.Uri, quiet = false): Promise<void> {
    if (this.runningScan) {
      this.postError("A scan is already running. Wait for it, or cancel it.", { label: "Cancel Scan", command: "reconix.cancelScan" });
      return;
    }
    if (this.fixing) {
      this.postError("The fix agent is running. Scan after it finishes.");
      return;
    }
    // Claim the scan before the first await, so a second click can't start another one.
    const abort = new AbortController();
    this.runningScan = abort;
    let endPrepare = (): void => undefined;
    let live: ReturnType<typeof liveRefresh> | undefined;
    let folder: vscode.Uri | undefined = inFolder;
    let sessionId: string | undefined;
    try {
      folder = inFolder ?? await this.pickFolder();
      if (!folder) {
        return;
      }
      const previous = this.currentSessionId;
      await this.ensureSession(folder.fsPath);
      sessionId = this.currentSessionId;
      if (!sessionId) {
        this.postError("There is no session to scan in.");
        return;
      }
      const activeFolder = folder;
      const activeSessionId = sessionId;
      if (previous && previous !== activeSessionId) {
        await this.sendState();
        this.say(`**${path.basename(activeFolder.fsPath)}** is scanned in a session of its own (the open one scans another folder, or can only be read here).`);
      }
      await this.store.update(SESSION_FOLDERS_KEY, { ...this.sessionFolders(), [activeSessionId]: activeFolder.fsPath });
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      await vscode.commands.executeCommand("setContext", SCAN_RUNNING_CONTEXT, true);
      if (!quiet) await this.openChat();
      const say = (text: string): void => {
        if (!quiet) this.say(text);
      };

      // Like the reference: a cancellable notification while files are prepared; once the backend
      // scan runs, progress moves to the chat.
      let reportPrepare: (text: string) => void = () => undefined;
      const prepared = new Promise<void>((resolve) => (endPrepare = resolve));
      if (!quiet) void vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Reconix", cancellable: true },
        async (progress, token) => {
          token.onCancellationRequested(() => abort.abort());
          reportPrepare = (text) => progress.report({ message: text });
          reportPrepare(PREPARE_TEXT.COLLECTING ?? "");
          await prepared;
        },
      );

      const record = this.scanRecords.get(activeSessionId);
      let fingerprint = "";
      const started = Date.now();
      log.info(`scan: starting in session ${activeSessionId}`);
      const result = await runScanFlow(this.backend, {
        rootDir: activeFolder.fsPath,
        sessionId: activeSessionId,
        maxFileSizeKB: config.get<number>("maxFileSizeKB", 2048),
        maxUploadMB: config.get<number>("maxUploadMB", 200),
        extraExcludes: config.get<string[]>("extraExcludes", []),
        paths,
        signal: abort.signal,
        shouldScan: (files, collected) => {
          fingerprint = collected;
          if (files.length === 0) {
            say("There are no files to scan in this folder.");
            return false;
          }
          if (!full && !paths?.length && record && record.folder === activeFolder.fsPath && record.fingerprint === collected) {
            // Skip only when the last scan finished; after a failed or cancelled one, scan again.
            if (record.completed) {
              say("No files changed since the last scan.");
              return false;
            }
            say("No files changed, but the last scan did not finish. Scanning again.");
          }
          const before = this.lastScan;
          const sameFolder = before?.rootUri.toString() === activeFolder.toString();
          if (quiet && sameFolder && !paths?.length) {
            // A background rescan keeps showing the last findings until its own arrive.
            before!.kept = [];
          } else {
            const kept = paths?.length && sameFolder ? before!.raw.filter((f) => !underPaths(f.path, paths)) : [];
            this.lastScan = { sessionId: activeSessionId, rootUri: activeFolder, raw: kept, kept, byId: new Map() };
            if (!kept.length) this.diagnostics.clear();
          }
          this.savedWithFindings.clear();
          this.postChangedFiles();
          return true;
        },
        onProgress: (scan) => {
          if (!scan.scanId) {
            reportPrepare(PREPARE_TEXT[scan.stage] ?? "");
            return;
          }
          endPrepare();
          this.postProgress(scan);
          if (quiet) return; // the last findings stay until this scan's arrive
          // Findings show while the scan runs: the backend serves what its finished scanners found.
          live ??= liveRefresh(() => this.loadFindings(scan.scanId).catch((err) => log.warn(`scan: live findings: ${errorText(err)}`)), LIVE_REFRESH_MS);
          if (scan.status === "RUNNING") live.poke();
        },
      });
      await live?.stop();
      endPrepare();
      if (!result) {
        return;
      }
      log.info(`scan: ${result.scanId} ended ${result.status} after ${Date.now() - started} ms`);
      // Only a full scan may let the next one skip as "nothing changed". A path scan saw part of the
      // folder but synced all of it, so the old record no longer describes what the server has.
      if (paths?.length) this.scanRecords.delete(activeSessionId);
      else this.scanRecords.set(activeSessionId, { folder: activeFolder.fsPath, fingerprint, completed: result.status === "COMPLETED" });
      await this.afterScan(result, quiet);
    } catch (err) {
      if (errorText(err).includes("SCAN_RUNNING") && sessionId && folder) {
        await this.handleScanRunningConflict(sessionId, folder, quiet, abort);
      } else {
        this.scanFailed(err);
      }
    } finally {
      endPrepare();
      await live?.stop();
      this.runningScan = undefined;
      await vscode.commands.executeCommand("setContext", SCAN_RUNNING_CONTEXT, false);
    }
  }

  /**
   * The findings and summary card of a finished scan, or why it didn't finish. `quiet` (scan on
   * save): the findings update without a new card or chat lines.
   */
  private async afterScan(result: ScanSummary, quiet = false): Promise<void> {
    if (result.status === "COMPLETED") {
      await this.loadFindings(result.scanId);
      if (quiet) return;
      await this.showSummary(result.error);
      const n = this.lastScan?.withoutFile ?? 0;
      if (n > 0) {
        log.info(`scan: ${result.scanId} has ${n} findings with no file`);
        this.say(`${n} more finding${n === 1 ? " points" : "s point"} at no file in the workspace (for example a dependency problem), so ${n === 1 ? "it isn't" : "they aren't"} listed. The server keeps ${n === 1 ? "it" : "them"}.`);
      }
    } else if (result.status === "CANCELLED") {
      this.say("The scan was cancelled.");
    } else {
      this.postError(`The scan failed: ${result.error ?? "unknown error"}`, { label: "Rescan", command: "reconix.rescan" });
    }
  }

  private async handleScanRunningConflict(sessionId: string, folder: vscode.Uri, quiet: boolean, abort: AbortController): Promise<void> {
    log.info(`scan: backend reported a scan is already running in session ${sessionId}`);
    const active = await this.backend.getActiveScan?.(sessionId);
    if (active && active.scanId && !["COMPLETED", "FAILED", "CANCELLED"].includes(active.status)) {
      this.say("A scan is already in progress on the server. Following its progress now…");
      this.runningScan = abort;
      await vscode.commands.executeCommand("setContext", SCAN_RUNNING_CONTEXT, true);
      this.postProgress(active);
      let live = liveRefresh(() => this.loadFindings(active.scanId).catch((err) => log.warn(`scan: live findings: ${errorText(err)}`)), LIVE_REFRESH_MS);
      if (active.status === "RUNNING") live.poke();
      try {
        const onProgress = (scan: ScanSummary) => {
          this.postProgress(scan);
          if (scan.status === "RUNNING") live.poke();
        };
        const result = await watchUntilDone(this.backend, active, onProgress, abort.signal, DEFAULT_CANCEL_GRACE_MS);
        await live.stop();
        await this.afterScan(result, quiet);
      } catch (err) {
        this.scanFailed(err);
      } finally {
        await live.stop();
      }
      return;
    }

    this.postError("A scan is currently running on the server.", {
      label: "Cancel Server Scan",
      command: "reconix.cancelScan",
    });
  }

  private scanFailed(err: unknown): void {
    // A progress card still "running" would keep the chat view locked (no Rescan, no History): end it.
    const shown = this.lastScan?.progress?.scan;
    const aborted = err instanceof Error && err.name === "AbortError";
    if (shown && !["COMPLETED", "FAILED", "CANCELLED"].includes(shown.status)) {
      this.postProgress({ ...shown, status: aborted ? "CANCELLED" : "FAILED" });
    }
    if (aborted) {
      log.info("scan: cancelled before the scan started");
      this.say("The scan was cancelled.");
    } else {
      log.error("scan: failed", err);
      this.postError(errorText(err));
    }
  }

  /**
   * A GitHub repo, in a session of its own: the server takes its scripted copy as the session's code.
   * Its files aren't on this computer, so there are no editor markers (like the reference).
   */
  async scanGithub(url: string): Promise<void> {
    const repo = githubRepoUrl(url);
    if (!repo) {
      this.say("That isn't a GitHub repository address. Use the form `https://github.com/owner/repo`.");
      return;
    }
    if (this.runningScan) {
      this.postError("A scan is already running. Wait for it, or cancel it.", { label: "Cancel Scan", command: "reconix.cancelScan" });
      return;
    }
    if (this.fixing) {
      this.postError("The fix agent is running. Scan after it finishes.");
      return;
    }
    const abort = new AbortController();
    this.runningScan = abort;
    let live: ReturnType<typeof liveRefresh> | undefined;
    try {
      const previous = this.currentSessionId;
      await this.ensureSession(repo, repo.slice("https://github.com/".length));
      const sessionId = this.currentSessionId!;
      if (previous && previous !== sessionId) await this.sendState();
      await this.store.update(SESSION_FOLDERS_KEY, { ...this.sessionFolders(), [sessionId]: repo });
      await vscode.commands.executeCommand("setContext", SCAN_RUNNING_CONTEXT, true);
      await this.openChat();
      this.say(`Getting **${repo}** and scanning it. Its files aren't open here, so findings show in the Findings tab only.`);
      this.lastScan = { sessionId, rootUri: vscode.Uri.parse(repo), repoUrl: repo, raw: [], kept: [], byId: new Map() };
      this.diagnostics.clear();
      this.savedWithFindings.clear();
      this.postChangedFiles();
      // Progress (and the Stop button) from the start: a clone can take minutes.
      this.postProgress({ scanId: "", sessionId, status: "RUNNING", stage: "COLLECTING", progress: 0, startedAt: new Date().toISOString(), counts: countBySeverity([]), notes: [] });
      await this.backend.cloneRepo(sessionId, repo, abort.signal);
      abort.signal.throwIfAborted();
      log.info(`scan: GitHub repo cloned in session ${sessionId}`);
      const result = await scanAndWatch(this.backend, sessionId, {
        signal: abort.signal,
        onProgress: (scan) => {
          this.postProgress(scan);
          live ??= liveRefresh(() => this.loadFindings(scan.scanId).catch((err) => log.warn(`scan: live findings: ${errorText(err)}`)), LIVE_REFRESH_MS);
          if (scan.status === "RUNNING") live.poke();
        },
      });
      await live?.stop();
      log.info(`scan: ${result.scanId} ended ${result.status}`);
      await this.afterScan(result);
    } catch (err) {
      this.scanFailed(err);
    } finally {
      await live?.stop();
      this.runningScan = undefined;
      await vscode.commands.executeCommand("setContext", SCAN_RUNNING_CONTEXT, false);
    }
  }

  /** Scan GitHub Repository: asks for the address unless one is given (a button or a test). */
  async askGithubScan(given?: string): Promise<void> {
    const url = given ?? await vscode.window.showInputBox({
      title: "Reconix Code Scanner: scan a GitHub repository",
      prompt: "The repository's address.",
      placeHolder: "https://github.com/owner/repo",
      ignoreFocusOut: true,
      validateInput: (value) => (githubRepoUrl(value) ? undefined : "Use the form https://github.com/owner/repo"),
    });
    if (url) await this.scanGithub(url);
  }

  /** "Scan with Reconix" on a file or folder (Explorer, editor menus): only that path. */
  async scanPath(uri?: vscode.Uri): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      // e.g. the welcome card with no file open
      void vscode.window.showInformationMessage("Reconix Code Scanner: open a file in the editor first, then scan it.");
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(target);
    if (!folder) {
      void vscode.window.showInformationMessage("Reconix Code Scanner: that file is not inside an open workspace folder.");
      return;
    }
    if (target.toString() === folder.uri.toString()) {
      await this.scanWorkspace(false, undefined, folder.uri);
      return;
    }
    const rel = toContractPath(folder.uri.fsPath, target.fsPath);
    log.info(`scan: only ${rel}`);
    await this.scanWorkspace(false, [rel], folder.uri);
  }

  /** The open session's own target again: its GitHub repo, or the workspace (only changes are sent). */
  async rescan(): Promise<void> {
    const owner = this.currentSessionId ? this.sessionFolders()[this.currentSessionId] : undefined;
    if (owner && githubRepoUrl(owner)) {
      await this.scanGithub(owner);
      return;
    }
    await this.scanWorkspace();
  }

  async cancelScan(): Promise<void> {
    log.info("scan: cancel requested");
    clearTimeout(this.scanOnSaveTimer);
    if (this.runningScan) {
      this.runningScan.abort();
      return;
    }
    const sessionId = this.currentSessionId;
    if (sessionId && this.backend.cancelSessionScan) {
      try {
        await this.backend.cancelSessionScan(sessionId);
        this.say("The running scan on the server was cancelled.");
        void vscode.window.showInformationMessage("Reconix Code Scanner: cancelled the running server scan.");
        return;
      } catch (err) {
        log.warn(`scan: cancel server scan failed: ${errorText(err)}`);
      }
    }
    void vscode.window.showInformationMessage("Reconix Code Scanner: no scan is running.");
  }

  cancelChat(): void {
    if (this.activeChatAbort) {
      log.info("chat: active request aborted by user");
      this.activeChatAbort.abort();
      this.activeChatAbort = undefined;
    }
  }

  /**
   * Settings that change what is shown re-render the findings without a new scan. A pasted token
   * moves to SecretStorage (our own clearing of the setting lands here too, and moves nothing),
   * and a change to the server settings reconnects with a new backend.
   */
  async onConfigurationChanged(event: vscode.ConfigurationChangeEvent): Promise<void> {
    if (event.affectsConfiguration(`${CONFIG_SECTION}.showLikelyFalsePositives`) && this.lastScan?.findings) {
      await this.renderFindings();
    }
    const moved = event.affectsConfiguration(`${CONFIG_SECTION}.token`) && await this.moveTokenFromSettings();
    if (affectsBackend(event)) this.backendStale = true;
    if (moved || affectsBackend(event)) await this.reconnect();
  }

  /**
   * A saved file with findings marks them out of date and lights up Rescan, which counts such files.
   * With scanOnSave, a save in the scanned folder also rescans it a moment later (quick saves: one scan).
   */
  async onDocumentSaved(document: vscode.TextDocument): Promise<void> {
    const scan = this.lastScan;
    // No findings yet (a scan still collecting or uploading) still arms scan on save below.
    if (!scan || scan.repoUrl || document.uri.scheme !== "file") {
      return;
    }
    let rel: string;
    try {
      rel = toContractPath(scan.rootUri.fsPath, document.uri.fsPath);
    } catch {
      return; // outside the scanned folder
    }
    if (vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>("scanOnSave", false)) {
      const { sessionId, rootUri } = scan;
      const fire = (): void => {
        const now = this.lastScan;
        // Another session or folder opened meanwhile (a running scan replaces lastScan: same session, fine).
        if (now?.sessionId !== sessionId || now.rootUri.toString() !== rootUri.toString()) return;
        // Busy: wait, since a running scan collected the files before this save.
        if (this.runningScan || this.fixing) this.scanOnSaveTimer = setTimeout(fire, SCAN_ON_SAVE_DELAY_MS);
        else void this.scanWorkspace(false, undefined, rootUri, true);
      };
      clearTimeout(this.scanOnSaveTimer);
      this.scanOnSaveTimer = setTimeout(fire, SCAN_ON_SAVE_DELAY_MS);
    }
    if (!scan.findings || !scan.raw.some((f) => f.path === rel)) return;
    this.savedWithFindings.add(rel);
    this.postChangedFiles();
    await this.renderFindings();
  }

  private postChangedFiles(): void {
    this.post({ type: "changedFiles", count: this.savedWithFindings.size });
  }

  // ---- internals -------------------------------------------------------------------------

  private async pickFolder(): Promise<vscode.Uri | undefined> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      this.say("No folder is open. Open a folder, then ask me to scan it.");
      return undefined;
    }
    if (folders.length === 1) {
      return folders[0].uri;
    }
    const pick = await vscode.window.showWorkspaceFolderPick({ placeHolder: "Which folder should be scanned?" });
    return pick?.uri;
  }

  /** An assistant line in the chat, kept in the session's history. */
  private say(text: string): void {
    const message: Message = { id: `local-${Date.now()}-${this.messages.length}`, role: "assistant", text, createdAt: new Date().toISOString() };
    this.postMessage(message);
  }

  /** Keeps a message in the session's history and shows it. */
  private postMessage(message: Message, actions: ChatReply["actions"] = []): void {
    this.remember(message);
    this.post({ type: "chat", reply: { message, actions }, message: messageView(message) });
  }

  private async sendState(): Promise<void> {
    const connection = await this.backend.status();
    // A backend that can't be reached has no sessions to list; the banner says why.
    let sessions: Session[] = [];
    try {
      sessions = connection.state === "connected" ? await this.backend.listSessions() : [];
      if (!this.currentSessionId) {
        // The session this workspace had open, else the newest of its folders (or of no folder).
        // A read-only one (e.g. from before a server restart) only opens when picked in History.
        const writable = sessions.filter((s) => !s.readOnly).map((s) => s.id);
        const id = sessionToOpen(writable, this.workspaceStore.get<string>(LAST_SESSION_KEY), this.sessionFolders(), this.openFolders());
        if (id) await this.open(id);
      }
    } catch (err) {
      // Connected, but the sessions failed: say so, or the banner and status bar keep "connecting".
      this.post({ type: "connection", connection: { state: "disconnected", reason: errorText(err) } });
      throw err;
    }
    this.post({ type: "state", connection, sessions, currentSessionId: this.currentSessionId, messages: this.messages.map(messageView) });
    // Scan results are not chat history yet, so replay the latest scan after a reload,
    // but only into the session it ran in.
    if (this.lastScan && this.lastScan.sessionId === this.currentSessionId) {
      if (this.lastScan.progress) this.post(this.lastScan.progress);
      if (this.lastScan.findings) this.post(this.lastScan.findings);
      if (this.lastScan.summary) this.post(this.lastScan.summary);
    }
    // Open questions (Apply / Skip ...) must survive a reload, or a waiting review never resumes.
    for (const [id, { yes, no }] of this.pending) this.post({ type: "confirm", id, yes, no });
    this.postChangedFiles();
    // A backend without models must not break the rest of the view, so this one fails quietly.
    try {
      await this.refreshModels();
    } catch (err) {
      log.warn(`listProviders failed: ${errorText(err)}`);
    }
  }

  /** A provider off the server's computer needs a person's approval first (core's rule), asked in the chat. */
  private async activateProvider(providerId: string): Promise<void> {
    const { provider, approvalId } = await this.backend.activateProvider(providerId);
    if (approvalId === undefined) {
      await this.switchedTo(provider);
      return;
    }
    this.say(`**${provider.displayName}** runs outside the Reconix server's computer, so the code it reviews and fixes is sent to it. Use it?`);
    this.ask("Approve", async () => {
      await this.backend.approve(approvalId);
      await this.switchedTo(provider);
    }, "Cancel", () => this.say("OK, the model stays as it was."));
  }

  /**
   * The model form's Save: adds or edits a provider, then tests it. The key is passed on to the
   * backend only: never logged, kept or sent back to the webview.
   */
  private async saveProvider(formId: number, providerId: string | undefined, input: LlmProviderInput): Promise<void> {
    const status = (tone: "busy" | "ok" | "error", text: string, id = providerId): void =>
      this.post({ type: "providerStatus", formId, providerId: id, tone, text });
    const save = providerSave(providerId, input);
    if (save.kind === "invalid") {
      status("error", save.message);
      return;
    }
    status("busy", "Saving…");
    let saved: LlmProvider;
    try {
      saved = save.kind === "update" ? await this.backend.updateProvider(providerId!, save.update) : await this.backend.createProvider(save.input);
    } catch (err) {
      log.warn(`provider: save failed (${input.providerType}): ${errorText(err)}`);
      status("error", errorText(err));
      return;
    }
    log.info(`provider: ${providerId ? "updated" : "added"} ${saved.id} (${saved.providerType})`);
    try {
      await this.refreshModels();
    } catch (err) {
      // Saved all the same: the form must not stay on "Saving…".
      status("error", `Saved, but the model list couldn't be refreshed: ${errorText(err)}`, saved.id);
      return;
    }
    await this.testProvider(formId, saved.id, true);
  }

  /** The model form's Test: one fixed prompt with no Reconix data in it. */
  private async testProvider(formId: number, providerId: string, afterSave = false): Promise<void> {
    this.post({ type: "providerStatus", formId, providerId, tone: "busy", text: "Testing…" });
    let result: ProviderTest;
    try {
      result = await this.backend.testProvider(providerId);
    } catch (err) {
      result = { ok: false, modelName: "", latencyMs: 0, message: errorText(err) };
    }
    log.info(`provider: test ${providerId} ${result.ok ? "ok" : `failed (${result.code ?? "error"})`} in ${result.latencyMs} ms`);
    this.post({ type: "providerStatus", formId, providerId, ...testStatus(result, afterSave) });
  }

  private async deleteProvider(providerId: string): Promise<void> {
    const provider = (await this.backend.listProviders()).find((p) => p.id === providerId);
    if (!provider) return;
    const answer = await vscode.window.showWarningMessage(`Delete the model "${provider.displayName}"?`, { modal: true }, "Delete");
    if (answer !== "Delete") return;
    await this.backend.deleteProvider(providerId);
    log.info(`provider: deleted ${providerId}`);
    await this.refreshModels();
  }

  // ---- models from the Command Palette ---------------------------------------------------

  /** Select Model: pick one of the backend's models (or add one). Approval, if needed, is asked in the chat. */
  async selectModel(): Promise<void> {
    try {
      const models = await this.backend.listProviders();
      type Pick = vscode.QuickPickItem & { providerId?: string; add?: true; setReconixKey?: true };
      const items: Pick[] = models.map((p) => ({
        label: `${p.isActive ? "$(check) " : ""}${p.displayName}`,
        description: `${PROVIDER_LABEL[p.providerType] ?? p.providerType} · ${p.modelName}${p.providerType === "RECONIX" ? (p.apiKeyLast4 ? ` (Key: …${p.apiKeyLast4})` : " (No API key set)") : ""}`,
        detail: p.isActive ? "In use now" : p.isLocal ? undefined : "Runs outside the Reconix server's computer: asks for approval first",
        providerId: p.id,
      }));
      const reconix = models.find((p) => p.providerType === "RECONIX");
      if (reconix) {
        items.push(
          { label: "", kind: vscode.QuickPickItemKind.Separator },
          {
            label: "$(key) Set Reconix API key…",
            description: reconix.apiKeyLast4 ? `Current key: …${reconix.apiKeyLast4}` : "Enter server API key",
            providerId: reconix.id,
            setReconixKey: true,
          },
        );
      }
      items.push({ label: "", kind: vscode.QuickPickItemKind.Separator }, { label: "$(add) Add a model…", add: true });
      const pick = await vscode.window.showQuickPick(items, { title: "Reconix: Select Model", placeHolder: "The model the chat and fixes use" });
      if (!pick) return;
      if (pick.add) {
        await this.addModel();
        return;
      }
      if (pick.setReconixKey && pick.providerId) {
        const key = await vscode.window.showInputBox({
          title: "Reconix: Set API Key",
          prompt: "Enter your Reconix API key (only its last 4 characters are kept, until this window closes; leave empty to clear)",
          password: true,
          ignoreFocusOut: true,
        });
        if (key === undefined) return;
        await this.backend.updateProvider(pick.providerId, { apiKey: key.trim() || null });
        void vscode.window.showInformationMessage("Reconix: API key updated.");
        await this.refreshModels();
        return;
      }
      if (!pick.providerId) return;
      const picked = models.find((p) => p.id === pick.providerId);
      if (picked?.isActive) {
        void vscode.window.showInformationMessage(`Reconix: ${picked.displayName} is already in use.`);
        return;
      }
      if (picked && picked.providerType === "RECONIX" && !picked.apiKeyLast4) {
        const key = await vscode.window.showInputBox({
          title: "Reconix: API Key",
          prompt: "Enter your Reconix API key (press Enter to skip if none is required)",
          password: true,
          ignoreFocusOut: true,
        });
        if (key === undefined) return;
        if (key.trim()) {
          await this.backend.updateProvider(picked.id, { apiKey: key.trim() });
          await this.refreshModels();
        }
      }
      await this.activateFromEditor(pick.providerId);
    } catch (err) {
      log.error(`select model: ${errorText(err)}`);
      void vscode.window.showErrorMessage(`Reconix: ${errorText(err)}`);
    }
  }

  /** Prompts for an API key for the active model (or Reconix model) and hands it to the backend. */
  async setApiKey(): Promise<void> {
    try {
      const models = await this.backend.listProviders();
      const active = models.find((p) => p.isActive);
      const reconix = models.find((p) => p.providerType === "RECONIX");
      const target = active ?? reconix ?? models[0];
      if (!target) {
        await this.selectModel();
        return;
      }
      const key = await vscode.window.showInputBox({
        title: `${target.displayName}: Set API Key`,
        prompt: `Enter API key for ${target.displayName} (${target.modelName})`,
        password: true,
        ignoreFocusOut: true,
      });
      if (key === undefined) return;
      await this.backend.updateProvider(target.id, { apiKey: key.trim() || null });
      void vscode.window.showInformationMessage(`${target.displayName}: API key saved.`);
      await this.refreshModels();
    } catch (err) {
      log.error(`set api key: ${errorText(err)}`);
      void vscode.window.showErrorMessage(`Reconix: ${errorText(err)}`);
    }
  }

  /**
   * Add Model: provider → model → base URL → API key (a password box), then save and test. The
   * key goes to the backend only; it is never logged or kept here.
   */
  async addModel(): Promise<void> {
    const title = "Reconix: Add a Model";
    const type = await vscode.window.showQuickPick(
      ADDABLE_TYPES.map((t) => ({ label: PROVIDER_LABEL[t], providerType: t })),
      { title, placeHolder: "Which provider runs the model?" },
    );
    if (!type) return;
    const fields = providerFields(type.providerType);
    const presets = PRESET_MODELS[type.providerType];
    let modelName: string | undefined;
    if (presets && presets.length > 0) {
      type ModelPick = vscode.QuickPickItem & { model?: string; isCustom?: true };
      const modelItems: ModelPick[] = presets.map((m) => ({
        label: m,
        description: "Preset model",
        model: m,
      }));
      modelItems.push(
        { label: "", kind: vscode.QuickPickItemKind.Separator },
        { label: "$(edit) Other model name…", description: "Type custom model name", isCustom: true },
      );
      const pickedModel = await vscode.window.showQuickPick(modelItems, {
        title: `${title} (${PROVIDER_LABEL[type.providerType]})`,
        placeHolder: "Select a model or enter custom name",
      });
      if (!pickedModel) return;
      if (pickedModel.isCustom) {
        modelName = await vscode.window.showInputBox({
          title, prompt: "The model's name", placeHolder: MODEL_PLACEHOLDER[type.providerType], ignoreFocusOut: true,
          validateInput: (v) => (v.trim() ? undefined : "Enter the model's name."),
        });
      } else {
        modelName = pickedModel.model;
      }
    } else {
      modelName = await vscode.window.showInputBox({
        title, prompt: "The model's name", placeHolder: MODEL_PLACEHOLDER[type.providerType], ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? undefined : "Enter the model's name."),
      });
    }
    if (modelName === undefined || !modelName.trim()) return;
    let baseUrl: string | undefined;
    if (fields.baseUrl !== "none") {
      baseUrl = await vscode.window.showInputBox({
        title, ignoreFocusOut: true,
        prompt: fields.baseUrl === "required" ? "The API's base URL" : "Ollama's address. Leave empty to use the Reconix server's own Ollama.",
        placeHolder: type.providerType === "OLLAMA" ? "http://localhost:11434" : "https://…/v1",
        validateInput: (v) => (fields.baseUrl === "required" && !v.trim() ? "This provider needs a base URL." : undefined),
      });
      if (baseUrl === undefined) return;
    }
    let apiKey: string | undefined;
    if (fields.apiKey !== "none") {
      apiKey = await vscode.window.showInputBox({
        title, password: true, ignoreFocusOut: true,
        prompt: `${PROVIDER_LABEL[type.providerType]} API key. Only its last 4 characters are kept, until this window closes.`,
        validateInput: (v) => (fields.apiKey === "required" && !v.trim() ? "This provider needs an API key." : undefined),
      });
      if (apiKey === undefined) return;
    }
    const save = providerSave(undefined, { providerType: type.providerType, displayName: "", modelName, baseUrl, apiKey });
    if (save.kind !== "create") {
      if (save.kind === "invalid") void vscode.window.showErrorMessage(`Reconix: ${save.message}`);
      return;
    }
    try {
      const outcome = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Reconix: saving and testing the model…", cancellable: true },
        async (_progress, token) => {
          if (token.isCancellationRequested) return undefined;
          const created = await this.backend.createProvider(save.input);
          log.info(`provider: added ${created.id} (${created.providerType}) from the Command Palette`);
          // Cancel stops waiting for the test (it is saved already); the test itself runs on.
          const cancelled = new Promise<ProviderTest>((resolve) => token.onCancellationRequested(() =>
            resolve({ ok: false, modelName: created.modelName, latencyMs: 0, message: "you stopped the test. Use Test in the model menu to try again." })));
          const tested = await Promise.race([
            this.backend.testProvider(created.id)
              .catch((err): ProviderTest => ({ ok: false, modelName: created.modelName, latencyMs: 0, message: errorText(err) })),
            cancelled,
          ]);
          return { provider: created, result: tested };
        },
      );
      if (!outcome) return;
      const { provider, result } = outcome;
      await this.refreshModels().catch((err) => log.warn(`models: ${errorText(err)}`));
      const { tone, text } = testStatus(result, true);
      const answer = tone === "ok"
        ? await vscode.window.showInformationMessage(`Reconix: added ${provider.displayName}. ${text}`, "Use It")
        : await vscode.window.showWarningMessage(`Reconix: ${provider.displayName}: ${text}`, "Use It Anyway");
      if (answer) await this.activateFromEditor(provider.id);
    } catch (err) {
      log.warn(`provider: add failed (${type.providerType}): ${errorText(err)}`);
      void vscode.window.showErrorMessage(`Reconix: ${errorText(err)}`);
    }
  }

  /** An error in the chat, with the button that fixes it when there is one (errorActions). */
  private postError(message: string, action = errorAction(message)): void {
    this.post(action ? { type: "error", message, action } : { type: "error", message });
  }

  /** Sends the model menu the backend's models (and keeps them for "switch to …"). */
  private async refreshModels(): Promise<void> {
    try {
      this.providers = await this.backend.listProviders();
    } catch (err) {
      this.providers = []; // unknown now: "switch to …" asks instead of using an old id
      throw err;
    }
    this.post({ type: "models", providers: this.providers });
  }

  /**
   * Activates a model picked outside the chat. The chat asks for an approval if needed, so it is
   * opened first; if it is still loading, the activation waits for its "ready" (or its question
   * would be wiped by the state the chat gets then).
   */
  private async activateFromEditor(providerId: string): Promise<void> {
    await this.openChat();
    if (this.viewReady) await this.activateProvider(providerId);
    else this.queuedActivation = providerId;
  }

  private async switchedTo(provider: LlmProvider): Promise<void> {
    await this.refreshModels();
    log.info(`model: switched to ${provider.id}`);
    this.postMessage({ id: `local-${Date.now()}-${this.messages.length}`, role: "system", text: `Switched to ${provider.displayName}`, createdAt: new Date().toISOString() });
  }

  /**
   * Makes sure a session is open. For a scan of `folder`, it must be one of that folder (or of no
   * folder yet): core keeps finding ids only within a session. Else the folder's newest session, or a new one.
   */
  private async ensureSession(folder?: string, title?: string): Promise<void> {
    const owners = this.sessionFolders();
    if (this.currentSessionId && !folder) return;
    // A scan writes to its session, so only sessions this extension can write to count (no read-only one).
    const ids = (await this.backend.listSessions()).filter((s) => !s.readOnly).map((s) => s.id);
    if (this.currentSessionId && ids.includes(this.currentSessionId) && sessionFitsFolder(this.currentSessionId, folder!, owners)) return;
    const id = folder
      ? ids.find((i) => owners[i] === folder)
      : sessionToOpen(ids, this.workspaceStore.get<string>(LAST_SESSION_KEY), owners, this.openFolders());
    // A question from the old session (Apply fix / Skip ...) can't be answered from the new one.
    for (const pendingId of this.pending.keys()) this.post({ type: "confirmDone", id: pendingId });
    this.pending.clear();
    await this.open(id ?? (await this.backend.createSession(title)).id);
    // Only the History menu: a full state would redraw the chat and drop the message just typed.
    await this.postSessions();
  }

  private async runAction(action: Extract<WebviewToHost, { type: "runAction" }>["action"]): Promise<void> {
    switch (action.kind) {
      case "scanWorkspace":
        await this.scanWorkspace();
        return;
      case "rescan":
        await this.rescan();
        return;
      case "fixFindings":
        await this.requestFix(action.findingIds);
        return;
      case "showFindings":
        this.post({ type: "showTab", tab: "findings" });
        return;
      case "summarize":
        if (!this.lastScan?.scanId) {
          this.say("There is nothing to summarize yet. Ask me to **scan this project** first.");
          return;
        }
        await this.showSummary();
        return;
    }
  }

  private postProgress(scan: ScanSummary): void {
    const message: HostToWebview = { type: "progress", scan };
    if (this.lastScan) this.lastScan.progress = message;
    this.post(message);
  }

  /** Fetches every finding of a finished scan (false positives included) and shows them. */
  private async loadFindings(scanId: string): Promise<void> {
    const scan = this.lastScan;
    if (!scan) return;
    const { items: fetched, withoutFile } = await fetchAllFindings(this.backend, scanId, { includeLikelyFalsePositives: true });
    scan.withoutFile = withoutFile;
    // A path that could leave the workspace is never opened or annotated.
    const safe = fetched.filter((f) => isSafeContractPath(f.path));
    if (safe.length < fetched.length) {
      log.warn(`scan: ${scanId} dropped ${fetched.length - safe.length} findings with unsafe paths`);
    }
    scan.raw = [...scan.kept, ...safe];
    scan.scanId = scanId;
    log.info(`scan: ${scanId} has ${scan.raw.length} raw findings`);
    await this.renderFindings();
  }

  /** Filters, merges and marks out-of-date findings, then updates the webview and the Problems panel. */
  /** Rebuilds a scan's shown findings (default: the open session's); draws them only if it is open. */
  private async renderFindings(scan = this.lastScan): Promise<void> {
    if (!scan?.scanId) return;
    const current = scan === this.lastScan;
    const show = vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>("showLikelyFalsePositives", false);
    const ignored = new Set(this.ignoredIds(scan.sessionId));
    const prepared = prepareFindings(ignored.size ? scan.raw.filter((f) => !ignored.has(f.id)) : scan.raw, show);
    const outdated = scan.repoUrl ? prepared.findings.map(() => false) : await Promise.all(prepared.findings.map((f) => this.isOutdated(scan.rootUri, f)));

    scan.byId = new Map(prepared.findings.map((f) => [f.id, f]));
    scan.findings = {
      type: "findings",
      scanId: scan.scanId,
      findings: prepared.findings.map((f, i) => toFindingView(f, outdated[i])),
      counts: prepared.counts,
      hiddenFalsePositives: prepared.hiddenFalsePositives,
    };
    if (!current) return;
    if (!scan.repoUrl) this.diagnostics.show(scan.rootUri, prepared.findings);
    this.post(scan.findings);
  }

  /**
   * The summary card after a scan, or on "summarize" (like the reference, not kept in the chat
   * history). Falls back to the one-line summary if the backend cannot summarize.
   */
  private async showSummary(error?: string): Promise<void> {
    const scan = this.lastScan;
    if (!scan?.scanId || !scan.findings) return;
    try {
      const summary = await this.backend.summarizeFindings(scan.scanId);
      scan.summary = { type: "summary", summary, hidden: scan.findings.hiddenFalsePositives, error };
      // "fix them" after the card means its fix-first items.
      this.lastMentioned = summary.card.fixFirst.flatMap((x) => x.findingIds);
      this.post(scan.summary);
    } catch (err) {
      log.warn(`summary: ${errorText(err)}`);
      this.showScanSummary(error);
    }
  }

  /** The chat line after a finished scan: counts over every finding, and how many are hidden. */
  private showScanSummary(error?: string): void {
    const scan = this.lastScan;
    if (!scan?.findings) return;
    const allCounts = countBySeverity(mergeFindings(scan.raw));
    this.say(scanSummaryText(allCounts, scan.findings.hiddenFalsePositives, error));
  }

  /** True when the file no longer has the hash it was scanned with (or is gone). */
  private async isOutdated(rootUri: vscode.Uri, finding: Finding): Promise<boolean> {
    if (!finding.fileSha256) return false;
    try {
      return (await hashFile(findingUri(rootUri, finding.path).fsPath)) !== finding.fileSha256;
    } catch {
      return true;
    }
  }

  // ---- editor actions on findings ------------------------------------------------------

  /** Asks this in the chat as if the user typed it. Host-built text only, never file contents. */
  private async askInChat(text: string): Promise<void> {
    await this.openChat();
    // Exactly once: now if the chat is loaded, else on its "ready" (after its state, which redraws it).
    if (this.viewReady) this.post({ type: "ask", text });
    else this.queuedAsk = text;
  }

  /** The chat view was closed: what is posted now is lost until it loads again. */
  onViewDisposed(): void {
    this.viewReady = false;
  }

  /** Explain (hover, tree, Command Palette): ask the chat about one finding, by id, path and line. */
  async explainFinding(findingId: string | undefined): Promise<void> {
    const finding = findingId ? this.lastScan?.byId.get(findingId) : undefined;
    if (!finding) {
      void vscode.window.showInformationMessage("Reconix: that finding is no longer in the last scan. Rescan to update.");
      return;
    }
    await this.askInChat(explainFindingText(finding));
  }

  /** Explain Selection: ask the chat about the selected lines. Only the path and line numbers go. */
  async explainSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const scan = this.lastScan;
    const rel = editor && scan && !scan.repoUrl && editor.document.uri.scheme === "file" && scan.rootUri.scheme === "file"
      ? relativeContractPath(scan.rootUri.fsPath, editor.document.uri.fsPath)
      : undefined;
    if (!editor || !rel) {
      void vscode.window.showInformationMessage("Reconix: scan this folder first, then select code in it to ask about.");
      return;
    }
    const { first, last } = selectionLines(editor.selection);
    await this.askInChat(explainSelectionText(rel, first, last));
  }

  private ignoredIds(sessionId: string): string[] {
    return this.workspaceStore.get<string[]>(`${IGNORED_KEY}.${sessionId}`, []);
  }

  /** Saves the ignored ids and rebuilds that session's findings (shown only if it is open). */
  private async setIgnored(sessionId: string, ids: string[]): Promise<void> {
    await this.workspaceStore.update(`${IGNORED_KEY}.${sessionId}`, ids.length ? ids : undefined);
    const scan = this.scansBySession.get(sessionId);
    if (scan) await this.renderFindings(scan);
  }

  /** Ignore: hide a finding (all its merged hits) in this session and workspace, with Undo. */
  async ignoreFinding(findingId: string | undefined): Promise<void> {
    const scan = this.lastScan;
    const finding = findingId ? scan?.byId.get(findingId) : undefined;
    if (!scan || !finding) {
      void vscode.window.showInformationMessage("Reconix: that finding is no longer in the last scan. Rescan to update.");
      return;
    }
    const sessionId = scan.sessionId;
    const before = this.ignoredIds(sessionId);
    await this.setIgnored(sessionId, [...new Set([...before, ...finding.findingIds])]);
    log.info(`ignored finding ${finding.id} (${finding.findingIds.length} hits) in session ${sessionId}`);
    // Not awaited: the command ends now, and Undo still works while the message is up.
    void vscode.window.showInformationMessage(`Ignored "${finding.title}" in this session.`, "Undo").then(async (answer) => {
      if (answer !== "Undo") return;
      const now = this.ignoredIds(sessionId).filter((id) => !finding.findingIds.includes(id));
      await this.setIgnored(sessionId, now);
    }).then(undefined, (err) => log.error(`undo ignore: ${errorText(err)}`));
  }

  /** Clear Ignored Findings: show every ignored finding of this session again. */
  async clearIgnored(): Promise<void> {
    const sessionId = this.currentSessionId;
    const scan = sessionId ? this.scansBySession.get(sessionId) : undefined;
    let n = 0;
    if (sessionId && this.ignoredIds(sessionId).length) {
      const before = scan?.byId.size ?? 0;
      await this.setIgnored(sessionId, []);
      // Findings that came back (merged, as listed), not the raw hits stored.
      n = Math.max((scan?.byId.size ?? 0) - before, 1);
    }
    void vscode.window.showInformationMessage(n
      ? `Reconix: showing ${n} ignored finding${n === 1 ? "" : "s"} again.`
      : "Reconix: no findings are ignored in this session.");
  }

  /** From the Findings tree: the chat may be closed, so a problem shows as a notification. */
  async openFindingFromEditor(findingId: string): Promise<void> {
    try {
      await this.openFinding(findingId, (message) => void vscode.window.showWarningMessage(message));
    } catch (err) {
      log.error(`open finding ${findingId}: ${errorText(err)}`);
      void vscode.window.showErrorMessage(errorText(err));
    }
  }

  /** The webview sends only a finding id; the host resolves the path, so no path crosses from the UI. */
  private async openFinding(findingId: string, warn = (message: string) => this.postError(message)): Promise<void> {
    const scan = this.lastScan;
    const finding = scan?.byId.get(findingId);
    if (!scan || !finding) {
      warn("That finding is no longer in the last scan. Rescan to update.");
      return;
    }
    if (scan.repoUrl) {
      // Its files aren't here and no web page is opened: name the place.
      warn(`${finding.path}${finding.line ? `:${finding.line}` : ""} is in ${scan.repoUrl}, which isn't open here. Its details are in the Findings tab.`);
      return;
    }
    const uri = findingUri(scan.rootUri, finding.path);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      warn(`${finding.path} no longer exists. Rescan to update.`);
      return;
    }
    if (await this.isOutdated(scan.rootUri, finding)) {
      void vscode.window.showInformationMessage(OUTDATED_TEXT);
    }
    // Select the finding's whole lines, clamped to the file as it is now.
    const document = await vscode.workspace.openTextDocument(uri);
    const range = findingRange(finding);
    const startLine = Math.min(range.start.line, document.lineCount - 1);
    const endLine = Math.min(range.end.line, document.lineCount - 1);
    const selection = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).range.end.character);
    await vscode.window.showTextDocument(document, { selection, preview: false });
  }

  // ---- fix agent ---------------------------------------------------------------------------

  /** A Fix button (one finding) or Fix all (no ids: every shown finding that isn't a likely false alarm). */
  async requestFix(findingIds: string[] | undefined): Promise<void> {
    if (findingIds) {
      // From a hover the chat may be closed, and the fix's progress and errors show only there.
      await this.openChat();
      await this.fixFindings(findingIds);
      return;
    }
    const { ids, leftOut, manual } = fixAllIds([...(this.lastScan?.byId.values() ?? [])]);
    if (ids.length === 0) {
      this.say(manual > 0
        ? `None of the ${manual} findings can be fixed automatically. Each one says why in the Findings tab.`
        : "There are no findings to fix. Scan the workspace first.");
      return;
    }
    if (manual > 0) {
      this.say(`Leaving out ${manual} finding${manual === 1 ? " that needs" : "s that need"} a manual fix (see the Findings tab).`);
    }
    if (leftOut > 0) {
      this.say(`The fix agent takes at most ${MAX_FIX_FINDINGS} findings at a time, so the ${leftOut} least serious are left for a second run.`);
    }
    if (ids.length > CONFIRM_FIX_ABOVE) {
      this.say(`Fix all ${ids.length} findings? The agent proposes the changes, and you review them before anything is applied.`);
      this.ask("Yes, fix them", () => this.fixFindings(ids));
      return;
    }
    await this.fixFindings(ids);
  }

  /**
   * Lets the fix agent fix findings (ids of shown, merged findings), then shows its changes: one
   * file as a diff with Apply/Skip; several files with a choice of applying all at once or
   * reviewing them one by one. Changes apply only to a saved file that still has the hash the
   * agent worked from.
   */
  async fixFindings(findingIds: string[]): Promise<void> {
    const scan = this.lastScan;
    const sessionId = this.currentSessionId;
    if (scan?.repoUrl) {
      this.say("Fixes change files in your open workspace, and this session scanned a GitHub repository. Clone it, open it here and scan it to fix its findings.");
      return;
    }
    // A chat reply may name a raw hit of a merged finding, so look ids up both ways.
    const merged = [...(scan?.byId.values() ?? [])];
    const resolve = (id: string): MergedFinding | undefined => scan?.byId.get(id) ?? merged.find((f) => f.findingIds.includes(id));
    const requested = [...new Set(findingIds.map(resolve).filter((f): f is MergedFinding => f !== undefined))];
    if (!scan || !sessionId || requested.length === 0) {
      this.say("Scan the workspace first, then fix its findings.");
      return;
    }
    // Findings that need a manual fix get their reason now; the agent only sees the rest.
    const manual = requested.filter((f) => f.manualFix);
    const targets = requested.filter((f) => !f.manualFix);
    if (targets.length === 0) {
      this.say(fixOutcomeText("", manual.map((f) => ({ findingId: f.id, status: "NOT_FIXED", note: f.manualFix! })), (id) => findingTitle(scan.byId.get(id))));
      return;
    }
    if (manual.length > 0) {
      this.say(`Skipping ${manual.length} finding${manual.length === 1 ? " that needs" : "s that need"} a manual fix (see the Findings tab).`);
    }
    if (this.runningScan) {
      this.postError("A scan is running. Fix findings after it finishes.", { label: "Cancel Scan", command: "reconix.cancelScan" });
      return;
    }
    if (this.fixing) {
      this.postError("The fix agent is already running.");
      return;
    }
    if (this.pending.size > 0) {
      this.postError("Answer the open question in the chat first (for example Apply fix or Skip).");
      return;
    }

    // The backend knows the raw hits; a merged finding stands for all of them.
    const mergedOf = new Map<string, MergedFinding>();
    for (const target of targets) for (const id of target.findingIds) mergedOf.set(id, target);
    if (mergedOf.size > MAX_FIX_FINDINGS) {
      this.postError(`The fix agent takes at most ${MAX_FIX_FINDINGS} findings at a time. Pick fewer findings.`);
      return;
    }
    const live = `agent-${Date.now()}`;
    const abort = new AbortController();
    const started = Date.now();
    let ended = "Fix agent stopped";
    let result: FixResult | undefined;
    this.fixing = true;
    this.post({ type: "agentStart", id: live, title: `Fix agent · ${targets.length} finding${targets.length === 1 ? "" : "s"}` });
    log.info(`fix: ${targets.length} findings (${mergedOf.size} raw) in session ${sessionId}`);
    try {
      result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Reconix: fix agent", cancellable: true },
        (progress, token) => {
          token.onCancellationRequested(() => abort.abort());
          return this.backend.fixFindings(sessionId, [...mergedOf.keys()], (event) => {
            if (event.kind === "heartbeat") return;
            this.post({ type: "agentEvent", id: live, event });
            if (event.kind === "tool" || event.kind === "status" || event.kind === "done") {
              progress.report({ message: `${event.file ? `${event.file.split("/").pop()}: ` : ""}${event.text}` });
            }
          }, abort.signal);
        },
      );
      ended = `Fix agent finished in ${Math.round((Date.now() - started) / 1000)} s`;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        this.say("The fix agent was stopped. Nothing was changed.");
      } else {
        throw err;
      }
    } finally {
      this.fixing = false;
      this.post({ type: "agentEnd", id: live, title: ended });
    }
    if (!result) return;

    const outcomes = mergedOutcomes(result.results, targets);
    log.info(`fix: ${result.files.length} files changed, ${outcomes.filter((o) => o.status === "FIXED").length} fixed`);
    this.say(fixOutcomeText(result.summary, outcomes, (id) => findingTitle(scan.byId.get(id))));

    const files = [...result.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const byId = new Map(outcomes.map((o) => [o.findingId, o]));
    const review = (): void => void this.reviewFileFixes(scan.rootUri, files, byId).catch((err) => this.showError(err));
    if (files.length === 1) return review();
    if (files.length === 0) return;
    this.say(
      `The agent changed ${files.length} files:\n${files.map((f) => `- ${f.path}`).join("\n")}\n\n` +
        "Apply them all now, or review each file's diff first? (Ctrl+Z in each file undoes a change.)",
    );
    this.ask(`Apply all (${files.length} files)`, () => this.applyAllFixes(scan.rootUri, files), "Review one by one", review);
  }

  /** The fixed text of one file, or a reason it cannot be changed now. */
  private async prepareFileFix(rootUri: vscode.Uri, fix: FileFix): Promise<PreparedFix | { problem: string }> {
    const rel = fix.path;
    if (!isSafeContractPath(rel)) {
      return { problem: `The change to ${rel} points outside the workspace, so it was left out.` };
    }
    const uri = findingUri(rootUri, rel);
    let document: vscode.TextDocument;
    try {
      // A symlinked folder could lead outside the workspace even with a clean relative path.
      const [realRoot, realFile] = await Promise.all([realpath(rootUri.fsPath), realpath(uri.fsPath)]);
      if (!realFile.startsWith(realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep)) {
        return { problem: `The change to ${rel} points outside the workspace, so it was left out.` };
      }
      document = await vscode.workspace.openTextDocument(uri);
    } catch {
      return { problem: `\`${rel}\` no longer exists.` };
    }
    if (document.isDirty) {
      return { problem: `\`${rel}\` has unsaved changes. Save it, rescan, and ask again.` };
    }
    if ((await hashFile(uri.fsPath)) !== fix.fileSha256) {
      return { problem: `\`${rel}\` changed since it was last scanned, so the change may not fit. Rescan, then ask again.` };
    }
    const { kept, dropped } = mergeEdits(fix.edits);
    const original = document.getText();
    try {
      return { rel, uri, original, fixed: applyEdits(original, kept), edits: kept.length, dropped: dropped.length };
    } catch (err) {
      return { problem: `The change to \`${rel}\` doesn't fit the file (${errorText(err)}). Rescan, then ask again.` };
    }
  }

  /** Writes the fixed text if the file is still what the fix was made for. Returns a problem, or undefined. */
  private async writeFileFix(fix: PreparedFix): Promise<string | undefined> {
    const now = await vscode.workspace.openTextDocument(fix.uri);
    if (now.getText() !== fix.original) {
      return `\`${fix.rel}\` changed in the meantime. Ask again to get a fresh fix.`;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(fix.uri, new vscode.Range(now.positionAt(0), now.positionAt(fix.original.length)), fix.fixed);
    if (!(await vscode.workspace.applyEdit(edit)) || !(await now.save())) {
      return `Could not write \`${fix.rel}\`.`;
    }
    log.info(`fix: applied ${fix.edits} edit(s) to ${fix.rel}`);
    return undefined;
  }

  private async applyAllFixes(rootUri: vscode.Uri, files: FileFix[]): Promise<void> {
    let applied = 0;
    const problems: string[] = [];
    for (const file of files) {
      const fix = await this.prepareFileFix(rootUri, file);
      const problem = "problem" in fix ? fix.problem : await this.writeFileFix(fix);
      if (problem) problems.push(`- ${problem}`);
      else applied += 1;
    }
    this.say(`Applied changes to ${applied} of ${files.length} files.${applied ? " Rescanning to check them…" : ""}` +
      (problems.length ? `\n\nNot applied:\n${problems.join("\n")}` : ""));
    if (applied) await this.rescanAfterFix();
  }

  /** Checks applied fixes right away: the same rescan as the Rescan button (only changed files are sent). */
  private async rescanAfterFix(): Promise<void> {
    clearTimeout(this.scanOnSaveTimer); // the fix's own saves must not queue a second scan
    if (this.runningScan) return; // a scan is already on its way; it sees the saved files
    log.info("fix: rescanning after applied fixes");
    await this.rescan();
  }

  /** One file at a time: open its diff, wait for Apply or Skip, then go on to the next. */
  private async reviewFileFixes(rootUri: vscode.Uri, files: FileFix[], outcomes: Map<string, FixOutcome>): Promise<void> {
    const scan = this.lastScan;
    let applied = 0;
    for (const [i, file] of files.entries()) {
      const fix = await this.prepareFileFix(rootUri, file);
      if ("problem" in fix) {
        this.say(fix.problem);
        continue;
      }
      const right = vscode.Uri.from({ scheme: FIX_SCHEME, path: `/${fix.rel}`, query: `${Date.now()}-${i}` });
      this.proposed.set(right.toString(), fix.fixed);
      await vscode.commands.executeCommand("vscode.diff", fix.uri, right, `${fix.rel.split("/").pop()}: proposed fix`, { preview: true });
      const here = [...(scan?.byId.values() ?? [])]
        .filter((f) => f.path === fix.rel && outcomes.has(f.id))
        .map((f) => `- ${outcomeLabel(outcomes.get(f.id)!.status)} ${findingTitle(f)}`);
      if (fix.dropped) here.push(`- ${fix.dropped} overlapping edit(s) were left out.`);
      const counter = files.length > 1 ? ` (file ${i + 1} of ${files.length})` : "";
      this.say(`Proposed fix for \`${fix.rel}\`${counter} (see the diff)${here.length ? `:\n${here.join("\n")}` : "."}`);
      await new Promise<void>((resolve) =>
        this.ask(
          "Apply fix",
          async () => {
            this.proposed.delete(right.toString());
            const problem = await this.writeFileFix(fix);
            if (problem) this.postError(problem.replace(/`/g, ""));
            else {
              applied += 1;
              this.say(`Applied the fix to \`${fix.rel}\` (Ctrl+Z in the editor undoes it).${i === files.length - 1 ? " Rescanning to check it…" : ""}`);
            }
            resolve();
          },
          "Skip",
          () => {
            this.proposed.delete(right.toString());
            this.say(`Skipped \`${fix.rel}\`.`);
            resolve();
          },
        ),
      );
    }
    if (applied) await this.rescanAfterFix(); // after the last file: check every fix applied
  }

  /** Two buttons in the chat; the answer comes back through answerConfirm. */
  private ask(yes: string, onYes: () => Promise<void>, no = "No", onNo?: () => void): void {
    const id = `ask-${Date.now()}-${this.pending.size}`;
    this.pending.set(id, { yes, no, onYes, onNo });
    this.post({ type: "confirm", id, yes, no });
  }

  private async answerConfirm(id: string, accept: boolean): Promise<void> {
    const run = this.pending.get(id);
    this.pending.delete(id);
    this.post({ type: "confirmDone", id });
    if (!run) return;
    if (accept) await run.onYes();
    else if (run.onNo) run.onNo();
    else this.say("OK, I won't.");
  }

  private showError(err: unknown): void {
    log.error("fix review failed", err);
    this.postError(errorText(err));
  }

  /**
   * Every message goes to the backend's chat, which decides what it means: the server asks its
   * LLM, static mode uses the keyword rules. A reply with `run` is a command the extension
   * carries out here. If chat fails, the keyword rules still run clear commands (scan, stop, fix).
   */
  private async handleSend(input: string): Promise<void> {
    const text = input.trim();
    if (text === "") {
      return;
    }
    const localRun = commandFor(text, this.commandContext());
    if (localRun?.kind === "scanGithub") {
      this.remember({ id: `local-${Date.now()}`, role: "user", text, createdAt: new Date().toISOString() });
      await this.runCommand(localRun);
      return;
    }
    if (this.providers.length > 0 && !this.providers.some((p) => p.isActive)) {
      const run = localRun;
      if (!run) {
        this.postError("No AI model is active. Choose or add a model below to chat.", {
          label: "Choose Model",
          command: "reconix.selectModel",
        });
        return;
      }
    }
    await this.ensureSession();
    this.remember({ id: `local-${Date.now()}`, role: "user", text, createdAt: new Date().toISOString() });
    const asked = this.currentSessionId;
    log.info(`chat: message (${text.length} chars) in session ${asked ?? "none"}`);
    let reply: ChatReply | undefined;
    let run: ChatCommand | undefined;
    const abort = new AbortController();
    this.activeChatAbort = abort;
    try {
      reply = await this.backend.chat(asked ?? "", text, abort.signal, (piece) => {
        this.post({ type: "chatPiece", text: piece });
      });
      run = reply.run;
    } catch (err) {
      if (abort.signal.aborted) {
        log.info("chat: active request aborted by user");
        return;
      }
      // A failure that comes after a switch belongs to the old session: log it, show nothing here.
      if (this.currentSessionId !== asked) {
        log.warn(`chat: session ${asked ?? "none"} failed after a switch (${errorText(err)}); not shown`);
        return;
      }
      // The keyword rules stand in when the chat itself fails, not when the session refused it.
      if (NO_KEYWORD_FALLBACK.test(errorText(err))) throw err;
      run = commandFor(text, this.commandContext());
      if (!run) throw err;
      log.warn(`chat failed (${errorText(err)}); running "${run.kind}" from the keyword rules`);
    } finally {
      if (this.activeChatAbort === abort) {
        this.activeChatAbort = undefined;
      }
    }
    // The answer can take a while: if another session opened meanwhile, it belongs to the old one
    // (the server keeps it in that session's history), so neither show it here nor run its command.
    if (this.currentSessionId !== asked) {
      log.info(`chat: a reply for session ${asked ?? "none"} came after a switch; dropped here`);
      return;
    }
    if (reply?.message.text) {
      const offered = reply.actions.find((a) => a.kind === "fixFindings" && a.findingIds?.length);
      if (offered?.findingIds) this.lastMentioned = offered.findingIds;
      this.postMessage(reply.message, reply.actions);
    }
    if (!run) {
      return;
    }
    log.info(`chat: running ${run.kind}`);
    const command = run;
    // A fix asks on its own once it knows what it will really change (chatFix), so the
    // server's Yes/No would only be a second question about the same thing, with other numbers.
    if (command.confirm && command.kind !== "fix") {
      this.ask("Yes", () => this.runCommand(command));
      return;
    }
    await this.runCommand(command);
  }

  /** What the keyword rules need when the backend's chat can't decide. */
  private commandContext(): CommandContext {
    return { findings: [...(this.lastScan?.byId.values() ?? [])], lastMentioned: this.lastMentioned, providers: this.providers };
  }

  private async runCommand(run: ChatCommand): Promise<void> {
    switch (run.kind) {
      case "cancel":
        if (!this.runningScan) {
          this.say("No scan is running right now.");
          return;
        }
        this.say("Stopping the scan.");
        await this.cancelScan();
        return;
      case "scanGithub":
        await this.scanGithub(run.url ?? "");
        return;
      case "scan": {
        if (this.runningScan) {
          this.say("A scan is already running. I'll show the results when it finishes, or say \"stop\" to cancel it.");
          return;
        }
        const scope = run.paths?.length ? run.paths.map((p) => `\`${p}\``).join(", ") : "the workspace";
        const startingText = run.full ? `Starting a scan of ${scope} from scratch.` : `Starting a scan of ${scope}.`;
        const lastMsg = this.messages[this.messages.length - 1];
        if (!lastMsg || lastMsg.text.trim() !== startingText.trim()) {
          this.say(startingText);
        }
        await this.scanWorkspace(run.full ?? false, run.paths);
        return;
      }
      case "fix":
        await this.chatFix(run.findingIds ?? []);
        return;
      case "summarize":
        await this.runAction({ kind: "summarize", label: "Summarize" });
        return;
      case "showFindings":
        this.say(this.lastScan?.byId.size ? "Here are the findings." : "There are no findings yet. Ask me to **scan this project** first.");
        if (this.lastScan?.byId.size) this.post({ type: "showTab", tab: "findings" });
        return;
      case "switchModel":
        if (!run.providerId) {
          const names = this.providers.map((p) => `**${p.displayName}**`).join(", ");
          this.say(`Which model? ${names ? `You can switch to ${names}, or ` : ""}pick one in the model menu under the message box.`);
          return;
        }
        await this.activateProvider(run.providerId);
        return;
    }
  }

  /** Fixes the findings a fix command picked ("fix all high findings", "fix config.js", "fix it"). */
  private async chatFix(findingIds: string[]): Promise<void> {
    if (this.runningScan) {
      this.say("A scan is running. Ask me again when it has finished.");
      return;
    }
    const findings = [...(this.lastScan?.byId.values() ?? [])];
    if (findings.length === 0) {
      this.say("There are no findings to fix. Ask me to **scan this project** first.");
      return;
    }
    // Ids may be raw or merged, and two raw ids can name the same merged finding.
    const requested = new Set(findingIds);
    let targets = [...new Set([...requested]
      .map((id) => findings.find((f) => f.id === id || f.findingIds.includes(id)))
      .filter((f): f is MergedFinding => f !== undefined))];
    if (targets.length === 0) {
      this.say("Which findings should I fix? Name a finding id, a severity (\"fix all high findings\") or a file (\"fix config.js\"), or click **Fix** on a finding.");
      return;
    }
    const manual = targets.filter((f) => f.manualFix);
    const merged = targets.length;
    targets = targets.filter((f) => !f.manualFix);
    if (targets.length === 0) {
      this.say(fixOutcomeText("", manual.map((f) => ({ findingId: f.id, status: "NOT_FIXED", note: f.manualFix! })), (id) => findingTitle(findings.find((x) => x.id === id))));
      return;
    }
    // The backend counts raw hits, not merged findings.
    const chosen: MergedFinding[] = [];
    let rawHits = 0;
    for (const f of targets) {
      if (rawHits + f.findingIds.length > MAX_FIX_FINDINGS) break;
      rawHits += f.findingIds.length;
      chosen.push(f);
    }
    const ids = chosen.map((f) => f.id);
    const plan = fixPlanText({
      hits: requested.size,
      merged,
      manual: manual.length,
      chosen: chosen.length,
      fixable: targets.length,
      files: new Set(chosen.map((f) => f.path)).size,
      single: chosen.length === 1 ? `**${chosen[0].title}** (\`${chosen[0].path}${chosen[0].line !== undefined ? `:${chosen[0].line}` : ""}\`)` : undefined,
    });
    this.say(plan.text);
    if (plan.ask) {
      this.ask("Yes, fix them", () => this.fixFindings(ids));
      return;
    }
    await this.fixFindings(ids);
  }
}

/** Assistant text goes to the webview as host-rendered markdown too; other roles stay plain. */
function messageView(message: Message): MessageView {
  return message.role === "assistant" ? { ...message, html: renderMarkdown(message.text) } : message;
}

interface PreparedFix {
  rel: string;
  uri: vscode.Uri;
  original: string;
  fixed: string;
  edits: number;
  dropped: number;
}

function findingTitle(finding: MergedFinding | undefined): string {
  return finding ? `${finding.title} (${finding.path}${finding.line !== undefined ? `:${finding.line}` : ""})` : "an earlier finding";
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
