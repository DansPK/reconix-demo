/* The one empty state of a list: a dashed box with a sentence on why there is nothing to show
   (no findings yet, no row matches the filters). `status` makes it a live region, for a list
   whose filters can empty it under the reader. */
import { cn } from "@/lib/utils";

export function EmptyNote({ children, status = false, className }: { children: React.ReactNode; status?: boolean; className?: string }) {
  return (
    <p role={status ? "status" : undefined} className={cn("ui-empty", className)}>
      {children}
    </p>
  );
}
