"use client";

/* A dashboard card's help link: the "?" icon at the card's top right, opening the part of the
   documentation that explains the card. Hover or keyboard focus shows the charts' tooltip ("How
   to read <title>"), so the icon says what it does before it is clicked; Esc hides it. The
   accessible name adds "(documentation)", since the link leaves the dashboard. */
import { CircleHelp } from "lucide-react";
import Link from "next/link";

import { ChartTooltip, useTip } from "@/components/dashboard/chart-tooltip";
import { cn } from "@/lib/utils";

export function DashCardHelp({ title, docsHref, className }: { title: string; docsHref: string; className?: string }) {
  const { tip, show, hide } = useTip();
  const open = (e: React.SyntheticEvent<HTMLElement>) => show(e.currentTarget, `How to read ${title}`);
  return (
    <>
      <Link
        href={docsHref}
        aria-label={`How to read ${title} (documentation)`}
        onMouseEnter={open}
        onMouseLeave={hide}
        onFocus={open}
        onBlur={hide}
        className={cn(
          "dash-card-open shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          className,
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </Link>
      <ChartTooltip tip={tip} />
    </>
  );
}
