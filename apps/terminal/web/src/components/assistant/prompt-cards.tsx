"use client";

/* The welcome screen's suggestions as cards: each names real numbers from the data in scope
   (lib/assistant/prompts.ts). Picking one asks it. When asking isn't possible here (a viewer,
   no model) they are disabled, with the reason as their tooltip. */
import { ArrowUpRight, Bug, Compass, FileText, Hand, ListChecks, ShieldAlert, type LucideIcon } from "lucide-react";
import type { PromptKind, WelcomePrompt } from "@/lib/assistant/prompts";

const ICONS: Record<PromptKind, LucideIcon> = {
  findings: Bug,
  top: ShieldAlert,
  progress: ListChecks,
  approvals: Hand,
  report: FileText,
  plan: Compass,
};

export function PromptCards({ prompts, onPick, disabled }: { prompts: WelcomePrompt[]; onPick: (p: WelcomePrompt) => void; disabled: string | null }) {
  if (!prompts.length) return null;
  return (
    <ul className="ai-prompts" aria-label="Suggested questions">
      {prompts.map((p, i) => {
        const Icon = ICONS[p.kind];
        return (
          <li key={p.kind} className="ac-list-item" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
            <button type="button" className="ai-prompt ac-prompt-card" onClick={() => onPick(p)} disabled={disabled !== null} title={disabled ?? p.question}>
              <span className="ai-prompt-icon" aria-hidden>
                <Icon className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="ai-prompt-title block">{p.title}</span>
                <span className="ai-prompt-detail">{p.detail}</span>
              </span>
              <ArrowUpRight className="ai-prompt-arrow size-3.5 shrink-0" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
