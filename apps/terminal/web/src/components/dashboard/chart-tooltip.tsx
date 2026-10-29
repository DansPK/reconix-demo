"use client";

/* The charts' tooltip: shown while a mark is hovered or focused, above it (below when there is
   no room), kept on screen. It repeats the mark's accessible name for sighted users, so it is
   hidden from screen readers. Fixed to the viewport, so no card or scroller clips it: when
   anything scrolls or the window resizes it follows its mark (focusing a mark may scroll it into
   view), and it hides on Esc or once the mark is gone. */
import { useCallback, useEffect, useRef, useState } from "react";

export interface Tip {
  x: number;
  y: number;
  below: boolean;
  title: string;
  lines: string[];
}

const EDGE = 150; // keep the tooltip's centre this far from the window's sides
const ROOM = 96; // flip below the mark when there is less room than this above it

function place(el: Element, title: string, lines: string[]): Tip {
  const r = el.getBoundingClientRect();
  const below = r.top < ROOM;
  const x = Math.min(Math.max(r.left + r.width / 2, EDGE), window.innerWidth - EDGE);
  return { x, y: below ? r.bottom : r.top, below, title, lines };
}

export function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const anchor = useRef<Element | null>(null);
  const show = useCallback((el: Element, title: string, lines: string[] = []) => {
    anchor.current = el;
    setTip(place(el, title, lines));
  }, []);
  const hide = useCallback(() => {
    anchor.current = null;
    setTip(null);
  }, []);
  const shown = tip !== null;
  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = anchor.current;
        if (!el || !el.isConnected) return hide();
        setTip((t) => (t ? place(el, t.title, t.lines) : t));
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
      window.removeEventListener("keydown", onKey);
    };
  }, [shown, hide]);
  return { tip, show, hide };
}

export function ChartTooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div aria-hidden className="dash-tooltip" data-below={tip.below ? "" : undefined} style={{ left: tip.x, top: tip.y }}>
      <p className="font-medium text-foreground">{tip.title}</p>
      {tip.lines.map((line, i) => (
        <p key={i} className="text-muted-foreground [overflow-wrap:anywhere]">
          {line}
        </p>
      ))}
    </div>
  );
}
