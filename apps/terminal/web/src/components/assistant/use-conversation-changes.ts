"use client";

/* Renaming and deleting saved conversations from the History menu. Each resolves to null when
   it worked, or what went wrong. "Delete all" checks what is left afterwards and says how many
   conversations were not deleted. */
import { useCallback } from "react";

import * as api from "@/lib/assistant/client";
import type { HistoryList } from "./use-history-list";
import { useLatest } from "./use-latest";
import type { OpenState } from "./use-open-conversation";

export function useConversationChanges(list: HistoryList, open: OpenState) {
  const latest = useLatest({ items: list.history.items, openId: open.opened?.id ?? null });
  const { setHistory, forget } = list;
  const { setOpened, newChat } = open;

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const result = await api.renameConversation(id, title);
      if (!result.ok) return result.detail;
      setHistory((h) => ({ ...h, items: h.items.map((x) => (x.id === id ? { ...x, title: result.title } : x)) }));
      setOpened((o) => (o && o.id === id ? { ...o, title: result.title } : o));
      return null;
    },
    [setHistory, setOpened],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const result = await api.deleteConversation(id);
      if (!result.ok && result.status !== 404) return result.detail;
      forget(id);
      if (latest.current.openId === id) newChat();
      return null;
    },
    [latest, forget, newChat],
  );

  const deleteAllConversations = useCallback(async () => {
    const known = new Set(latest.current.items.map((c) => c.id));
    const result = await api.deleteAllConversations();
    if (!result.ok) return result.detail;
    if (latest.current.openId) newChat();
    const after = await api.listConversations();
    if (!after.ok) {
      setHistory({ status: "error", items: [], error: after.detail });
      return result.deleted < known.size ? `${known.size - result.deleted} of ${known.size} conversations may not have been deleted.` : null;
    }
    setHistory({ status: "ready", items: after.conversations, error: null });
    const left = after.conversations.filter((c) => known.has(c.id)).length;
    return left ? `${left} ${left === 1 ? "conversation was" : "conversations were"} not deleted. Try again.` : null;
  }, [latest, newChat, setHistory]);

  return { renameConversation, deleteConversation, deleteAllConversations };
}
