"use client";

/* Previous / Next paging for a list of 10 rows at a time (lib/paging.ts): the page and the
   count in words between the two buttons, each disabled at its end with a reason. Nothing is
   drawn while everything fits on one page. The view owns the page (in the address) and hands it
   back through `onPage`; with a `scrollTarget` (the list's top), turning a page from the bottom
   of a long list brings that top back into view (lib/scroll.ts). */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import type { Paging } from "@/lib/paging";
import { revealTop } from "@/lib/scroll";
import { cn } from "@/lib/utils";

export function Pagination({
  paging,
  onPage,
  label = "Pages",
  scrollTarget,
  className,
}: {
  paging: Paging;
  onPage: (page: number) => void;
  label?: string;
  scrollTarget?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const { page, pages } = paging;
  if (pages <= 1) return null;
  const first = page <= 1;
  const last = page >= pages;
  const turn = (n: number) => {
    onPage(n);
    if (scrollTarget?.current) revealTop(scrollTarget.current, { when: "above" });
  };
  return (
    <nav aria-label={label} className={cn("ui-pager", className)}>
      <Button variant="outline" size="xs" onClick={() => turn(page - 1)} disabled={first} aria-label="Previous page" title={first ? "This is the first page" : "Previous page"}>
        <ChevronLeft className="size-3.5" aria-hidden /> Previous
      </Button>
      <span className="ui-pager-label tabnums">{paging.label}</span>
      <Button variant="outline" size="xs" onClick={() => turn(page + 1)} disabled={last} aria-label="Next page" title={last ? "This is the last page" : "Next page"}>
        Next <ChevronRight className="size-3.5" aria-hidden />
      </Button>
    </nav>
  );
}
