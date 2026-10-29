import type { CSSProperties } from "react";
import type { ToolLogoItem } from "@/components/integrations-data";
import { cn } from "@/lib/utils";

/**
 * The vendor's brand colour, lifted so it reads on the dark background (HSL lightness
 * floored at 62%). Near-greyscale brands (black / white marks such as Next.js or OWASP)
 * get none and fall back to --primary in `.tool-mark`, as do lucide glyphs.
 */
function brandColor(hex?: string): string | undefined {
  if (!hex || hex.length !== 6) return undefined;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.15) return undefined;
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return `hsl(${Math.round(h)} ${Math.round(Math.min(s, 0.9) * 100)}% ${Math.round(Math.max(l, 0.62) * 100)}%)`;
}

const SIZES = {
  md: { row: "-m-2 gap-4 p-2", mark: "size-14 rounded-xl", icon: "size-7", name: "text-base" },
  sm: { row: "-m-1.5 gap-3 p-1.5", mark: "size-11 rounded-lg", icon: "size-5", name: "text-sm" },
} as const;

/**
 * One integration row: a mark (official simple-icons path, or a lucide glyph when the
 * vendor has no open mark) next to the name and its role. Marks use `currentColor`:
 * soft white at rest, the vendor's colour (or teal) with a glow on hover (`.tool-mark`).
 * `size="sm"` is the compact chip used inside the stack diagram's layers.
 */
export function ToolLogo({
  name,
  note,
  icon,
  glyph: Glyph,
  size = "md",
}: ToolLogoItem & { size?: "md" | "sm" }) {
  const brand = brandColor(icon?.hex);
  const s = SIZES[size];
  return (
    <div
      className={cn("tool-row flex items-center rounded-xl", s.row)}
      style={brand ? ({ "--brand": brand } as CSSProperties) : undefined}
    >
      <span className={cn("tool-mark grid shrink-0 place-items-center border", s.mark)}>
        {icon ? (
          <svg viewBox="0 0 24 24" className={cn("fill-current", s.icon)} aria-hidden>
            <path d={icon.path} />
          </svg>
        ) : Glyph ? (
          <Glyph className={s.icon} aria-hidden strokeWidth={1.6} />
        ) : null}
      </span>
      <span className="min-w-0 leading-tight">
        <span className={cn("block font-display font-semibold text-foreground", s.name)}>{name}</span>
        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{note}</span>
      </span>
    </div>
  );
}
