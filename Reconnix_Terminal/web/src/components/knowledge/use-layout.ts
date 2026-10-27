"use client";

/* Table or Grid on the Security knowledge page, remembered per browser (localStorage; a blocked
   storage keeps the choice for this page only). With nothing chosen yet, phones get the grid and
   wider screens the table. The server renders the table; the choice follows once the page runs. */
import { useCallback, useSyncExternalStore } from "react";

export type Layout = "table" | "grid";

const KEY = "reconix.knowledge.layout";
const PHONE = "(max-width: 639.98px)";

let chosen: Layout | null = null; // this page's choice, when storage is blocked
const listeners = new Set<() => void>();

function read(): Layout {
  try {
    const kept = window.localStorage.getItem(KEY);
    if (kept === "table" || kept === "grid") return kept;
  } catch {
    // storage blocked: this page's choice, else the default
  }
  return chosen ?? (window.matchMedia(PHONE).matches ? "grid" : "table");
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const phone = window.matchMedia(PHONE);
  phone.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    phone.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLayout(): [Layout, (layout: Layout) => void] {
  const layout = useSyncExternalStore(subscribe, read, () => "table" as const);
  const choose = useCallback((next: Layout) => {
    chosen = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // storage blocked or full: kept for this page only
    }
    for (const notify of listeners) notify();
  }, []);
  return [layout, choose];
}
