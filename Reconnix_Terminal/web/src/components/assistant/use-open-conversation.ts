"use client";

/* Which conversation is open and its messages: a new chat (about what the dashboard shows), or
   a saved one read from the server. Opening one stops whatever was streaming. The open
   conversation stays open when the dashboard moves to another run (a card link, the switcher):
   the view says it is about another run and offers a new chat for this one. */
import { useCallback, useMemo, useRef, useState } from "react";

import * as api from "@/lib/assistant/client";
import type { ScopeRef } from "@/lib/assistant/protocol";
import type { Slot } from "./slot";
import type { AssistantInfo, ChatMessage } from "./types";

export interface OpenConversation {
  id: string | null; // null: a new chat, saved with its first question
  title: string;
  scope: ScopeRef; // what it is about (a new chat: what the dashboard shows)
}

export const pageScope = (info: AssistantInfo): ScopeRef => ({ uid: info.scope.uid, label: info.scope.label });

export function useOpenConversation(info: AssistantInfo, stream: Slot<AbortController>, onGone: (id: string) => void) {
  const [opened, setOpened] = useState<OpenConversation | null>(null); // null: a new chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const reading = useRef<AbortController | null>(null);

  const conversation = useMemo<OpenConversation>(() => opened ?? { id: null, title: "", scope: pageScope(info) }, [opened, info]);

  const halt = useCallback(() => {
    stream.get()?.abort();
    reading.current?.abort();
  }, [stream]);

  const newChat = useCallback(() => {
    halt();
    setOpened(null);
    setMessages([]);
    setOpening(false);
    setNotice(null);
  }, [halt]);

  /** Opens saved conversation `id`; resolves false when it couldn't (gone, or refused). */
  const openConversation = useCallback(
    (id: string): Promise<boolean> => {
      halt();
      const controller = new AbortController();
      reading.current = controller;
      setOpening(true);
      setNotice(null);
      return api
        .readConversation(id, controller.signal)
        .then((result) => {
          if (reading.current !== controller) return false;
          if (result.ok) {
            const c = result.conversation;
            setOpened({ id: c.id, title: c.title, scope: c.scope });
            setMessages(api.toMessages(c));
            return true;
          }
          setOpened(null);
          setMessages([]);
          setNotice(result.status === 404 ? "That conversation is not saved any more." : result.detail);
          if (result.status === 404) onGone(id);
          return false;
        })
        .catch(() => false) // replaced by another open
        .finally(() => {
          if (reading.current === controller) {
            reading.current = null;
            setOpening(false);
          }
        });
    },
    [halt, onGone],
  );

  const patch = useCallback((id: string, change: (m: ChatMessage) => ChatMessage) => setMessages((list) => list.map((m) => (m.id === id ? change(m) : m))), []);
  const isReading = useCallback(() => reading.current !== null, []);

  return { opened, setOpened, messages, setMessages, patch, opening, notice, setNotice, conversation, newChat, openConversation, halt, isReading };
}

export type OpenState = ReturnType<typeof useOpenConversation>;
