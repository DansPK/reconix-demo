"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AssistantProvider } from "@/components/assistant/assistant-provider";
import { AssistantStage } from "@/components/assistant/assistant-stage";
import type { AssistantInfo } from "@/components/assistant/types";
import { CardCursorLight } from "@/components/dashboard/card-cursor-light";
import { HydratedMark } from "@/components/dashboard/hydrated-mark";
import { Intro } from "@/components/dashboard/intro";
import { Sidebar } from "@/components/dashboard/sidebar";
import { leaveAssistant, openAssistant, parseView, showView, watchHistory, type View } from "@/components/dashboard/view-url";

export type { View };

/**
 * Local Assessment Viewer shell: sidebar + top bar around a content area that switches between
 * the Overview dashboard, Assessments, Findings (list + evidence), Reports and
 * Security knowledge (opened from the assistant's header), plus the AI Assistant,
 * which opens over the top bar and content (AssistantStage). The views are
 * server-rendered and passed in as props; all stay mounted and are toggled with `hidden` so the
 * globe keeps its WebGL context (it pauses itself when it can't be seen) and the intro's
 * one-shot reveal never leaves a remounted view's cards stuck hidden. The open view lives in the
 * address bar (`?view=`, see view-url.ts); `shown` is the view on screen, which trails the address
 * while the assistant animates in or out. While the assistant is shown, the Overview stays laid
 * out underneath as its backdrop (unseen and inert, data-assistant-backdrop in motion.css): its
 * globe is carried into the assistant, and closing grows straight back into it with its scroll
 * position kept. Security knowledge is mounted on its first visit (that reads the list) and then
 * only hidden. The assistant's conversation lives in AssistantProvider, above every view.
 */
export function Viewer({
  topBar,
  overview,
  assessments,
  findings,
  reports,
  knowledge,
  assistant,
}: {
  topBar: React.ReactNode;
  overview: React.ReactNode;
  assessments: React.ReactNode;
  findings: React.ReactNode;
  reports: React.ReactNode;
  /** The Security knowledge page. */
  knowledge: React.ReactNode;
  assistant: AssistantInfo;
}) {
  const view = parseView(useSearchParams().get("view"));
  const [shown, setShown] = useState<View>(view);
  const [knowledgeOpened, setKnowledgeOpened] = useState(view === "knowledge");
  if (view === "knowledge" && !knowledgeOpened) setKnowledgeOpened(true); // first visit: read the list
  const backdrop = shown === "assistant"; // the Overview under the open assistant

  useEffect(() => watchHistory(), []);

  // The sidebar: the assistant gets its own history entry; leaving it goes back that entry. It
  // reads the address, not this render's `view`, which can lag a quick click behind.
  const select = (target: View) => {
    const now = parseView(new URLSearchParams(window.location.search).get("view"));
    if (target === "assistant") openAssistant();
    else if (now === "assistant") leaveAssistant(target);
    else showView(target);
  };

  return (
    <AssistantProvider info={assistant}>
      <div className="dash-page">
        <HydratedMark />
        <CardCursorLight />
        <Intro />
        <div className="dash-frame" data-assistant-open={shown === "assistant" ? "" : undefined}>
          <Sidebar active={view} onSelect={select} />
          {topBar}
          {/* tabIndex -1: focusable by script and click, so the keys scroll it (no tab stop) */}
          <main className="dash-content" tabIndex={-1}>
            <div
              data-view-pane="overview"
              hidden={shown !== "overview" && !backdrop}
              data-assistant-backdrop={backdrop ? "" : undefined}
              inert={backdrop}
              className="h-full"
            >
              {overview}
            </div>
            <div data-view-pane="assessments" hidden={shown !== "assessments"}>{assessments}</div>
            <div data-view-pane="findings" hidden={shown !== "findings"}>{findings}</div>
            <div data-view-pane="reports" hidden={shown !== "reports"}>{reports}</div>
            <div data-view-pane="knowledge" hidden={shown !== "knowledge"}>{knowledgeOpened && knowledge}</div>
          </main>
          <AssistantStage view={view} shown={shown} setShown={setShown} />
        </div>
      </div>
    </AssistantProvider>
  );
}
