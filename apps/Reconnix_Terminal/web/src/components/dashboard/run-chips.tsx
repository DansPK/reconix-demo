"use client";

/* The top bar's chips for one open run: its Target (scope in and out), Template and Status
   (progress, phases, budget). A client component, so it gets only what it shows (RunChipsData,
   picked on the server in top-bar.tsx), never the whole Dashboard. */
import Link from "next/link";
import { Check, X } from "lucide-react";
import { CHIP, ChipTrigger, Row } from "@/components/dashboard/assessment-switcher";
import { TEMPLATES, type Dashboard } from "@/components/dashboard/derive";
import { Popover } from "@/components/dashboard/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import { RUN_STATUS, STEP_STATUS } from "@/lib/status";
import { DOCS } from "@/lib/docs-nav";


export interface RunChipsData {
  assessment: Pick<Dashboard["assessment"], "target" | "template" | "status" | "progress">;
  scope: { include: string[]; exclude: string[] } | null;
  phases: Dashboard["phases"];
  requests: number;
  minutes: Dashboard["minutes"];
}

export function RunChips({ dash }: { dash: RunChipsData }) {
  const a = dash.assessment;
  return (
    <>
      <Popover triggerClassName={CHIP} triggerAriaLabel="Target details" align="start" panelClassName="w-[260px] space-y-2.5 p-3 text-xs" triggerContent={<ChipTrigger label="Target" value={a.target} />}>
        {dash.scope ? (
          <>
            <div>
              <p className="mb-1 text-muted-foreground">In scope</p>
              <ul className="space-y-1">
                {dash.scope.include.map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                    <span className="truncate font-mono text-[11px] text-foreground">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            {dash.scope.exclude.length > 0 && (
              <div>
                <p className="mb-1 text-muted-foreground">Excluded</p>
                <ul className="space-y-1">
                  {dash.scope.exclude.map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <X className="size-3.5 shrink-0 text-danger" aria-hidden />
                      <span className="truncate font-mono text-[11px] text-foreground">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No Scope Manifest yet.</p>
        )}
      </Popover>

      <div className="hidden min-[1440px]:block">
        <Popover triggerClassName={CHIP} triggerAriaLabel="Template" align="start" panelClassName="w-[220px] space-y-2 p-3 text-xs" triggerContent={<ChipTrigger label="Template" value={a.template} />}>
        <ul className="space-y-1">
          {TEMPLATES.map((t) => {
            const on = t === a.template;
            return (
              <li key={t} className="flex items-center justify-between gap-2">
                <span className={on ? "text-foreground" : "text-muted-foreground"}>{t}</span>
                {on && <Check className="size-3.5 text-primary" aria-hidden />}
              </li>
            );
          })}
        </ul>
        <Link href={DOCS.request} className="ui-link inline-block">
          About templates
        </Link>
      </Popover>
      </div>

      <Popover triggerClassName={CHIP} triggerAriaLabel="Status" align="end" panelClassName="w-[300px] space-y-3 p-3 text-xs" triggerContent={<ChipTrigger label="Status" value={RUN_STATUS[a.status].label} />}>
        <StatusBadge meaning={RUN_STATUS[a.status]} />
        <p className="text-muted-foreground">{RUN_STATUS[a.status].hint}</p>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-muted-foreground">Progress</span>
            <span className="tabnums text-foreground">{a.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${a.progress}%` }} />
          </div>
        </div>
        {dash.phases.length > 0 && (
          <ul className="space-y-1">
            {dash.phases.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span className={p.status === "pending" ? "min-w-0 flex-1 truncate text-muted-foreground" : "min-w-0 flex-1 truncate text-foreground"}>{p.label}</span>
                <StatusBadge meaning={STEP_STATUS[p.status]} />
                <span className="tabnums w-9 shrink-0 text-right text-muted-foreground">{p.pct}%</span>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-1 border-t border-border pt-2">
          <Row k="Requests sent" v={String(dash.requests)} />
          <Row k="Minutes" v={dash.minutes.max !== null ? `${dash.minutes.used} / ${dash.minutes.max}` : String(dash.minutes.used)} />
        </div>
      </Popover>
    </>
  );
}
