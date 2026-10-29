"use client";

import { useEffect, useRef } from "react";
import { mountNodeGraph } from "@/lib/node-graph";

export type GraphControls = {
  setFocus: (id: string | null) => void;
  setView: (v: { x?: number; y?: number; zoom?: number }) => void;
  pause: () => void;
  resume: () => void;
  destroy: () => void;
};
type Controls = GraphControls;

/**
 * Canvas drawing of Reconix's components and tools. `focus` lights one hub.
 * The draw loop only runs while the canvas is within 200px of the viewport.
 */
export function NodeGraph({ focus = null, className = "", onReady }: { focus?: string | null; className?: string; onReady?: (c: GraphControls) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<Controls | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ctrl.current = mountNodeGraph(ref.current, { focus }) as Controls;
    onReady?.(ctrl.current);
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? ctrl.current?.resume() : ctrl.current?.pause()),
      { rootMargin: "200px" }
    );
    io.observe(ref.current);
    return () => {
      io.disconnect();
      ctrl.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { ctrl.current?.setFocus(focus); }, [focus]);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
