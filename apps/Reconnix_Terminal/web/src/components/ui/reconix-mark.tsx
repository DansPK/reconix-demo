/* The Reconix mark: the terminal's cyan ◆ (the TUI's "◆ reconix", reconix/theme.py CYAN) on a
   dark rounded tile, drawn as the favicon draws it (app/icon.svg): a 32-unit square with an 8-unit
   corner radius, and a diamond whose four points sit 10 units from the centre. Colours are tokens:
   the tile --surface, the diamond --globe-glow (the TUI's cyan). Decorative (aria-hidden) beside
   a visible name; give it a `label` where it stands alone. */
import type { SVGProps } from "react";

export interface ReconixMarkProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height" | "viewBox" | "children"> {
  /** Width and height in px (the drawing scales with it). */
  size: number;
  /** Its accessible name when nothing beside it says "Reconix"; without one it is hidden. */
  label?: string;
}

export function ReconixMark({ size, label, ...props }: ReconixMarkProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} data-reconix-mark="" {...a11y} {...props}>
      <rect width="32" height="32" rx="8" className="fill-surface" />
      <path d="M16 6 26 16 16 26 6 16Z" className="fill-globe-glow" />
    </svg>
  );
}
