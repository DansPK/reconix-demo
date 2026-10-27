/* Table or Grid: a two-button segmented switch (each a toggle, the shown one pressed). */
import { LayoutGrid, Rows3 } from "lucide-react";

import type { Layout } from "./use-layout";

const CHOICES: { value: Layout; label: string; Icon: typeof Rows3 }[] = [
  { value: "table", label: "Table", Icon: Rows3 },
  { value: "grid", label: "Grid", Icon: LayoutGrid },
];

export function LayoutSwitch({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
  return (
    <div role="group" aria-label="Layout" className="kn-switch">
      {CHOICES.map(({ value, label, Icon }) => (
        <button key={value} type="button" aria-pressed={layout === value} onClick={() => onChange(value)} className="kn-switch-btn" title={`Show the files as a ${label.toLowerCase()}`}>
          <Icon className="size-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
