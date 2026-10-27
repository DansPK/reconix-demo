// Messages between the extension and the webview. The webview never talks to the harness.

import type { ActiveModel, AgentEvent, ChatMessage, Finding, ProviderInfo, SessionInfo, SummaryCard } from "./contract";

export type ConnectionStatus =
  | { state: "connected" }
  | { state: "connecting" }
  | { state: "disconnected"; reason: string; action?: { label: string; command: string } };

export type ToExtension =
  | { type: "ready" }
  | { type: "send"; text: string }
  | { type: "cancel" }
  | { type: "confirm"; id: string; accept: boolean }
  | { type: "newSession" }
  | { type: "switchSession"; id: string }
  | { type: "renameSession"; id: string; name: string }
  /** `confirmed`: the user already said yes in the History menu, so don't ask again. */
  | { type: "deleteSession"; id: string; confirmed?: boolean }
  | { type: "deleteAllSessions" }
  | { type: "openFinding"; id: string }
  | { type: "fix"; ids: string[] }
  | { type: "showFalsePositives"; on: boolean }
  | { type: "runCommand"; command: string }
  /** Model picker. The API key is a masked password field, sent (with the base URL) only on Test;
   *  setProviderKey still opens a native password box for the Command Palette flow. */
  | { type: "testProvider"; id: string; model?: string; base_url?: string; api_key?: string }
  | { type: "activateModel"; id: string; model: string }
  | { type: "setProviderKey"; id: string }
  | { type: "pickModel" };

export interface FindingView extends Finding {
  /** The file changed since the scan, so lines may have moved. */
  outdated?: boolean;
}

export type ToWebview =
  | { type: "state"; connection: ConnectionStatus; sessions: SessionInfo[]; current: string | null;
      scanning: boolean; busy: boolean;
      /** Saved files with findings since the last scan: the Rescan button lights up. */
      changed: number;
      /** The flexible-model provider list + active model (single source of truth: the harness). */
      providers: ProviderInfo[]; activeModel: ActiveModel | null }
  /** Result of a Test connection; updates that provider's status in the picker. */
  | { type: "testResult"; provider: ProviderInfo }
  | { type: "history"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "progress"; percent: number; message: string; done?: boolean }
  | { type: "findings"; findings: FindingView[]; hidden: number; total: number }
  | { type: "thinking"; on: boolean }
  /** Yes/No buttons under the last assistant message; the answer comes back as a `confirm` message. */
  | { type: "confirm"; id: string; yes: string; no: string }
  | { type: "confirmDone"; id: string }
  /** The fix agent's live transcript: a block in the chat, then events appended to it as they stream in. */
  | { type: "agentStart"; id: string; title: string }
  | { type: "agentEvent"; id: string; event: AgentEvent }
  | { type: "agentEnd"; id: string; title: string }
  /** The scan summary card. `hidden`: likely false alarms hidden by the setting; `error`: scan problems. */
  | { type: "summaryCard"; card: SummaryCard; hidden: number; error: string | null }
  | { type: "error"; message: string; action?: { label: string; command: string } };
