"use client";

/* Where a card's links go. A finding or the Reports of the run the dashboard already shows
   open in place (the address changes, nothing reloads); another run's open through a normal
   link to that run. Every address is built here from a checked run uid (protocol.ts), never
   taken from the card's text. */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { showView, type View, type ViewParams } from "@/components/dashboard/view-url";
import { RUN_UID } from "@/lib/assistant/protocol";
import { useAssistant } from "../assistant-provider";

function runHref(uid: string, view: View, params: ViewParams = {}): string {
  const query = new URLSearchParams({ uid, view });
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/?${query.toString()}`;
}

/** A link into another dashboard view about run `uid`, opened in place when the dashboard
    shows that run (or every run, where `allParams` applies). */
export function ViewLinkOut({
  uid,
  view,
  params,
  allParams,
  children,
  label,
  className,
}: {
  uid: string;
  view: View;
  params?: ViewParams; // with the run open
  allParams?: ViewParams; // with every run open (null: open the run instead)
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  const { info } = useAssistant();
  if (!RUN_UID.test(uid)) return null;
  // in place: the dashboard shows this run (its own params, or none), or every run and the view
  // can show this one there (allParams)
  const here = info.scope.uid === uid ? (params ?? {}) : info.scope.uid === null && allParams ? allParams : null;
  return (
    <Link
      href={runHref(uid, view, params)}
      aria-label={label}
      title={label}
      className={cn("ai-link", className)}
      onClick={(e) => {
        if (!here || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        showView(view, here);
      }}
    >
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** "Open in Findings" for one finding. */
export function FindingLink({ uid, id, children, className }: { uid: string; id: string; children?: React.ReactNode; className?: string }) {
  return (
    <ViewLinkOut uid={uid} view="findings" params={{ finding: id }} allParams={{ finding: `${uid}~${id}` }} label={`Open ${id} in Findings`} className={className}>
      {children ?? "Open in Findings"}
    </ViewLinkOut>
  );
}
