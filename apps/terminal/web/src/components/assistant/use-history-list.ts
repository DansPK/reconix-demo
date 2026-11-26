"use client";

/* The saved conversations for the History menu: read when the menu opens, read again after an
   answer once it has been opened. */
import { useCallback, useState, type SetStateAction } from "react";

import * as api from "@/lib/assistant/client";
import { createEpochGuard } from "@/lib/assistant/chat-state";
import type { ConversationSummary } from "@/lib/assistant/history-schema";
import { useLatest } from "./use-latest";

export interface HistoryState {
  status: "idle" | "loading" | "ready" | "error";
  items: ConversationSummary[];
  error: string | null;
}

export function useHistoryList() {
  const [history, setHistory] = useState<HistoryState>({ status: "idle", items: [], error: null });
  const [guard] = useState(createEpochGuard);
  const latest = useLatest({ status: history.status });

  const loadHistory = useCallback(() => {
    const epoch = guard.next();
    setHistory((h) => ({ ...h, status: h.status === "ready" ? "ready" : "loading", error: null }));
    void api.listConversations().then((result) => {
      if (!guard.isCurrent(epoch)) return;
      setHistory((h) => (result.ok ? { status: "ready", items: result.conversations, error: null } : { ...h, status: "error", error: result.detail }));
    });
  }, [guard]);

  const refreshHistory = useCallback(() => {
    if (latest.current.status !== "idle") loadHistory();
  }, [latest, loadHistory]);

  const forget = useCallback((id: string) => {
    guard.next();
    setHistory((h) => ({ ...h, items: h.items.filter((x) => x.id !== id) }));
  }, [guard]);

  const setHistoryAndInvalidate = useCallback(
    (next: SetStateAction<HistoryState>) => {
      guard.next();
      setHistory(next);
    },
    [guard],
  );

  return { history, setHistory: setHistoryAndInvalidate, loadHistory, refreshHistory, forget };
}

export type HistoryList = ReturnType<typeof useHistoryList>;
