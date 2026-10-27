"use client";

/* The new-chat screen: the box the faint globe sits behind (data-globe-slot, placed by the
   motion layer), a welcome line, what the assistant can and can't do, and suggestions from the
   real data in scope (the header names the scope). Its backgrounds stay transparent so the
   globe shows through. */
import { useAssistant } from "./assistant-provider";
import { PromptCards } from "./prompt-cards";
import type { WelcomePrompt } from "./types";

export function Welcome() {
  const { info, canAsk, ask, setDraft, conversation } = useAssistant();
  const one = conversation.scope.uid !== null;
  const pick = (p: WelcomePrompt) => {
    if (!ask(p.question)) setDraft(p.question); // busy opening a conversation: keep it for later
  };
  return (
    <div className="ai-welcome">
      <div className="ai-welcome-hero">
        <div data-globe-slot className="ai-globe-slot" aria-hidden />
        <h2 className="ai-welcome-title">How can I help with {one ? "this assessment" : "your assessments"}?</h2>
        <p className="ai-welcome-sub">
          Answers come from your saved assessment data, with verified cards for findings, progress and approvals. Decisions and approvals stay in the Reconix TUI.
        </p>
      </div>
      <PromptCards prompts={conversation.scope.uid === info.scope.uid ? info.prompts : []} onPick={pick} disabled={canAsk ? null : "Asking needs a model (see below)"} />
    </div>
  );
}
