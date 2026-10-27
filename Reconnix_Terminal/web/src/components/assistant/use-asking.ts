"use client";

/* Asking: the question goes to /api/assistant with only the open conversation's id (the server
   reads the history from its own file) and comes back as NDJSON frames that fill in the reply:
   its conversation (header, then `meta`, which also names the /add-on files the model was
   given), the verified cards, the text, an error. Stop aborts
   it (the server keeps what had arrived, marked stopped). Retry asks a failed question again,
   never while an answer is being written. Questions are masked, then cut to the limit. */
import { useCallback, useState } from "react";

import * as api from "@/lib/assistant/client";
import { AUTO_TITLE, cleanTitle } from "@/lib/assistant/history-schema";
import { MAX_CARDS } from "@/lib/assistant/protocol";
import { redact } from "@/lib/assistant/redact";
import { MAX_QUESTION } from "@/lib/assistant/request";
import type { AssistantInfo, ChatMessage } from "./types";
import { useLatest } from "./use-latest";
import type { Slot } from "./slot";
import { pageScope, type OpenState } from "./use-open-conversation";

const MAX_SHOWN = 40_000; // characters of one streamed reply kept on screen
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** A question as it is shown and sent: masked first, then cut, as the server keeps it. */
export const asQuestion = (text: string) => redact(text.trim()).trim().slice(0, MAX_QUESTION);

export function useAsking({
  info,
  open,
  stream,
  draft,
  clearDraft,
  refreshHistory,
}: {
  info: AssistantInfo;
  open: OpenState;
  stream: Slot<AbortController>;
  draft: string;
  clearDraft: () => void;
  refreshHistory: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const latest = useLatest({ info, opened: open.opened, messages: open.messages });
  const { patch, setMessages, setOpened, setNotice, isReading } = open;

  const send = useCallback(
    (question: string, retry: boolean): boolean => {
      const { info: now, opened } = latest.current;
      if (!question || stream.get() || isReading() || !now.model.configured) return false;
      const asked: ChatMessage = { id: newId(), role: "user", content: question };
      const reply: ChatMessage = { id: newId(), role: "assistant", content: "", cards: [], state: "streaming", question };
      setMessages((list) => [...list, asked, reply]);
      setNotice(null);
      setBusy(true);
      const controller = new AbortController();
      stream.set(controller);
      const scope = opened?.scope ?? pageScope(now);

      void (async () => {
        try {
          const result = await api.askQuestion(
            { conversationId: opened?.id ?? undefined, uid: now.scope.uid, question, retry },
            controller.signal,
            (frame) => {
              if (frame.t === "meta") {
                setOpened({ id: frame.conversationId, title: frame.title, scope: frame.scope });
                const used = frame.knowledge;
                if (used?.length) patch(reply.id, (m) => ({ ...m, knowledge: used }));
              } else if (frame.t === "card") patch(reply.id, (m) => ({ ...m, cards: [...(m.cards ?? []), frame.card].slice(0, MAX_CARDS) }));
              else if (frame.t === "text") patch(reply.id, (m) => ({ ...m, content: (m.content + frame.delta).slice(0, MAX_SHOWN) }));
              else if (frame.t === "error") patch(reply.id, (m) => ({ ...m, state: "error", detail: frame.detail }));
            },
            // known before the first frame: a Stop right away still belongs to this conversation
            (id) => setOpened((o) => (o?.id === id ? o : { id, title: o?.title || cleanTitle(question, AUTO_TITLE), scope })),
          );
          if (!result.ok) {
            patch(reply.id, (m) => ({ ...m, state: "error", detail: result.detail }));
            if (result.status === 404 && opened?.id) setOpened(null); // gone: Retry starts a new conversation
            return;
          }
          patch(reply.id, (m) =>
            m.state === "error" ? m : result.complete ? { ...m, state: undefined } : { ...m, state: "error", detail: "The answer broke off before it ended." },
          );
        } catch {
          patch(reply.id, (m) => (controller.signal.aborted ? { ...m, state: "stopped" } : { ...m, state: "error", detail: "The connection to the assistant broke off." }));
        } finally {
          if (stream.get() === controller) stream.set(null);
          setBusy(false);
          refreshHistory();
        }
      })();
      return true;
    },
    [latest, stream, isReading, setMessages, setNotice, setOpened, patch, refreshHistory],
  );

  const ask = useCallback(
    (text?: string) => {
      const sent = send(asQuestion(text ?? draft), false);
      if (sent && text === undefined) clearDraft();
      return sent;
    },
    [draft, send, clearDraft],
  );

  const retry = useCallback(() => {
    const last = latest.current.messages.at(-1);
    if (!last || last.role !== "assistant" || last.state !== "error" || !last.question || stream.get()) return;
    const question = last.question;
    setMessages((list) => list.slice(0, -2)); // the failed question and its error
    send(question, true);
  }, [latest, stream, setMessages, send]);

  const stop = useCallback(() => stream.get()?.abort(), [stream]);

  return { busy, ask, retry, stop };
}
