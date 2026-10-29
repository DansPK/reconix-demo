"use client";

/* The assistant's header: the Reconix mark (the terminal's ◆) and its name, what the open
   conversation is about (a run, or every run) with that scope's status, Security knowledge (the
   documents it may quote; its label hidden on a phone), History, New chat and
   minimize (back to the dashboard). The model is chosen in the composer (model-chip.tsx). */
import { BookLock, Crosshair, Minimize2, SquarePen } from "lucide-react";
import { leaveAssistant } from "@/components/dashboard/view-url";
import { IconButton } from "@/components/ui/icon-button";
import { ReconixMark } from "@/components/ui/reconix-mark";
import { useAssistant } from "./assistant-provider";
import { ConversationMenu } from "./conversation-menu";
import { ScopeBadge } from "./scope-badge";

export function AssistantHeader({ onMinimize }: { onMinimize: () => void }) {
  const { info, conversation, messages, newChat, busy } = useAssistant();
  const empty = !conversation.id && messages.length === 0;

  return (
    <header data-assistant-piece className="ai-header">
      <div className="ai-brand">
        <ReconixMark size={26} className="shrink-0" />
        <h1 className="ai-title">Reconix AI Assistant</h1>
      </div>
      <span className="ai-divider" aria-hidden />
      <div className="ai-context" title={`${conversation.id ? "This conversation is" : "A new conversation will be"} about ${conversation.scope.label}`}>
        <Crosshair className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">About</span>
        <span className="ai-context-label">{conversation.scope.label}</span>
        <ScopeBadge scope={conversation.scope} runs={info.runs} />
      </div>
      <div className="ai-tools">
        <button
          type="button"
          onClick={() => leaveAssistant("knowledge")}
          className="ai-btn"
          aria-label="Security knowledge"
          title="Security knowledge: the documents the AI can quote"
        >
          <BookLock className="size-4" aria-hidden />
          <span className="ai-btn-label">Security knowledge</span>
        </button>
        <ConversationMenu />
        <button type="button" onClick={newChat} disabled={empty && !busy} className="ai-btn" title={empty ? "This is a new chat already" : "Start a new chat (this one stays in History)"}>
          <SquarePen className="size-4" aria-hidden />
          <span className="ai-btn-label">New chat</span>
        </button>
        <IconButton label="Back to the dashboard" onClick={onMinimize}>
          <Minimize2 aria-hidden />
        </IconButton>
      </div>
    </header>
  );
}
