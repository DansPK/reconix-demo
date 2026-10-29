"use client";

/* The Security knowledge page's list: read when the page is shown (every time it is shown again,
   so a file added with /add-on meanwhile appears), again after an upload or a removal. A failed
   read keeps the list it had and says why. */
import { useCallback, useEffect, useState } from "react";

import * as api from "@/lib/knowledge/client";
import type { KnowledgeListing } from "@/lib/knowledge/types";

export interface KnowledgeState {
  status: "loading" | "ready" | "error";
  listing: KnowledgeListing | null;
  error: string | null;
}

export function useKnowledge(shown: boolean) {
  const [state, setState] = useState<KnowledgeState>({ status: "loading", listing: null, error: null });

  const apply = useCallback((result: api.Result<KnowledgeListing>) => {
    setState((s) =>
      result.ok ? { status: "ready", listing: result.value, error: null } : { status: s.listing ? "ready" : "error", listing: s.listing, error: result.detail },
    );
  }, []);
  const load = useCallback(() => api.listKnowledge().then(apply), [apply]);

  useEffect(() => {
    if (!shown) return;
    let live = true;
    void api.listKnowledge().then((result) => {
      if (live) apply(result);
    });
    return () => {
      live = false;
    };
  }, [shown, apply]);

  /** Try again after a failed read. */
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: s.listing ? "ready" : "loading", error: null }));
    void load();
  }, [load]);

  return { state, reload };
}
