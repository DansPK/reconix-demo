/* The top of a dashboard view: its title, what it is about beside it (the run, or every run;
   `tag`, when the view has one), one line on what it shows, and what goes on the right
   (downloads, a docs link).

   `docsHref` adds the cards' own "?" help beside the title (DashCardHelp: "How to read <title>",
   landing on that view's Dashboard panels section), for a view that is one panel rather than a
   row of cards — the Assessments, Findings and Run log views had no help at all
   (QA-LOCAL-WEB-REPORT, QAL-009). The Report view leaves it out: each of its cards has its own. */
import Link from "next/link";
import { SquareArrowOutUpRight } from "lucide-react";

import { DashCardHelp } from "@/components/dashboard/dash-card-help";

export function ViewHeader({ title, tag, about, docsHref, children }: { title: string; tag?: string; about: string; docsHref?: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h1 className="text-[20px] font-medium text-foreground">{title}</h1>
          {docsHref && <DashCardHelp title={title} docsHref={docsHref} />}
          {tag && <span className="min-w-0 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{tag}</span>}
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{about}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>}
    </header>
  );
}

/** "Scope Manifest ↗": the view's page in the docs. */
export function DocsLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="dash-card-open inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children} <SquareArrowOutUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}
