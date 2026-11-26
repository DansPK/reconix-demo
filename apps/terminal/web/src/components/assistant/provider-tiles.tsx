"use client";

/* Set the provider's Provider field: the TUI's /provider list as tiles, three to a row (two on a
   phone), each with its avatar, short name and kind, and a dot on the ones already saved. A
   radio group: one tab stop (the chosen tile), the arrow keys move and choose, as native radios
   do. */
import { forwardRef } from "react";

import { type PresetId, PRESETS } from "@/lib/assistant/models/presets";
import { kindLabel, ProviderAvatar, shortLabel } from "./provider-look";

interface Props {
  value: PresetId;
  saved: ReadonlySet<PresetId>;
  onChange: (preset: PresetId) => void;
  labelledBy: string;
  describedBy: string;
}

export const ProviderTiles = forwardRef<HTMLDivElement, Props>(function ProviderTiles({ value, saved, onChange, labelledBy, describedBy }, ref) {
  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const group = e.currentTarget;
    const at = PRESETS.findIndex((p) => p.id === value);
    const next = PRESETS[(at + step + PRESETS.length) % PRESETS.length].id;
    onChange(next);
    requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-preset="${next}"]`)?.focus());
  };
  return (
    <div ref={ref} role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} onKeyDown={move} className="ai-tiles">
      {PRESETS.map((p) => {
        const on = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${p.label}${saved.has(p.id) ? " (set up)" : ""}`}
            tabIndex={on ? 0 : -1}
            data-preset={p.id}
            onClick={() => onChange(p.id)}
            className="ai-tile"
          >
            {saved.has(p.id) && <span className="ai-tile-saved" aria-hidden />}
            <ProviderAvatar preset={p.id} size={26} />
            <span className="ai-tile-name">{shortLabel(p)}</span>
            <span className="ai-tile-kind">{kindLabel(p)}</span>
          </button>
        );
      })}
    </div>
  );
});
