"use client";

/* Keeps the model picker inside the assistant's surface: it opens upward from the composer, so
   its height is capped to the room between its bottom and the assistant's header (or the top of
   the window); its own body scrolls, and its title and buttons stay in view on a phone.
   Measured while it is open, again when `key` changes (another step) and on resize. */
import { useLayoutEffect } from "react";

const MARGIN = 12;
const MIN = 200;
const MAX = 560;

/** The height that fits `el` between the assistant's header and its own bottom. */
function roomAbove(el: HTMLElement): number {
  const bottom = el.getBoundingClientRect().bottom;
  const view = el.closest(".ai-view");
  const top = view?.querySelector(".ai-header")?.getBoundingClientRect().bottom ?? view?.getBoundingClientRect().top ?? 0;
  return Math.round(Math.min(MAX, Math.max(MIN, bottom - Math.max(0, top) - MARGIN)));
}

export function useFitAbove(panel: React.RefObject<HTMLElement | null>, key: unknown) {
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const fit = () => el.style.setProperty("max-height", `${roomAbove(el)}px`);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [panel, key]);
}
