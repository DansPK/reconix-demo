"use client";

/* Each view's scroll position while the assistant is open over it: the content area (the desktop
   frame's scroller) and the page (the scroller without the fixed-height frame). Saved as it
   opens, restored when the view it closes back to is shown again. */
import { type RefObject, useCallback, useRef } from "react";
import type { View } from "@/components/dashboard/view-url";

type Saved = { content: number; page: number };

export function useViewScroll(stage: RefObject<HTMLElement | null>) {
  const saved = useRef<Partial<Record<View, Saved>>>({});
  const pending = useRef<View | null>(null);

  const scroller = useCallback(() => stage.current?.closest(".dash-frame")?.querySelector<HTMLElement>(".dash-content") ?? null, [stage]);

  const save = useCallback((v: View) => {
    pending.current = null;
    saved.current[v] = { content: scroller()?.scrollTop ?? 0, page: window.scrollY };
  }, [scroller]);

  const restore = useCallback((v: View) => {
    const s = saved.current[v];
    if (!s) return;
    const el = scroller();
    if (el) el.scrollTop = s.content;
    if (window.scrollY !== s.page) window.scrollTo({ top: s.page, behavior: "instant" });
  }, [scroller]);

  /** Restore `v` once the Viewer shows it; nothing to wait for when it shows it already. */
  const restoreWhenShown = useCallback((v: View, shownNow: View) => {
    pending.current = v !== shownNow ? v : null;
  }, []);

  /** The Viewer shows `v` now. */
  const shown = useCallback((v: View) => {
    if (pending.current !== v) return;
    pending.current = null;
    restore(v);
  }, [restore]);

  return { save, restore, restoreWhenShown, shown };
}
