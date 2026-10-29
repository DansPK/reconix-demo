"use client";

/* The top bar's chips while the Overview totals every saved run: how many runs each target,
   template and status has. */
import Link from "next/link";
import { CHIP, ChipTrigger } from "@/components/dashboard/assessment-switcher";
import { TEMPLATES } from "@/components/dashboard/derive";
import type { CountRow, Overall } from "@/components/dashboard/derive-overall";
import { Popover } from "@/components/dashboard/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Status } from "@/lib/data/view-types";
import { RUN_STATUS } from "@/lib/status";
import { DOCS } from "@/lib/docs-nav";


const many = (rows: CountRow[], noun: string) => (rows.length === 1 ? rows[0].name : `${rows.length} ${noun}`);

/** A chip whose panel lists values with how many runs have each. */
function CountsChip({
  label,
  value,
  heading,
  rows,
  align = "start",
  children,
  statuses = false,
}: {
  label: string;
  value: string;
  heading: string;
  rows: CountRow[];
  align?: "start" | "end";
  children?: React.ReactNode;
  statuses?: boolean; // the rows are run statuses: show each as its badge
}) {
  return (
    <Popover triggerClassName={CHIP} triggerAriaLabel={label} align={align} panelClassName="w-[260px] space-y-2.5 p-3 text-xs" triggerContent={<ChipTrigger label={label} value={value} />}>
      <p className="text-muted-foreground">{heading}</p>
      <ul className="max-h-[220px] space-y-1 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3">
            {statuses && r.name in RUN_STATUS ? (
              <StatusBadge meaning={RUN_STATUS[r.name as Status]} />
            ) : (
              <span className={r.count ? "truncate font-mono text-[11px] text-foreground" : "truncate font-mono text-[11px] text-muted-foreground"}>{r.name}</span>
            )}
            <span className="tabnums shrink-0 text-muted-foreground">{r.count}</span>
          </li>
        ))}
      </ul>
      {children}
    </Popover>
  );
}

/** The slice of the every-run Overview the chips show (top-bar.tsx picks it on the server). */
export type OverallChipsData = Pick<Overall, "runs" | "completed" | "waiting" | "targets" | "templates" | "statuses">;

export function OverallChips({ overall }: { overall: OverallChipsData }) {
  const { runs, completed, waiting } = overall;
  const known = new Set<string>(TEMPLATES);
  const templates = [
    ...TEMPLATES.map((name) => ({ name, count: overall.templates.find((t) => t.name === name)?.count ?? 0 })),
    ...overall.templates.filter((t) => !known.has(t.name)),
  ];
  const done = Math.round((completed / runs) * 100);
  return (
    <>
      <CountsChip label="Target" value={many(overall.targets, "targets")} heading="Runs per target" rows={overall.targets} />
      <div className="hidden min-[1440px]:block">
        <CountsChip label="Template" value={many(overall.templates, "templates")} heading="Runs per template" rows={templates}>
        <Link href={DOCS.request} className="ui-link inline-block">
          About templates
        </Link>
      </CountsChip>
      </div>
      <CountsChip
        label="Status"
        value={waiting ? `${waiting} waiting` : `${completed}/${runs} done`}
        heading="Runs per status"
        rows={overall.statuses}
        align="end"
        statuses
      >
        <div className="border-t border-border pt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-muted-foreground">Completed</span>
            <span className="tabnums text-foreground">{done}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${done}%` }} />
          </div>
        </div>
      </CountsChip>
    </>
  );
}
