"use client";

/* The "Continue this chat, or a new chat about the run the dashboard shows?" question
   (switch-rules.ts says when). A question asked while it is open (the Overview's Ask bar sends,
   then opens the assistant) waits in the draft: it goes to the chat the operator picks. Closing
   the popup without a choice keeps the chat and leaves the question unsent in the draft. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type Answered, forget, switchAsk, type SwitchAsk, type SwitchState } from "./switch-rules";
import type { AssistantInfo } from "./types";
import { useLatest } from "./use-latest";
import type { OpenState } from "./use-open-conversation";

export interface SwitchChoice {
  /** The open question, or null. */
  pending: SwitchAsk | null;
  /** A question waits for the answer (sent once one is chosen). */
  held: boolean;
  /** Keep the open chat (and send the waiting question to it). */
  keep: () => void;
  /** A new chat about what the dashboard shows (and send the waiting question there). */
  switchOver: () => void;
  /** Closed without a choice: keep the chat, the waiting question stays in the draft. */
  dismiss: () => void;
  /** `ask`, except that it waits while the question is open. */
  askOrHold: (text?: string) => boolean;
}

interface Deps {
  info: AssistantInfo;
  open: OpenState;
  ask: (text?: string) => boolean;
  setDraft: (text: string) => void;
}

export function useSwitchAsk({ info, open, ask, setDraft }: Deps): SwitchChoice {
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [held, setHeld] = useState(false);
  const sendInNew = useRef(false); // a waiting question goes to the new chat once it is open
  const { conversation, messages, opening, newChat } = open;

  const state: SwitchState = { id: conversation.id, about: conversation.scope, page: info.scope, messages: messages.length, opening, answered };
  if (forget(state)) setAnswered(null); // adjusting state to new props, during render
  const pending = switchAsk(state);
  // nothing to choose any more (the dashboard went back to the chat's run, or another chat is
  // open): a held question stops waiting, so a later switch never sends a draft unasked
  if (held && !pending) setHeld(false);
  const latest = useLatest({ pending, ask });

  const answer = useCallback(() => {
    const now = latest.current.pending;
    if (now) setAnswered({ id: now.id, uid: now.to.uid });
  }, [latest]);

  const keep = useCallback(() => {
    answer();
    if (held) latest.current.ask(); // the open chat stays: the draft goes to it now
    setHeld(false);
  }, [answer, held, latest]);

  const switchOver = useCallback(() => {
    newChat();
    if (held) sendInNew.current = true; // asked once the new chat is open (below)
    setHeld(false);
  }, [newChat, held]);

  const dismiss = useCallback(() => {
    answer();
    setHeld(false);
  }, [answer]);

  // the new chat is open (its render has run): send the question that waited
  useEffect(() => {
    if (!sendInNew.current || conversation.id !== null) return;
    sendInNew.current = false;
    latest.current.ask();
  }, [conversation.id, latest]);

  const askOrHold = useCallback(
    (text?: string) => {
      const { pending: now, ask: send } = latest.current;
      if (!now) return send(text);
      if (text !== undefined) setDraft(text); // a question with its own text waits in the draft too
      setHeld(true); // the draft waits for the answer
      return false;
    },
    [latest, setDraft],
  );

  const { id = null, from, to } = pending ?? {};
  return useMemo(
    () => ({ pending: id && from && to ? { id, from, to } : null, held, keep, switchOver, dismiss, askOrHold }),
    [id, from, to, held, keep, switchOver, dismiss, askOrHold],
  );
}
