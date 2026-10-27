"use client";

import { useRef } from "react";
import Link from "next/link";
import { LineChart, Maximize2, Send, ShieldCheck, Sparkles, Target } from "lucide-react";
import { useAssistant } from "@/components/assistant/assistant-provider";
import type { OverviewCards } from "@/components/dashboard/derive";
import { TypedPlaceholder } from "@/components/dashboard/typed-placeholder";
import { openAssistant } from "@/components/dashboard/view-url";
import { DOCS } from "@/lib/docs-nav";

// Ask bar: the AI Assistant's entry, at the foot of the Overview's hero. A click anywhere on it
// opens the assistant (once: opening while it is open does nothing); its field edits the same
// draft as the assistant's composer, and Send asks the question and opens the assistant. The docs
// link keeps its own behaviour (data-keep). There is no microphone: the app has no voice input.
// The cycling typed placeholder lives in TypedPlaceholder (reduced motion shows the first
// question statically). It only fades during the assistant's transition (data-motion="fade").
const KEEP = "[data-keep]";

export function AskBar({ data }: { data: OverviewCards["ask"] }) {
  const { draft, setDraft, ask } = useAssistant();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim()) ask();
    openAssistant();
  };
  const openFrom = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest(KEEP)) openAssistant();
  };

  return (
    <div className="dash-card dash-glass dash-askbar flex cursor-pointer flex-col justify-center gap-1.5 py-2" data-motion="fade" onClick={openFrom}>
      <form onSubmit={submit} className="flex h-[44px] items-center gap-2.5 px-1">
        <Sparkles className="size-4 shrink-0 text-primary" strokeWidth={1.6} aria-hidden />
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={data.label}
            className="w-full bg-transparent text-sm text-foreground focus-visible:outline-none"
          />
          <TypedPlaceholder inputRef={inputRef} questions={data.questions} filled={draft.length > 0} />
        </div>
        <button
          type="button"
          onClick={openAssistant}
          aria-label="Open the AI Assistant"
          title="Open the AI Assistant"
          className="hidden size-[34px] shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid"
        >
          <Maximize2 className="size-[16px]" strokeWidth={1.6} aria-hidden />
        </button>
        <button
          type="submit"
          aria-label="Send"
          className="grid size-[34px] shrink-0 place-items-center rounded-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ background: "var(--primary-strong)", color: "var(--primary-foreground)" }}
        >
          <Send className="size-[16px]" strokeWidth={1.8} aria-hidden />
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 font-mono text-[10px] text-muted-foreground">
        <span className="dash-chip h-[26px]">
          <ShieldCheck className={data.scope.ok ? "size-3 text-success" : "size-3 text-warning"} aria-hidden />
          {data.scope.text}
        </span>
        <span className="dash-chip h-[26px]">
          <Target className="size-3 text-primary" aria-hidden /> {data.reach}
        </span>
        <Link
          href={DOCS.llmData}
          data-keep
          className="dash-chip ml-auto h-[26px] rounded-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LineChart className="size-3" aria-hidden /> AI analysis
        </Link>
      </div>
    </div>
  );
}
