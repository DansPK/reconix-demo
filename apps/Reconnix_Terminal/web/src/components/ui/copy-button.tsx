"use client";

/* Copy text to the clipboard, with "Copied" (or why not) for a moment after. The text is read
   when pressed, so a reply still streaming copies what is there then. The label is static (read
   by screen readers) and the state is the one live region, so a press is announced once; the
   button's name follows the state ("Copy code Copied"). */
import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CopyButton({ text, label, className }: { text: string | (() => string); label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1_800);
  };

  const Icon = state === "copied" ? Check : state === "failed" ? X : Copy;
  const shown = state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy";
  return (
    <Button variant="quiet" size="xs" onClick={copy} title={label} className={className}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label} </span>
      <span aria-live="polite">{shown}</span>
    </Button>
  );
}
