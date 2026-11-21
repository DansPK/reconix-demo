"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AssistantProvider } from "@/components/assistant/assistant-provider";
import { AssistantStage } from "@/components/assistant/assistant-stage";
import type { AssistantInfo } from "@/components/assistant/types";
import { holdGlobe } from "@/components/assistant/use-globe";
import { CardCursorLight } from "@/components/dashboard/card-cursor-light";
import { HydratedMark } from "@/components/dashboard/hydrated-mark";
import { Intro } from "@/components/dashboard/intro";
import { Sidebar } from "@/components/dashboard/sidebar";
import {
  leaveAssistant,
  openAssistant,
  registerViewNavigator,
  resolveView,
  runIdFromPath,
  showView,
  useCurrentView,
  watchHistory,
  type View,
} from "@/components/dashboard/view-url";

export type { View };

/**
 * Local Assessment Viewer shell: sidebar + top bar around a content area that switches between
 * the Overview dashboard, Assessments, Findings (list + evidence), Reports and
 * Security knowledge (opened from the assistant's header), plus the AI Assistant,
 * which opens over the top bar and content (AssistantStage). The views are
 * server-rendered and passed in as props; all stay mounted and are toggled with `hidden` so the
 * globe keeps its WebGL context (it pauses itself when it can't be seen) and the intro's
 * one-shot reveal never leaves a remounted view's cards stuck hidden. `notice` sits above them
 * all, so it is read on whichever view the address opens. The open view lives in the
 * address bar (`?view=`, see view-url.ts); `shown` is the view on screen, which trails the address
 * while the assistant animates in or out. While the assistant is shown, the Overview stays laid
 * out underneath as its backdrop (unseen and inert, data-assistant-backdrop in motion.css): its
 * globe is carried into the assistant, and closing grows straight back into it with its scroll
 * position kept. Security knowledge is mounted on its first visit (that reads the list) and then
 * only hidden. The assistant's conversation lives in AssistantProvider, above every view.
 */
export function Viewer({
  topBar,
  notice,
  overview,
  assessments,
  findings,
  reports,
  knowledge,
  assistant,
}: {
  topBar: React.ReactNode;
  /** A line above whichever view is open (an address naming a run this folder doesn't hold). */
  notice?: React.ReactNode;
  overview: React.ReactNode;
  assessments: React.ReactNode;
  findings: React.ReactNode;
  reports: React.ReactNode;
  /** The Security knowledge page. */
  knowledge: React.ReactNode;
  assistant: AssistantInfo;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const view = useCurrentView();
  const [shown, setShown] = useState<View>(view);
  const prevShownRef = useRef<View>(shown);
  const [knowledgeOpened, setKnowledgeOpened] = useState(view === "knowledge");
  if (view === "knowledge" && !knowledgeOpened) setKnowledgeOpened(true); // first visit: read the list
  const backdrop = shown === "assistant"; // the Overview under the open assistant

  useEffect(() => watchHistory(), []);
  useEffect(() => {
    registerViewNavigator((href, mode) => {
      if (mode === "replace") router.replace(href);
      else router.push(href);
    });
    return () => registerViewNavigator(null);
  }, [router]);
  useEffect(() => {
    const prev = prevShownRef.current;
    prevShownRef.current = shown;
    const el = overviewRef.current;
    if (!el) return;
    if (shown === "overview" && prev !== "overview" && prev !== "assistant") {
      el.setAttribute("data-reenter", "");
      const id = window.setTimeout(() => el.removeAttribute("data-reenter"), 460);
      return () => window.clearTimeout(id);
    }
    el.removeAttribute("data-reenter");
  }, [shown]);
  useEffect(() => {
    const bar = frameRef.current?.querySelector<HTMLElement>(".dash-topbar");
    if (bar) bar.inert = backdrop;
  }, [backdrop, shown]);
  useEffect(() => {
    holdGlobe("view", shown !== "overview" && !backdrop);
    return () => holdGlobe("view", false);
  }, [shown, backdrop]);

  // The sidebar: opening/leaving the assistant uses in-place history state so AssistantStage
  // stays mounted and plays its GSAP hero/globe transition; other view switches route via SSR.
  const select = (target: View) => {
    const params = new URLSearchParams(window.location.search);
    const now = resolveView(window.location.pathname, params.get("view"));
    const hasRun = Boolean(runIdFromPath(window.location.pathname) || params.has("uid") || params.has("assessment"));
    if (target === "assistant") openAssistant();
    else if (now === "assistant") leaveAssistant(target);
    else if (target === "assessments" && hasRun) router.replace("/assessments");
    else showView(target);
  };

  return (
    <AssistantProvider info={assistant}>
      <div className="dash-page">
        <HydratedMark />
        <CardCursorLight />
        <Intro />
        <div ref={frameRef} className="dash-frame" data-assistant-open={shown === "assistant" ? "" : undefined} data-no-bar={shown === "knowledge" ? "" : undefined}>
          <Sidebar active={view} onSelect={select} />
          {shown !== "knowledge" && topBar /* the filters choose runs; Security knowledge has none */}
          {/* tabIndex -1: focusable by script and click, so the keys scroll it (no tab stop) */}
          {/* under the open assistant it holds only the inert backdrop, so it stops scrolling:
              a scroller nothing inside can be focused is a WCAG 2.2 failure (QAL-002) */}
          <main className="dash-content" tabIndex={-1} data-under-assistant={backdrop ? "" : undefined}>
            {notice}
            <div
              ref={overviewRef}
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
