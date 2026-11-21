/* Skeleton loading views built with the exact same CSS layout classes as each real page
   (.dash-overview, .dash-summary, .dash-card, .dash-sheet, .dash-panels, .ui-split, etc.)
   so transitions match each page's geometry with zero layout shift. */
import type { ReactNode } from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import type { View } from "@/components/dashboard/view-name";
import { cn } from "@/lib/utils";

function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted/70", className)} />;
}

export function DashboardSkeletonFrame({
  active = null,
  noBar = false,
  label,
  children,
}: {
  active?: View | null;
  noBar?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="dash-page" data-skeleton="">
      <div className="dash-frame" data-no-bar={noBar ? "" : undefined}>
        <Sidebar active={active} />
        {!noBar && (
          <header className="dash-topbar relative z-30 flex min-w-0 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4" aria-busy="true">
            <Bone className="h-5 w-24 shrink-0" />
            <span className="hidden h-4 w-px shrink-0 bg-border md:block" aria-hidden />
            <Bone className="hidden h-3.5 w-14 shrink-0 md:block" />
            <div className="flex min-w-0 items-center gap-2 xl:ml-auto">
              <Bone className="h-[34px] w-40 rounded-[10px]" />
              <div className="hidden min-w-0 items-center gap-2 xl:flex">
                <Bone className="h-[34px] w-32 rounded-[10px]" />
                <Bone className="h-[34px] w-28 rounded-[10px]" />
                <Bone className="h-[34px] w-24 rounded-[10px]" />
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-3">
              <Bone className="h-[34px] w-28 rounded-[10px]" />
            </div>
          </header>
        )}
        <main className="dash-content" aria-busy="true">
          <div role="status" className="h-full">
            <span className="sr-only">{label}</span>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Matches OverviewView (.dash-overview: summary strip, hero, right Findings card spanning rows, 2 bottom timelines). */
export function OverviewSkeleton() {
  return (
    <div className="dash-overview">
      <div className="dash-summary">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dash-card dash-stat">
            <Bone className="h-3 w-20" />
            <Bone className="mt-1.5 h-7 w-16" />
            <Bone className="mt-auto h-3 w-32" />
          </div>
        ))}
      </div>

      <section className="dash-hero">
        <div className="dash-globe-wrap flex items-center justify-center" aria-hidden>
          <div className="dash-globe-glow" />
          <Bone className="size-56 rounded-full opacity-35 sm:size-72" />
        </div>
        <div className="dash-hero-title">
          <Bone className="h-7 w-72 max-w-full" />
          <Bone className="mt-2 h-3.5 w-60 max-w-full" />
        </div>
        <div className="dash-card dash-glass dash-askbar flex flex-col justify-center gap-2 py-2.5">
          <div className="flex h-[40px] items-center gap-2.5 px-1">
            <Bone className="size-4 shrink-0 rounded-full" />
            <Bone className="h-4 flex-1" />
            <Bone className="size-[34px] shrink-0 rounded-lg" />
          </div>
          <div className="flex items-center gap-2 px-1">
            <Bone className="h-[22px] w-28 rounded-full" />
            <Bone className="h-[22px] w-24 rounded-full" />
            <Bone className="ml-auto h-[22px] w-20 rounded-full" />
          </div>
        </div>
      </section>

      <div className="dash-right">
        <div className="dash-card dash-panel flex flex-1 flex-col gap-4">
          <Bone className="h-4 w-36" />
          <div className="mt-2 flex flex-col gap-3.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone className="h-3 w-16 shrink-0" />
                <Bone className="h-2.5 flex-1 rounded-full" />
                <Bone className="h-3 w-8 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-bottom">
        {[0, 1].map((i) => (
          <div key={i} className="dash-card dash-panel flex flex-col gap-3">
            <Bone className="h-4 w-36" />
            <div className="mt-2 space-y-2.5">
              <Bone className="h-3.5 w-full" />
              <Bone className="h-3.5 w-5/6" />
              <Bone className="h-3.5 w-3/4" />
              <Bone className="h-3.5 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches AssessmentsView (.dash-view.dash-sheet: header, filter bar, assessments table). */
export function AssessmentsSkeleton() {
  return (
    <div className="dash-view dash-sheet" role="status" aria-busy="true">
      <span className="sr-only">Reading assessments from the Core API…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-6 w-36" />
          <Bone className="h-3.5 w-80 max-w-full" />
        </div>
        <Bone className="h-7 w-24 rounded-md" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Bone className="h-9 w-64 rounded-lg" />
        <Bone className="h-7 w-20 rounded-full" />
        <Bone className="h-7 w-24 rounded-full" />
        <Bone className="h-7 w-20 rounded-full" />
      </div>
      <div className="dash-card overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <Bone className="h-3 w-full max-w-3xl" />
        </div>
        <div className="divide-y divide-border">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="grid grid-cols-4 items-center gap-4 px-4 py-3.5">
              <Bone className="h-4 w-32" />
              <Bone className="h-4 w-44" />
              <Bone className="h-5 w-20 rounded-full" />
              <Bone className="h-4 w-24 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Matches FindingsView (.dash-view.dash-findings + .ui-split: 260-360px list left, detail card right). */
export function FindingsSkeleton() {
  return (
    <div className="dash-view dash-findings gap-3" role="status" aria-busy="true">
      <span className="sr-only">Reading findings from the Core API…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-6 w-28" />
          <Bone className="h-3.5 w-72 max-w-full" />
        </div>
        <Bone className="h-7 w-24 rounded-md" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Bone className="h-9 w-60 rounded-lg" />
        <Bone className="h-7 w-16 rounded-full" />
        <Bone className="h-7 w-16 rounded-full" />
        <Bone className="h-7 w-20 rounded-full" />
      </div>
      <div className="ui-split">
        <div className="ui-split-list flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="dash-card p-3">
              <div className="flex items-center justify-between gap-2">
                <Bone className="h-4 w-16 rounded-full" />
                <Bone className="h-3 w-14" />
              </div>
              <Bone className="mt-2 h-4 w-5/6" />
              <Bone className="mt-1.5 h-3 w-2/3" />
            </div>
          ))}
        </div>
        <div className="ui-split-detail">
          <div className="dash-card flex flex-col gap-4">
            <Bone className="h-5 w-2/3" />
            <div className="flex gap-2">
              <Bone className="h-5 w-16 rounded-full" />
              <Bone className="h-5 w-24 rounded-full" />
              <Bone className="h-5 w-20 rounded-full" />
            </div>
            <div className="space-y-2.5">
              <Bone className="h-3.5 w-full" />
              <Bone className="h-3.5 w-11/12" />
              <Bone className="h-3.5 w-4/5" />
            </div>
            <Bone className="h-36 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Matches /reports (all assessments table: .dash-view.dash-sheet + .dash-panels > .dash-card.is-wide). */
export function ReportsListSkeleton() {
  return (
    <div className="dash-view dash-sheet" role="status" aria-busy="true">
      <span className="sr-only">Reading reports from the Core API…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-6 w-28" />
          <Bone className="h-3.5 w-80 max-w-full" />
        </div>
        <Bone className="h-7 w-28 rounded-md" />
      </div>
      <div className="dash-panels">
        <div className="dash-card is-wide overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <Bone className="h-4 w-32" />
          </div>
          <div className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grid grid-cols-4 items-center gap-4 px-4 py-3.5">
                <Bone className="h-4 w-36" />
                <Bone className="h-4 w-20" />
                <Bone className="h-4 w-44" />
                <Bone className="h-4 w-10 justify-self-end" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Matches /reports/[id] (single report: header + Export, .dash-summary 4 stats, .dash-panels 2 cards + wide findings table). */
export function ReportsSkeleton() {
  return (
    <div className="dash-view dash-sheet" role="status" aria-busy="true">
      <span className="sr-only">Reading reports from the Core API…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-6 w-40" />
          <Bone className="h-3.5 w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Bone className="h-8 w-20 rounded-lg" />
          <Bone className="h-7 w-24 rounded-md" />
        </div>
      </div>
      <div className="dash-summary">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dash-card dash-stat">
            <Bone className="h-3 w-20" />
            <Bone className="mt-1.5 h-7 w-14" />
            <Bone className="mt-auto h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="dash-panels">
        {[0, 1].map((i) => (
          <div key={i} className="dash-card dash-panel flex flex-col gap-3">
            <Bone className="h-4 w-36" />
            <div className="mt-2 space-y-2.5">
              <Bone className="h-3.5 w-full" />
              <Bone className="h-3.5 w-5/6" />
              <Bone className="h-3.5 w-2/3" />
            </div>
          </div>
        ))}
        <div className="dash-card is-wide flex flex-col gap-3">
          <Bone className="h-4 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <Bone key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Matches AssistantView inside the stage (header bar, centered welcome, bottom composer). */
export function AssistantSkeleton() {
  return (
    <div className="dash-view flex h-full min-h-[420px] flex-col justify-between gap-6">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <Bone className="h-5 w-36" />
        <div className="flex items-center gap-2">
          <Bone className="h-8 w-28 rounded-lg" />
          <Bone className="h-8 w-24 rounded-lg" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-8">
        <Bone className="size-16 rounded-full" />
        <Bone className="h-6 w-64" />
        <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          <Bone className="h-12 rounded-xl" />
          <Bone className="h-12 rounded-xl" />
        </div>
      </div>
      <Bone className="mx-auto h-14 w-full max-w-2xl rounded-2xl" />
    </div>
  );
}

/** Just the knowledge stage body (used inside KnowledgeView when its ViewHeader is already rendered). */
export function KnowledgeStageSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" role="status" aria-busy="true">
      <span className="sr-only">Loading the knowledge graph…</span>
      <div className="dash-card space-y-2.5 lg:col-span-4">
        <Bone className="h-9 w-full rounded-lg" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
      <div className="dash-card flex min-h-[380px] items-center justify-center lg:col-span-8">
        <Bone className="size-48 rounded-full" />
      </div>
    </div>
  );
}

/** Full /knowledge route skeleton (header + stage). */
export function KnowledgeSkeleton() {
  return (
    <div className="dash-view dash-sheet">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-6 w-44" />
          <Bone className="h-3.5 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-8 w-24 rounded-lg" />
          <Bone className="h-8 w-24 rounded-lg" />
        </div>
      </div>
      <KnowledgeStageSkeleton />
    </div>
  );
}
