"use client";

/* The graph's legend, which is also its filter: one chip per reference type (pressed: shown) with
   its colour and how many there are, and "Shared only" (references two documents or more
   mention), the quickest way to see how documents relate. */
import { type RefType, REF_TYPES, TYPE_LABEL } from "@/lib/knowledge/graph";

interface Props {
  counts: Record<RefType, number>;
  types: ReadonlySet<RefType>;
  onToggle: (type: RefType) => void;
  sharedOnly: boolean;
  onShared: (on: boolean) => void;
}

export function GraphLegend({ counts, types, onToggle, sharedOnly, onShared }: Props) {
  return (
    <div className="kn-legend" role="group" aria-label="Show in the graph">
      <span className="kn-legend-doc">
        <span className="kn-type-dot" data-type="DOC" aria-hidden />
        Documents
      </span>
      {REF_TYPES.map((t) => (
        <button key={t} type="button" aria-pressed={types.has(t)} onClick={() => onToggle(t)} className="kn-legend-chip" data-type={t}>
          <span className="kn-type-dot" data-type={t} aria-hidden />
          {TYPE_LABEL[t]}
          <span className="kn-legend-count">{counts[t]}</span>
        </button>
      ))}
      <button type="button" aria-pressed={sharedOnly} onClick={() => onShared(!sharedOnly)} className="kn-legend-chip is-shared">
        Shared only
      </button>
    </div>
  );
}
