"use client";

/* One message of the conversation. The operator's: a bubble on the right. The assistant's:
   beside the Reconix mark (the terminal's ◆; it glows on the shared breathing cycle while the
   reply is being written), full width, the verified cards first (built by the server from the
   saved data), then the model's text as Markdown, "Knowledge used: …" when /add-on files were
   given to the model, then Copy; "Stopped" after Stop, an error card with
   Retry when it failed, and a friendlier card (with Retry too) when the model returned nothing. */
import { CircleStop } from "lucide-react";
import type { CardOf } from "@/lib/assistant/protocol";
import { ReconixMark } from "@/components/ui/reconix-mark";
import { useBreathPhase } from "./breath";
import { CardView, NoticeCard } from "./cards";
import { CopyButton } from "@/components/ui/copy-button";
import { EMPTY_REPLY, isEmptyReply, NO_EXPLANATION } from "./empty-reply";
import { KnowledgeUsed } from "./knowledge-used";
import { MessageText } from "./message-text";
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

/** A reply's avatar: the mark, lit (`data-live`, in phase with the page clock) while `live`. */
function ReplyMark({ live }: { live: boolean }) {
  const phase = useBreathPhase(live);
  return <ReconixMark size={26} className="ai-avatar" data-live={live ? "" : undefined} style={phase} />;
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
  const waiting = streaming && !m.content && !m.cards?.length;
  return (
    <div className="ai-row-assistant">
      <ReplyMark live={streaming} />
      <div className="ai-reply">
        <span className="sr-only">Reconix AI:</span>
        {m.cards?.map((card, i) => <CardView key={i} card={card} />)}
        {m.content ? <MessageText text={m.content} /> : null}
        {m.content.trim() ? <KnowledgeUsed names={m.knowledge} /> : null}
        {waiting && (
          <span className="ai-typing" role="status" aria-label="The assistant is answering">
            <span />
            <span />
            <span />
          </span>
        )}
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
