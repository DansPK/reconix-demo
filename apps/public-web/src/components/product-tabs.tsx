"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProductView = {
  id: string;
  label: string;
  /** which Reconix surface the screen belongs to */
  surface: "terminal" | "viewer";
  /** pre-rendered lucide icon (a component can't cross the server/client boundary) */
  icon: ReactNode;
  /** one line under the window; also the panel's accessible description */
  caption: string;
  /** the screen itself, rendered on the server */
  screen: ReactNode;
};

/**
 * Tabbed product preview: an ARIA tablist of screens above one large window.
 * Same mechanics as WorkflowStepper: roving tabindex (Left/Right/Home/End),
 * panels stacked in one grid cell on lg+ so switching never shifts the layout (below lg
 * only the active panel is laid out, the screens differ too much in height),
 * panels swapped through `.wipe[data-state]`, tabs styled by the `.wf-step` rules.
 * Screens arrive pre-rendered from the server (sections/product-preview.tsx).
 */
export function ProductTabs({ views }: { views: ProductView[] }) {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  const select = (i: number, focus = false) => {
    setSelected(i);
    const tab = tabRefs.current[i];
    if (focus) tab?.focus({ preventScroll: true });
    // keep the tab visible inside the (mobile) scrolling rail without moving the page
    const rail = railRef.current;
    if (rail && tab && rail.scrollWidth > rail.clientWidth) {
      const offset = tab.getBoundingClientRect().left - rail.getBoundingClientRect().left;
      rail.scrollTo({
        left: rail.scrollLeft + offset - (rail.clientWidth - tab.offsetWidth) / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = views.length - 1;
    const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <div className="space-y-5">
      <div
        ref={railRef}
        data-reveal
        className="wf-rail -mx-4 snap-x overflow-x-auto px-4 py-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0"
      >
        <div role="tablist" aria-label="Reconix screens" className="flex w-max gap-2.5 lg:grid lg:w-full lg:grid-cols-5">
          {views.map((v, i) => (
            <button
              key={v.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${v.id}`}
              aria-selected={i === selected}
              aria-controls={`${uid}-panel-${v.id}`}
              tabIndex={i === selected ? 0 : -1}
              data-state={i === selected ? "active" : "todo"}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="wf-step flex w-40 shrink-0 snap-center items-center gap-3 rounded-xl border px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-auto"
            >
              <span className="wf-icon shrink-0 [&>svg]:size-5">{v.icon}</span>
              <span className="min-w-0">
                <span className="wf-label block truncate font-mono text-xs font-semibold uppercase tracking-[0.14em]">{v.label}</span>
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">{v.surface}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div data-reveal className="grid grid-cols-[minmax(0,1fr)]">
        {views.map((v, i) => {
          const shown = i === selected;
          return (
            <div
              key={v.id}
              role="tabpanel"
              id={`${uid}-panel-${v.id}`}
              aria-labelledby={`${uid}-tab-${v.id}`}
              aria-describedby={`${uid}-cap-${v.id}`}
              aria-hidden={!shown}
              inert={!shown}
              data-state={shown ? "in" : "out"}
              // lg+: stacked in one cell (no layout shift). Below lg the screens differ a lot in
              // height, so only the active one is laid out instead of leaving a tall gap.
              className={cn("wipe min-w-0 [grid-area:1/1]", !shown && "max-lg:hidden")}
            >
              {/* the screen is a picture of the UI; the caption says what it shows */}
              <div aria-hidden>{v.screen}</div>
              <p id={`${uid}-cap-${v.id}`} className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <span className="text-sm text-foreground/90 sm:text-base">{v.caption}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Simplified preview · sample data
                </span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
