/* The Reconix mark: the terminal's cyan ◆ (the TUI's "◆ reconix", reconix/theme.py CYAN) on a
   dark rounded tile, drawn as the favicon draws it (app/icon.svg): a 32-unit square with an 8-unit
   corner radius, and a diamond whose four points sit 10 units from the centre. Colours are tokens:
   the tile --surface, the diamond --globe-glow (the TUI's cyan). Decorative (aria-hidden) beside
   a visible name; give it a `label` where it stands alone. When `variant="bot"` is set, renders
   the robot AI profile icon on the brand tile instead of the diamond. */
import type { SVGProps } from "react";

export interface ReconixMarkProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height" | "viewBox" | "children"> {
  /** Width and height in px (the drawing scales with it). */
  size: number;
  /** Its accessible name when nothing beside it says "Reconix"; without one it is hidden. */
  label?: string;
  /** When set, renders this character on the brand tile (e.g. 'R'). */
  char?: string;
  /** Visual variant: default diamond, robot profile ("bot"), or initial character ("char"). */
  variant?: "diamond" | "bot" | "char";
}

const BOT_PATH =
  "M8.7 6.1h11v3.6h2v3.6h-2v3.6h2v7.2h-3.6v-7.2h-5.8v7.2H8.7Zm3.6 3.6v3.6h5.8V9.7Z";
const BOT_SHADOW_PATH =
  "M19.7 7.7h1.6v2m-7.6 3.6v-2.1h4.4m3.6.2h1.6V15h-2v1.9M10.3 24.1v1.8h3.6v-7.4h4.2m3.6 0h1.6v7.4h-3.6v-1.8";
const R_PATH =
  "M 9.75 8.5 H 17 C 20.2 8.5 22.25 10 22.25 12.5 C 22.25 14.8 20.5 16.2 17.5 16.4 L 22.25 23.5 H 18.2 L 13.75 16.5 V 23.5 H 9.75 Z M 13.75 11.2 V 13.8 H 16.8 C 18.2 13.8 18.8 13.2 18.8 12.5 C 18.8 11.8 18.2 11.2 16.8 11.2 Z";
const DIAMOND_PATH = "M16 6 26 16 16 26 6 16Z";

export function ReconixMark({ size, label, char, variant = char ? "char" : "diamond", ...props }: ReconixMarkProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  const d = variant === "bot" ? BOT_PATH : variant === "char" && char?.toUpperCase() === "R" ? R_PATH : DIAMOND_PATH;
  const isCutout = variant === "bot" || variant === "char";
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} data-reconix-mark="" {...a11y} {...props}>
      <rect width="32" height="32" rx="8" className="fill-surface" />
      <path d={d} className="fill-globe-glow" fillRule={isCutout ? "evenodd" : undefined} />
      {variant === "bot" && (
        <path
          d={BOT_SHADOW_PATH}
          fill="none"
          className="stroke-globe-glow"
          strokeWidth="1"
          strokeLinecap="square"
          strokeLinejoin="miter"
          opacity="0.72"
        />
      )}
    </svg>
  );
}
