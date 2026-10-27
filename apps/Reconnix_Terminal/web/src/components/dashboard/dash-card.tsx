import Link from "next/link";
import { SquareArrowOutUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared dashboard card: a labelled <section> (a region named by its heading) with the card
 * chrome, a header (title left, an optional note and the "open in docs" icon right) and the card
 * body. `ref` and `tabIndex` let a view focus the card itself (the report preview takes focus
 * when it appears). The cursor-following light is CSS (.dash-card::before), moved by
 * card-cursor-light.tsx.
 */
export function DashCard({
  id,
  title,
  docsHref,
  meta,
  glass,
  className,
  bodyClassName,
  children,
  ref,
  tabIndex,
}: {
  id: string;
  title: string;
  docsHref: string;
  meta?: React.ReactNode; // a short note beside the title ("2 of 5 plan steps done")
  glass?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
  tabIndex?: number;
}) {
  return (
    <section ref={ref} tabIndex={tabIndex} aria-labelledby={id} className={cn("dash-card flex flex-col", glass && "dash-glass", className)}>
      <header className="mb-2.5 flex min-w-0 items-center gap-2">
        <h2 id={id} className="shrink-0 text-[13px] font-medium text-foreground">
          {title}
        </h2>
        {meta && <span className="ml-auto min-w-0 truncate font-mono text-[11px] text-muted-foreground">{meta}</span>}
        <Link
          href={docsHref}
          aria-label={`Open ${title} documentation`}
          className={cn(
            "dash-card-open shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
            !meta && "ml-auto",
          )}
        >
          <SquareArrowOutUpRight className="size-3.5" aria-hidden />
        </Link>
      </header>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
