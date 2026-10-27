"use client";

/* Two panes: a list on the left and the chosen item's detail on the right (≥1024 px wide); on
   smaller screens one pane at a time, the list or the detail, with Back above the detail. The
   view decides which pane a small screen shows (`pane`) and what Back does (usually a history
   entry back to the list). On the fixed desktop frame each pane scrolls on its own
   (styles/ui.css .ui-split). */
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export function ListDetail({
  list,
  detail,
  pane,
  onBack,
  backLabel = "Back to the list",
  listLabel,
  className,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  pane: "list" | "detail"; // the pane a small screen shows
  onBack: () => void;
  backLabel?: string;
  listLabel: string; // the list pane's accessible name
  className?: string;
}) {
  return (
    <div className={cn("ui-split", className)} data-pane={pane}>
      <section aria-label={listLabel} className="ui-split-list">
        {list}
      </section>
      <div className="ui-split-detail">
        <button type="button" onClick={onBack} className="ui-split-back">
          <ArrowLeft className="size-3.5" aria-hidden /> {backLabel}
        </button>
        {detail}
      </div>
    </div>
  );
}
