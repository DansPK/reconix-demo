"use client";

import { useEffect, useState } from "react";

/**
 * Types `lines` out one character at a time with a blinking cursor.
 * The whole text is always in the layout: the part not typed yet is merely
 * transparent, so the paragraph never changes size while it types (no layout
 * shift). The server renders it complete, so the page reads without JavaScript.
 */
export function TypedLine({ lines, className = "" }: { lines: string[]; className?: string }) {
  const full = lines.join("\n");
  const [count, setCount] = useState(full.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    // the first tick hides the server-rendered text, then it types back in
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= full.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [full]);

  return (
    <p className={`whitespace-pre-line ${className}`}>
      <span className="sr-only">{full}</span>
      <span aria-hidden>{full.slice(0, count)}</span>
      {/* zero-width slot so the cursor never pushes the text around */}
      <span aria-hidden className="relative inline-block h-[1em] w-0 align-[-0.15em]">
        <span className="cursor absolute inset-y-0 left-0.5 w-[2px] bg-primary" />
      </span>
      <span aria-hidden className="text-transparent">{full.slice(count)}</span>
    </p>
  );
}
