/* One page of saved runs, each a link to that run's Overview (`/?uid=…`, no view), its cells
   from run-cells.tsx. Cards on phones, two to a row from 640 px, and one table-like row each
   from 1024 px (assessments.css); the cell labels become a header row there. */
import Link from "next/link";

import type { ReportRunRow } from "@/components/dashboard/report-types";
import { RUN_COLUMNS, RunCells, type RunCellProps, runTitle } from "@/components/dashboard/run-cells";
import { runOverviewHref } from "@/components/dashboard/view-url";

/** A cell on the card: its label (read by screen readers on the table-like row), then the value. */
function Cell({ column, label, title, children }: RunCellProps) {
  return (
    <span className={`asm-cell asm-${column}`} title={title}>
      <span className="asm-k">{label}</span>
      {children}
    </span>
  );
}

export function AssessmentsRows({ rows }: { rows: ReportRunRow[] }) {
  return (
    <div className="asm-table">
      <div className="asm-head" aria-hidden="true">
        {RUN_COLUMNS.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
      </div>
      <ul role="list" aria-label="Saved assessments" className="asm-list">
        {rows.map((r) => (
          <li key={r.uid}>
            <Link href={runOverviewHref(r.uid)} title={`Open the overview of ${runTitle(r)}`} className="asm-row ui-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <RunCells row={r} Cell={Cell} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
