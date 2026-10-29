"use client";

import { useEffect, useRef } from "react";
import { mountDotField } from "@/lib/dot-field";

/**
 * Cursor-reactive dot grid, the `dots` backdrop of SectionShell. Thin wrapper
 * around `mountDotField` (see src/lib/dot-field.ts); static under reduced motion.
 */
export function DotField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const field = mountDotField(ref.current);
    return () => field.destroy();
  }, []);

  return <canvas ref={ref} aria-hidden className={`absolute inset-0 block h-full w-full ${className}`} />;
}
