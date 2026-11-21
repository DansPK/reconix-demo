/* Shown in place of the Overview and Run log while the Core API has no assessment to show, or
   can't be read: what it said, how to get a first one, and which assessments it could not give
   in full. No fallback to saved files. */
import Link from "next/link";
import { ServerOff } from "lucide-react";

import type { Problem } from "@/lib/data/store";
import { DOCS } from "@/lib/docs-nav";

const CODE = "rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground";

export function CoreEmptyView({ error, problems, compact = false }: { error: string | null; problems: Problem[]; compact?: boolean }) {
  const title = error ? "The Core API can't be read" : "No assessments yet";
  if (compact) {
    return (
      <div className="dash-view">
        <p role="status" className="text-sm text-muted-foreground">
          {error ?? "The Core API holds no assessment yet. The Overview says how to start one."}
        </p>
      </div>
    );
  }
  return (
    <div className="dash-view">
      <section className="dash-card flex max-w-2xl flex-col gap-3 p-5">
        <h1 className="flex items-center gap-2 text-[18px] font-medium text-foreground">
          <ServerOff className="size-5 text-primary" aria-hidden />
          {title}
        </h1>
        {error ? (
          <p role="status" className="text-sm leading-relaxed text-muted-foreground">
            {error}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            This viewer shows the assessments the local Core API holds. Start one in the TUI (
            <code className={CODE}>reconix</code>) and it shows up here within 10 seconds.
          </p>
        )}
        {problems.length > 0 && (
          <div>
            <p className="mb-1 text-sm text-foreground">Assessments the Core API could not give in full</p>
            <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {problems.map((p) => (
                <li key={p.file}>
                  {p.file} · {p.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link href={DOCS.gettingStarted} className="ui-link w-fit text-sm">
          Getting started
        </Link>
      </section>
    </div>
  );
}
