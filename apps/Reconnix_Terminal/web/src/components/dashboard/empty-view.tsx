/* Shown in place of the data views while the data folder holds no readable assessment:
   where the site looks, how to get a first one, and which files were skipped and why. */
import Link from "next/link";
import { FolderOpen } from "lucide-react";

import type { Problem } from "@/lib/data/store";
import { DOCS } from "@/lib/docs-nav";

const CODE = "rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground";

export function EmptyView({ dir, problems, compact = false }: { dir: string; problems: Problem[]; compact?: boolean }) {
  if (compact) {
    return (
      <div className="dash-view">
        <p className="text-sm text-muted-foreground">No saved assessments yet. The Overview says how to get one.</p>
      </div>
    );
  }
  return (
    <div className="dash-view">
      <section className="dash-card flex max-w-2xl flex-col gap-3 p-5">
        <h1 className="flex items-center gap-2 text-[18px] font-medium text-foreground">
          <FolderOpen className="size-5 text-primary" aria-hidden />
          No saved assessments yet
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This viewer reads the assessments the Reconix TUI saves to <code className={CODE}>{dir}</code>. Run one with{" "}
          <code className={CODE}>python -m reconix</code> in the reconix-tui folder, and it shows up here
          within 10 seconds.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          To look around with sample data, start the site with{" "}
          <code className={CODE}>RECONIX_DATA_DIR=sample-data RECONIX_STALE_AFTER_HOURS=0</code>.
        </p>
        {problems.length > 0 && (
          <div>
            <p className="mb-1 text-sm text-foreground">Skipped files</p>
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
