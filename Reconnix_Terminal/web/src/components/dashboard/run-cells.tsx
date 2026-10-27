/* One saved run as a row of cells, shared by the Assessments view (assessments-rows.tsx: the
   whole row is a link to the run's Overview) and the Report view's runs table (report-runs.tsx:
   a table row with a checkbox before and the downloads after). The five cells are the same in
   both: ID · template with when, the target, the status badge with what the run waits on, the
   findings with the worst severity, and plan steps done of total. The caller supplies the cell
   element (`Cell`: a <span> on the link, a <th>/<td> in the table), what wraps the run's name
   (`name`: a link to its report, or nothing) and the slots before and after the five. */
import type { ComponentType, ReactNode } from "react";

import type { ReportRunRow } from "@/components/dashboard/report-types";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";
import { RUN_STATUS } from "@/lib/status";

/** The columns in order, with the header each gets. */
export const RUN_COLUMNS = [
  { key: "run", label: "Run" },
  { key: "target", label: "Target" },
  { key: "status", label: "Status" },
  { key: "findings", label: "Findings" },
  { key: "plan", label: "Plan" },
] as const;
export type RunColumn = (typeof RUN_COLUMNS)[number]["key"];

/** The one search over saved runs: its accessible name and placeholder. */
export const RUN_SEARCH = { label: "Search saved assessments", placeholder: "ID, template, target, status…" } as const;

/** A run named for an accessible name: "RCX-DEMO-001 (Web URL, 9 Oct 15:33)". */
export const runTitle = (r: ReportRunRow) => `${r.id} (${r.template}, ${r.when})`;

export interface RunCellProps {
  column: RunColumn;
  label: string; // the column's header
  title?: string; // the cell's tooltip (the status cell: what the run waits on)
  children: ReactNode;
}

export function RunCells({
  row: r,
  Cell,
  name = (children) => children,
  before,
  after,
}: {
  row: ReportRunRow;
  Cell: ComponentType<RunCellProps>;
  name?: (children: ReactNode) => ReactNode;
  before?: ReactNode;
  after?: ReactNode;
}) {
  return (
    <>
      {before}
      <Cell column="run" label="Run">
        {name(
          <>
            <span className="block truncate">
              {r.id} · {r.template}
            </span>
            <span className="block truncate font-mono text-[10px] text-muted-foreground">{r.when}</span>
          </>,
        )}
      </Cell>
      <Cell column="target" label="Target">
        <span className="block font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{r.target}</span>
      </Cell>
      <Cell column="status" label="Status" title={r.waiting || undefined}>
        <StatusBadge meaning={RUN_STATUS[r.status]} />
        {r.waiting && <span className="sr-only">, waiting on {r.waiting}</span>}
      </Cell>
      <Cell column="findings" label="Findings">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="tabnums text-foreground">{r.findings}</span>
          {r.worst && <SeverityBadge level={r.worst} />}
        </span>
      </Cell>
      <Cell column="plan" label="Plan">
        <span className="whitespace-nowrap font-mono text-[11px] tabnums text-muted-foreground">
          {r.steps.done}/{r.steps.total}
        </span>
      </Cell>
      {after}
    </>
  );
}
