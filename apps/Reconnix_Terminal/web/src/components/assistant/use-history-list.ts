"use client";

/* The saved conversations for the History menu: read when the menu opens, read again after an
   answer once it has been opened. */
import { useCallback, useState } from "react";

import * as api from "@/lib/assistant/client";
import type { ConversationSummary } from "@/lib/assistant/history-schema";
import { useLatest } from "./use-latest";

export interface HistoryState {
  status: "idle" | "loading" | "ready" | "error";
  items: ConversationSummary[];
  error: string | null;
}

export function useHistoryList() {
  const [history, setHistory] = useState<HistoryState>({ status: "idle", items: [], error: null });
  const latest = useLatest({ status: history.status });

  const loadHistory = useCallback(() => {
    setHistory((h) => ({ ...h, status: h.status === "ready" ? "ready" : "loading", error: null }));
    void api.listConversations().then((result) =>
      setHistory((h) => (result.ok ? { status: "ready", items: result.conversations, error: null } : { ...h, status: "error", error: result.detail })),
    );
  }, []);

  const refreshHistory = useCallback(() => {
    if (latest.current.status !== "idle") loadHistory();
  }, [latest, loadHistory]);

  const forget = useCallback((id: string) => setHistory((h) => ({ ...h, items: h.items.filter((x) => x.id !== id) })), []);

  return { history, setHistory, loadHistory, refreshHistory, forget };
}

export type HistoryList = ReturnType<typeof useHistoryList>;
