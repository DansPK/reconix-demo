"use client";

/* The documents' content, read from the Core API when first needed and kept while the page is
   open: a page of passages at a time ("Load more" asks for the next), so a long document never
   comes all at once. `all` reads up to MENTION_PAGES pages, for the snippets of "Mentions". */
import { useCallback, useRef, useState } from "react";

import * as api from "@/lib/knowledge/client";

export type DocContent = { status: "loading" | "ready" | "error"; total: number; passages: api.Passage[]; error: string | null };

const PAGE = 50;
const MENTION_PAGES = 4;

export function usePassages() {
  const [content, setContent] = useState<Record<string, DocContent>>({});
  const asked = useRef(new Set<string>());
  const genRef = useRef(new Map<string, number>());
  const pagingRef = useRef(new Set<string>());
  const genOf = (id: string) => genRef.current.get(id) ?? 0;

  const page = useCallback(async (id: string, offset: number, gen = genOf(id)): Promise<{ ok: boolean; more: boolean }> => {
    const result = await api.loadPassages(id, offset, PAGE);
    if ((genRef.current.get(id) ?? 0) !== gen) return { ok: false, more: false };
    setContent((c) => {
      const was = c[id];
      if (!result.ok) return { ...c, [id]: { status: "error", total: was?.total ?? 0, passages: was?.passages ?? [], error: result.detail } };
      const passages = [...(offset === 0 ? [] : (was?.passages ?? [])), ...result.value.passages];
      return { ...c, [id]: { status: "ready", total: result.value.total, passages, error: null } };
    });
    return { ok: result.ok, more: result.ok && offset + PAGE < result.value.total };
  }, []);

  /** The first page of a document's passages (once). */
  const load = useCallback(
    (id: string) => {
      if (asked.current.has(id)) return;
      asked.current.add(id);
      const gen = genOf(id);
      setContent((c) => ({ ...c, [id]: { status: "loading", total: 0, passages: [], error: null } }));
      void page(id, 0, gen);
    },
    [page],
  );

  /** The next page. */
  const more = useCallback(
    (id: string) => {
      if (pagingRef.current.has(id)) return;
      pagingRef.current.add(id);
      const have = content[id]?.passages.length ?? 0;
      const gen = genOf(id);
      void page(id, have, gen).finally(() => pagingRef.current.delete(id));
    },
    [content, page],
  );

  /** Up to MENTION_PAGES pages (for snippets). */
  const all = useCallback(
    (id: string) => {
      if (asked.current.has(`all:${id}`)) return;
      asked.current.add(`all:${id}`);
      asked.current.add(id);
      const gen = genOf(id);
      setContent((c) => (c[id] ? c : { ...c, [id]: { status: "loading", total: 0, passages: [], error: null } }));
      void (async () => {
        for (let p = 0, go = true; go && p < MENTION_PAGES; p++) {
          const step = await page(id, p * PAGE, gen);
          if (!step.ok) {
            if ((genRef.current.get(id) ?? 0) === gen) asked.current.delete(`all:${id}`);
            return;
          }
          go = step.more;
        }
      })();
    },
    [page],
  );

  /** Load enough pages so passage `index` is included. */
  const ensure = useCallback(
    (id: string, index: number) => {
      if (index < PAGE) {
        load(id);
        return;
      }
      const needed = Math.min(25, Math.floor(index / PAGE) + 1);
      const key = `ensure:${id}:${needed}`;
      if (asked.current.has(key)) return;
      asked.current.add(key);
      asked.current.add(id);
      const gen = genOf(id);
      setContent((c) => (c[id] ? c : { ...c, [id]: { status: "loading", total: 0, passages: [], error: null } }));
      void (async () => {
        for (let p = 0, go = true; go && p < needed; p++) {
          const step = await page(id, p * PAGE, gen);
          if (!step.ok) {
            if ((genRef.current.get(id) ?? 0) === gen) asked.current.delete(key);
            return;
          }
          go = step.more;
        }
      })();
    },
    [load, page],
  );

  /** Forget a document (removed, or reloaded). */
  const forget = useCallback((id: string) => {
    genRef.current.set(id, (genRef.current.get(id) ?? 0) + 1);
    pagingRef.current.delete(id);
    asked.current.delete(id);
    asked.current.delete(`all:${id}`);
    for (const key of asked.current) {
      if (key.startsWith(`ensure:${id}:`)) asked.current.delete(key);
    }
    setContent((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
  }, []);

  return { content, load, more, all, ensure, forget };
}

export type Passages = ReturnType<typeof usePassages>;
