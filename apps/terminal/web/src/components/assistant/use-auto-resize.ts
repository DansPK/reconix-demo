"use client";

/* Grows a textarea with its text up to `maxLines`, then scrolls inside it. Done in JS because
   CSS field-sizing is Chrome-only. Runs when the value changes (typed, or set from the Ask bar)
   and when the box's width changes (the text wraps differently). */
import { useCallback, useEffect, useLayoutEffect } from "react";

export function useAutoResize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string, maxLines = 8) {
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 22;
    const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const max = Math.round(line * maxLines + pad);
    el.style.height = "auto";
    const height = Math.min(el.scrollHeight, max);
    el.style.height = `${height}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [ref, maxLines]);

  useLayoutEffect(fit, [fit, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const watch = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref, fit]);
}
