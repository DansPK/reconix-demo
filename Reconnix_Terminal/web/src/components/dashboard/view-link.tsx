"use client";

/* A drill-down: a button that opens another viewer view with its filters set (for example a
   severity tile opening Findings filtered to that severity). Server components use it to make
   their numbers clickable without becoming client components themselves. */
import { cn } from "@/lib/utils";
import { showView, type View, type ViewParams } from "@/components/dashboard/view-url";

export function ViewLink({
  view,
  filters = {},
  label,
  className,
  children,
}: {
  view: View;
  filters?: ViewParams;
  label: string; // what it opens, for screen readers and the tooltip
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => showView(view, filters)}
      aria-label={label}
      title={label}
      className={cn(
        "cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}
