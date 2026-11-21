/* A chart's legend: each swatch next to its name (a status as its badge, with how many the
   chart holds), never colour alone. Every entry is a toggletip (hint.tsx), so its meaning is
   reachable by mouse, keyboard and touch. The swatches match the marks the charts draw,
   including the fill that tells apart statuses sharing a colour. */
import { Hint } from "@/components/dashboard/hint";
import type { LegendItem } from "@/components/dashboard/overview-types";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export function Swatch({ color, shape, pattern }: Pick<LegendItem, "color" | "shape" | "pattern">) {
  const style = { "--c": color } as React.CSSProperties;
  return <span aria-hidden className="dash-swatch" data-shape={shape} data-pattern={pattern === "stripes" ? "stripes" : undefined} style={style} />;
}

export function Legend({ items, label, className }: { items: LegendItem[]; label: string; className?: string }) {
  if (!items.length) return null;
  return (
    <ul aria-label={label} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {items.map((item) => {
        const name = item.count !== undefined ? `${item.label} ${item.count}` : item.label;
        return (
          <li key={item.label}>
            <Hint title={name} text={item.hint} className="inline-flex items-center gap-1.5">
              <Swatch color={item.color} shape={item.shape} pattern={item.pattern} />
              {item.meaning ? <StatusBadge meaning={item.meaning} label={name} /> : name}
            </Hint>
          </li>
        );
      })}
    </ul>
  );
}
