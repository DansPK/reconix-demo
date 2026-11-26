"use client";

/* The Security knowledge page's data: every document (the list) and what each talks about (the
   graph), in one read from the Core API. Read when the page is shown (every time it is shown
   again), and again after an upload or a removal. A failed read keeps what it had and says why. */
import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "@/lib/knowledge/client";
import type { KnowledgeItem } from "@/lib/knowledge/types";

export interface KnowledgeData {
  status: "loading" | "ready" | "error";
  data: api.KnowledgeGraphAnswer | null;
  error: string | null;
}

export function useKnowledgeGraph(shown: boolean, initialData: api.KnowledgeGraphAnswer | null = null) {
  const [state, setState] = useState<KnowledgeData>(() =>
    initialData ? { status: "ready", data: initialData, error: null } : { status: "loading", data: null, error: null },
  );
  const epochRef = useRef(0);
  const skippedInitialRef = useRef(Boolean(initialData));

  const apply = useCallback((epoch: number, result: api.Result<api.KnowledgeGraphAnswer>) => {
    if (epochRef.current !== epoch) return;
    setState((s) => (result.ok ? { status: "ready", data: result.value, error: null } : { status: s.data ? "ready" : "error", data: s.data, error: result.detail }));
  }, []);
  const load = useCallback(() => {
    const epoch = ++epochRef.current;
    return api.loadKnowledgeGraph().then((result) => apply(epoch, result));
  }, [apply]);

  useEffect(() => {
    if (!shown) return;
    if (skippedInitialRef.current) {
      skippedInitialRef.current = false;
      return;
    }
    const epoch = ++epochRef.current;
    let live = true;
    void api.loadKnowledgeGraph().then((result) => {
      if (live) apply(epoch, result);
    });
    return () => {
      live = false;
    };
  }, [shown, apply]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: s.data ? "ready" : "loading", error: null }));
    void load();
  }, [load]);

  /** Remove a document: null when done (the graph follows), else why not. */
  const remove = useCallback(
    async (item: KnowledgeItem): Promise<string | null> => {
      const result = await api.removeKnowledge(item.id);
      if (!result.ok && result.status !== 404) return result.detail;
      setState((s) => {
        if (!s.data) return s;
        const rest = { ...s.data.references };
        delete rest[item.id];
        return { ...s, data: { ...s.data, items: s.data.items.filter((i) => i.id !== item.id), references: rest } };
      });
      void load();
      return null;
    },
    [load],
  );

  /** A document was uploaded: read everything again (its references come with it). */
  const added = useCallback(() => void load(), [load]);

  return { state, reload, remove, added };
}
