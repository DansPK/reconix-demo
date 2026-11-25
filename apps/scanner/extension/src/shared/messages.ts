// postMessage protocol between the webview and the extension host.
// Pure types only: the webview bundle imports this file.
import type {
  AgentEvent,
  ChatReply,
  ConnectionAction,
  ConnectionStatus,
  LlmProvider,
  LlmProviderInput,
  Message,
  ScanSummary,
  Session,
  SeverityCounts,
  Severity,
  SummaryReply,
  Verdict,
} from "./contract";

/**
 * What the webview needs to list a finding. Deliberately has no `snippet`: that is source text
 * and, for secret scanners, may be the secret itself.
 */
export interface FindingView {
  id: string;
  title: string;
  severity: Severity;
  verdict: Verdict;
  path: string;
  line?: number;
  endLine?: number;
  /** The scanner's own message. */
  message: string;
  ruleIds: string[];
  tools: string[];
  cwe?: string[];
  /** explanation / fixRecommendation rendered by the host with markdown-it (html: false). */
  explanationHtml?: string;
  fixRecommendationHtml?: string;
  /** Why the fix agent can't fix this (plain text); the UI shows it instead of a Fix button. */
  manualFix?: string;
  /** The file's content changed since the scan, so the line may have moved. */
  outdated: boolean;
}

/** A chat message as the webview shows it: assistant text also comes as host-rendered markdown. */
export interface MessageView extends Message {
  /** `text` rendered with markdown-it (html: false); set for assistant messages. */
  html?: string;
}

/** Messages the webview sends to the host. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "send"; text: string }
  | { type: "selectSession"; sessionId: string }
  | { type: "newSession" }
  | { type: "renameSession"; sessionId: string; title: string }
  /** `confirmed`: the user already said yes in the History menu, so don't ask again. */
  | { type: "deleteSession"; sessionId: string; confirmed?: boolean }
  /** "Delete all" in the History menu, confirmed there. */
  | { type: "deleteAllSessions" }
  | { type: "runAction"; action: ChatReply["actions"][number] }
  | { type: "cancelScan" }
  | { type: "openFinding"; findingId: string }
  | { type: "showFalsePositives"; on: boolean }
  /** The user picked a model in the composer's model menu. */
  | { type: "activateProvider"; providerId: string }
  /**
   * The model menu's form: add (no providerId) or edit a provider, then test it. `apiKey` is typed
   * in a masked field and sent only here; left out when editing, the saved key stays. The host
   * never sends a key back.
   */
  /** `formId`: which opening of the form asked; its statuses carry it back, so a stale one is dropped. */
  | { type: "saveProvider"; formId: number; providerId?: string; provider: LlmProviderInput }
  | { type: "testProvider"; formId: number; providerId: string }
  /** The host asks for confirmation first. */
  | { type: "deleteProvider"; providerId: string }
  /** The user clicked one of the buttons of a `confirm` message. */
  | { type: "answerConfirm"; id: string; accept: boolean }
  /** A connection problem's button, e.g. Set Token. Only "reconixCodeScanner." commands run. */
  | { type: "runCommand"; command: string }
  /** User cancelled/stopped the active chat request. */
  | { type: "cancelChat" }
  /** Insert code block text directly at active editor cursor. */
  | { type: "insertCode"; text: string };

/** Messages the host sends to the webview. */
export type HostToWebview =
  /** Streaming token / piece of assistant reply. */
  | { type: "chatPiece"; text: string }
  /** How many saved files have findings since the last scan: the Rescan button lights up with it. */
  | { type: "changedFiles"; count: number }
  | {
      type: "state";
      connection: ConnectionStatus;
      sessions: Session[];
      currentSessionId?: string;
      messages: MessageView[];
    }
  | { type: "chat"; reply: ChatReply; message: MessageView }
  /** Only the connection changed (e.g. "connecting" while reconnecting): redraw the header and banner. */
  | { type: "connection"; connection: ConnectionStatus }
  /** The session list changed (rename, delete) without a switch: redraw History only. */
  | { type: "sessions"; sessions: Session[]; currentSessionId?: string }
  /**
   * Ask this in the chat as if the user typed it (Explain from the editor): the webview shows it,
   * then sends it back as "send". Only host-built text; it never carries file contents.
   */
  | { type: "ask"; text: string }
  /** Switch the webview to a tab, e.g. after "show findings". */
  | { type: "showTab"; tab: "chat" | "findings" }
  /** The LLM providers for the composer's model menu; the active one has isActive. */
  | { type: "models"; providers: LlmProvider[] }
  /** The model form's status line: saving / testing, then whether it works. `providerId`: the one saved. */
  | { type: "providerStatus"; formId: number; providerId?: string; tone: "busy" | "ok" | "error"; text: string }
  | { type: "progress"; scan: ScanSummary }
  | {
      type: "findings";
      scanId: string;
      /** Visible findings, same-line hits merged (Q13), sorted most severe first. */
      findings: FindingView[];
      counts: SeverityCounts;
      /** Likely false positives left out because the setting is off. */
      hiddenFalsePositives: number;
    }
  /**
   * The summary card. `hidden`: likely false alarms hidden by the setting; `error`: problems some
   * scan steps had.
   */
  | { type: "summary"; summary: SummaryReply; hidden: number; error?: string }
  /** A live fix-agent transcript: start a block, append events to it, then close it. */
  | { type: "agentStart"; id: string; title: string }
  | { type: "agentEvent"; id: string; event: AgentEvent }
  | { type: "agentEnd"; id: string; title: string }
  /** Two buttons in the chat (e.g. "Apply fix" / "Skip"); the answer comes back as answerConfirm. */
  | { type: "confirm"; id: string; yes: string; no: string }
  /** The question was answered (or dropped): disable its buttons. */
  | { type: "confirmDone"; id: string }
  /** `action`: a button that fixes it (only "reconixCodeScanner." commands run). */
  | { type: "error"; message: string; action?: ConnectionAction };
