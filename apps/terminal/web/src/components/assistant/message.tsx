"use client";

/* One message of the conversation. The operator's: a bubble on the right. The assistant's:
   beside the Reconix mark (the terminal's ◆; it glows on the shared breathing cycle while the
   reply is being written), full width, the verified cards first (built by the server from the
   saved data), then the model's text as Markdown, "Knowledge used: …" when /add-on files were
   given to the model, then Copy; "Stopped" after Stop, an error card with
   Retry when it failed, and a friendlier card (with Retry too) when the model returned nothing. */
import { useEffect, useState } from "react";
import { CircleStop } from "lucide-react";
import type { CardOf } from "@/lib/assistant/protocol";
import { ReconixMark } from "@/components/ui/reconix-mark";
import { useBreathPhase } from "./breath";
import { CardView, NoticeCard } from "./cards";
import { CopyButton } from "@/components/ui/copy-button";
import { EMPTY_REPLY, isEmptyReply, NO_EXPLANATION } from "./empty-reply";
import { KnowledgeUsed } from "./knowledge-used";
import { MessageText } from "./message-text";
import { SourcesUsed } from "./sources-used";
import type { ChatMessage } from "./types";

const failed = (detail: string | undefined): CardOf<"notice"> => ({
  kind: "notice",
  tone: "danger",
  title: "The assistant couldn't answer",
  body: detail || "Something went wrong while answering.",
  steps: [],
  action: null,
});
const empty = (withCards: boolean): CardOf<"notice"> => ({ kind: "notice", tone: "info", ...(withCards ? NO_EXPLANATION : EMPTY_REPLY), steps: [], action: null });

/** Status words shown while waiting for the assistant's first tokens. */
export const THINKING_WORDS = [
  "Thinking…",
  "Analyzing…",
  "Reviewing…",
  "Inspecting…",
  "Checking…",
  "Reasoning…",
  "Correlating…",
] as const;

const WORD_ROTATE_MS = 2_000;

/** Pick a random thinking word different from `current`. */
export function pickNextWord(current: string, random: () => number = Math.random): string {
  const candidates = THINKING_WORDS.filter((w) => w !== current);
  return candidates[Math.floor(random() * candidates.length)] ?? THINKING_WORDS[0];
}

function WaitingStatus() {
  const [word, setWord] = useState<string>(THINKING_WORDS[0]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setWord((current) => pickNextWord(current));
    }, WORD_ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="ai-typing" role="status" aria-label="The assistant is answering">
      <span className="ai-typing-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="ai-typing-label" aria-hidden>
        {word}
      </span>
    </span>
  );
}

/** A reply's avatar: the mark, lit (`data-live`, in phase with the page clock) while `live`. */
function ReplyMark({ live }: { live: boolean }) {
  const phase = useBreathPhase(live);
  return <ReconixMark size={26} variant="bot" className="ai-avatar" data-live={live ? "" : undefined} style={phase} />;
}

export function Message({ m, onRetry }: { m: ChatMessage; onRetry?: () => void }) {
  if (m.role === "user") {
    return (
      <div className="ai-row-user">
        <p className="ai-bubble">{m.content}</p>
      </div>
    );
  }
  const streaming = m.state === "streaming";
  const waiting = streaming && !m.content;
  return (
    <div className="ai-row-assistant">
      <ReplyMark live={streaming} />
      <div className="ai-reply">
        <span className="sr-only">Reconix AI:</span>
        <span className="ai-reply-who" aria-hidden>
          Reconix AI
        </span>
        {m.cards?.map((card, i) => <CardView key={i} card={card} />)}
        {m.content ? <MessageText text={m.content} /> : null}
        {m.content.trim() ? <KnowledgeUsed names={m.knowledge} /> : null}
        {m.content.trim() ? <SourcesUsed sources={m.sources} answer={m.content} /> : null}
        {waiting && <WaitingStatus />}
        {m.state === "error" && <NoticeCard card={isEmptyReply(m) ? empty((m.cards?.length ?? 0) > 0) : failed(m.detail)} onRetry={onRetry} />}
        {m.state === "stopped" && (
          <span className="ai-stopped">
            <CircleStop className="size-3.5" aria-hidden /> Stopped
          </span>
        )}
        {!streaming && m.content.trim() && (
          <div className="ai-actions">
            <CopyButton text={m.content} label="Copy this answer" />
          </div>
        )}
      </div>
    </div>
  );
}
