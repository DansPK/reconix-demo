"use client";

/* With every run shown: the newest runs as rows (name, when, status badge, plan progress,
   findings); each opens that run's Overview. */
import Link from "next/link";

import { plural } from "@/components/dashboard/derive-shared";
import { Legend } from "@/components/dashboard/legend";
import type { ExecutionCard } from "@/components/dashboard/overview-types";
import { useRunHref } from "@/components/dashboard/view-url";
import { StatusBadge } from "@/components/ui/status-badge";
import { RUN_STATUS, toneColor } from "@/lib/status";

type Runs = Extract<ExecutionCard, { mode: "runs" }>;

export function RunRows({ data }: { data: Runs }) {
  const href = useRunHref();
  return (
    <>
      <ol aria-label={data.summary} className="dash-runs">
        {data.runs.map((r) => {
          const meaning = RUN_STATUS[r.status];
          return (
            <li key={r.uid}>
              <Link
                href={href(r.uid)}
                aria-label={`Open ${r.id} (${r.template}, ${r.when}): ${meaning.label}, ${r.progress}% done, ${plural(r.findings, "finding")}`}
                className="dash-run"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs text-foreground" title={`${r.id} · ${r.template} · ${r.target}`}>
                    {r.id} · {r.template}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">{r.when}</span>
                </span>
                <StatusBadge meaning={meaning} className="justify-self-start" />
                <span className="flex min-w-0 items-center gap-2">
                  <span className="dash-meter flex-1" aria-hidden>
                    <span data-bar-x style={{ width: `${r.progress}%`, background: toneColor("primary") }} />
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabnums text-muted-foreground">
                    {r.steps.done}/{r.steps.total}
                  </span>
                </span>
                <span className="text-right font-mono text-[10px] tabnums text-muted-foreground" title="Findings (false positives left out)">
                  {plural(r.findings, "finding")}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Legend items={data.legend} label="Execution Timeline legend" className="mt-auto" />
    </>
  );
}
