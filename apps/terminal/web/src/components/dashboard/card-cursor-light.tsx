"use client";

import { useEffect } from "react";

const TARGET = ".dash-card, .ui-row, .ai-prompt, .ai-card";

/**
 * Mounts once. Moves the soft light on whichever card or interactive row the pointer is over by
 * writing --mx/--my (read by ::before). One document listener, rAF-throttled, updating on both
 * pointer movement and scroll so the glow stays locked to the cursor. Off on coarse pointers.
 */
export function CardCursorLight() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let raf = 0;
    let el: HTMLElement | null = null;
    let clientX = 0;
    let clientY = 0;
    let hasPointer = false;
    const apply = () => {
      raf = 0;
      if (!el || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${clientX - r.left}px`);
      el.style.setProperty("--my", `${clientY - r.top}px`);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      hasPointer = true;
      clientX = e.clientX;
      clientY = e.clientY;
      el = (e.target as Element)?.closest?.(TARGET) as HTMLElement | null;
      if (el) schedule();
    };
    const onScroll = () => {
      if (!hasPointer) return;
      const hit = document.elementFromPoint(clientX, clientY);
      el = hit?.closest?.(TARGET) as HTMLElement | null;
      if (el) schedule();
    };
    const onLeave = () => {
      hasPointer = false;
      el = null;
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.documentElement.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("scroll", onScroll, true);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
