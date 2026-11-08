"use client";

/* One thinking block of the Run log: the steps between two messages folded to a title line, the
   way Claude folds its thinking. Folded, a block that is still going shows its newest step under
   the title; the button opens it to list every step (time · who · text). The open state is kept
   per block (its key never changes), so a live refresh redraws it without closing it. */
import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";

import type { RunLogBlock } from "@/components/dashboard/derive-run-log";

// a block's glyph by state; a running block spins instead (.dash-think-spin)
const GLYPH: Record<Exclude<RunLogBlock["state"], "running">, string> = { done: "✓", paused: "⏸", stopped: "✕" };

export function ThinkingBlock({ block }: { block: RunLogBlock }) {
  const [open, setOpen] = useState(false);
  const steps = useId();
  const going = block.state !== "done";

  return (
    <li className="dash-think" data-state={block.state}>
      <button type="button" className="dash-think-title" aria-expanded={open} aria-controls={steps} onClick={() => setOpen((o) => !o)}>
        {block.state === "running" ? (
          <span className="dash-think-spin" aria-hidden />
        ) : (
          <span className="dash-think-glyph" aria-hidden>
            {GLYPH[block.state]}
          </span>
        )}
        <span className="dash-think-name">{block.title}</span>
        <span className="text-muted-foreground">· {block.detail}</span>
        {block.blocked > 0 && <span className="dash-think-blocked">· {block.blocked} blocked</span>}
        <ChevronRight className="dash-think-chevron size-3.5 shrink-0" aria-hidden />
      </button>
      {!open && going && (
        <p className="dash-think-latest" aria-live={block.state === "running" ? "polite" : undefined}>
          <span aria-hidden>└ </span>
          {block.latest}
        </p>
      )}
      <ol id={steps} hidden={!open} aria-label={`${block.title} · ${block.detail}`} className="dash-think-steps">
        {block.steps.map((s) => (
          <li key={s.key} className="dash-think-step" data-tone={s.tone}>
            <span className="font-mono tabnums text-muted-foreground">{s.time}</span>
            <span className="dash-think-who">{s.who}</span>
            <span className="dash-think-text">{s.text}</span>
          </li>
        ))}
      </ol>
    </li>
  );
}
