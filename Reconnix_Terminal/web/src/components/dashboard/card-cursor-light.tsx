"use client";

import { useEffect } from "react";

/**
 * Mounts once. Moves the soft light on whichever .dash-card the pointer is over by writing
 * --mx/--my (read by .dash-card::before). One document listener, rAF-throttled, no layout work
 * beyond a single getBoundingClientRect per move. Off on coarse pointers.
 */
export function CardCursorLight() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let raf = 0;
    let el: HTMLElement | null = null;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      if (el) {
        el.style.setProperty("--mx", `${x}px`);
        el.style.setProperty("--my", `${y}px`);
      }
    };
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element)?.closest?.(".dash-card") as HTMLElement | null;
      el = card;
      if (!card) return;
      const r = card.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
