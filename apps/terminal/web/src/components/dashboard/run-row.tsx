/* One saved run in a list (the Assessment switcher, the run picker): ID and template, then
   when and target, its status as a badge (what it waits on as the tooltip), a tick when open. */
import { Check } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { LibraryItem } from "@/lib/data/view-types";
import { RUN_STATUS } from "@/lib/status";

export function RunRow({ item, current = false }: { item: LibraryItem; current?: boolean }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">
          {item.id} · {item.template}
        </span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">
          {item.when} · {item.target}
        </span>
      </span>
      <span title={item.waiting || undefined} className="shrink-0">
        <StatusBadge meaning={RUN_STATUS[item.status]} />
      </span>
      {current && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
    </>
  );
}
