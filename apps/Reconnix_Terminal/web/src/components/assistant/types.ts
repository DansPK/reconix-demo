/* What the page tells the AI Assistant (plain data from the server, see src/app/page.tsx), and
   the messages of the open conversation as the page holds them. */
import type { Status } from "@/lib/data/schema";
import type { ChatMessage } from "@/lib/assistant/client";
import type { Card, ScopeRef } from "@/lib/assistant/protocol";
import type { WelcomePrompt } from "@/lib/assistant/prompts";

/** Which model answers. Static demo: always a fixed, local, canned model. */
export interface ModelSummary {
  configured: boolean;
  name: string;
  provider: string;
  local: boolean;
  reason: string;
}

export type { Card, ChatMessage, ScopeRef, WelcomePrompt };

/** A saved run, for the scope's status badge and the report card's links. */
export interface RunSummary {
  uid: string;
  label: string; // "RCX-DEMO-001"
  when: string; // "5 Oct 14:03"
  status: Status;
}

export interface AssistantInfo {
  /** What the dashboard shows now: a new conversation is about this. */
  scope: ScopeRef;
  runs: RunSummary[]; // every saved run, newest first
  prompts: WelcomePrompt[]; // the welcome screen's suggestions, from the data in scope
  retentionDays: number; // how long a conversation is kept without use (0: until deleted)
  /** The model that answers next (lib/assistant/models/resolve.ts); the model picker updates it. */
  model: ModelSummary;
}
