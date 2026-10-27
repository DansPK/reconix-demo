"use client";

/* The Security knowledge page's list: read when the page is shown (every time it is shown again,
   so a file added with /add-on meanwhile appears), again after an upload or a removal. A failed
   read keeps the list it had and says why. */
import { useCallback, useEffect, useState } from "react";

import * as api from "@/lib/knowledge/client";
import type { KnowledgeItem, KnowledgeListing } from "@/lib/knowledge/types";

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

  /** Remove a file: null when done (the list follows), else why not. */
  const remove = useCallback(
    async (item: KnowledgeItem): Promise<string | null> => {
      const result = await api.removeKnowledge(item.id);
      if (!result.ok && result.status !== 404) return result.detail;
      setState((s) => (s.listing ? { ...s, listing: { ...s.listing, items: s.listing.items.filter((i) => i.id !== item.id) } } : s));
      void load();
      return null;
    },
    [load],
  );

  /** A file was uploaded: show it first at once, then read the list again. */
  const added = useCallback(
    (item: KnowledgeItem) => {
      setState((s) => {
        const listing = s.listing ?? { state: "ok" as const, items: [], max: 50 };
        return { status: "ready", error: null, listing: { ...listing, state: "ok", items: [item, ...listing.items.filter((i) => i.id !== item.id)] } };
      });
      void load();
    },
    [load],
  );

  return { state, reload, remove, added };
}
