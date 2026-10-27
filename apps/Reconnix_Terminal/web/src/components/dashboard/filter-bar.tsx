"use client";

/* The Findings and Assessments views' filter controls: toggle chips with counts (ChipOption,
   built by the filters modules from lib/status.ts), a search field, and "Showing 4 of 60 · Clear
   filters". Purely presentational: the views keep the values in the address (view-url.ts) and
   do the filtering. */
import { Search, X } from "lucide-react";

import { plural } from "@/components/dashboard/derive-shared";
import type { ChipOption } from "@/components/dashboard/filters";
import { toneColor } from "@/lib/status";
import { cn } from "@/lib/utils";

export type { ChipOption };

const CHIP =
  "dash-chip h-[26px] gap-1.5 border px-2.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";

/** A group of toggle chips. `multi`: any number may be on (empty = all); else exactly one. */
export function FilterChips({
  label,
  options,
  selected,
  onChange,
  multi = false,
}: {
  label: string;
  options: ChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
}) {
  const toggle = (value: string) => {
    if (!multi) return onChange([value]);
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] text-muted-foreground">{label}</span>
      {options.map((o) => {
        const on = selected.includes(o.value);
        const color = o.color ?? toneColor("primary"); // a chip without a meaning of its own (a template)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.count === 0 && !on}
            onClick={() => toggle(o.value)}
            title={o.hint}
            className={cn(CHIP, on ? "text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
            style={on ? { borderColor: `color-mix(in oklab, ${color} 55%, transparent)`, background: `color-mix(in oklab, ${color} 12%, transparent)` } : undefined}
          >
            {o.color && <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: color }} />}
            {o.label}
            <span className="tabnums text-muted-foreground">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <label className="flex h-[30px] min-w-0 items-center gap-2 rounded-[10px] border border-border bg-card px-2.5 text-xs focus-within:border-primary/50">
      <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
      />
    </label>
  );
}

/** "Showing 4 of 60 findings · Clear filters" (the button only while a filter is on); `noun` is
    the singular. The filters' one live region. */
export function FilterSummary({
  shown,
  total,
  noun,
  extra,
  active,
  onClear,
}: {
  shown: number;
  total: number;
  noun: string;
  extra?: string; // listed beside the total, not in it ("1 false positive")
  active: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
      <span>
        Showing <span className="tabnums text-foreground">{shown}</span> of <span className="tabnums">{plural(total, noun)}</span>
        {extra && <span className="tabnums"> + {extra}</span>}
      </span>
      {active && (
        <button type="button" onClick={onClear} className="ui-link inline-flex items-center gap-1">
          <X className="size-3" aria-hidden /> Clear filters
        </button>
      )}
    </div>
  );
}
