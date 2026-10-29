import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type AsciiArtProps = {
  /** Pre-rendered rows of the art, one string per line. */
  lines: string[];
  /** Accessible name. Omit to mark the art decorative (aria-hidden). */
  label?: string;
  /** `section` = small teal banner under an eyebrow; `hero` = full-width wordmark. */
  variant?: "section" | "hero";
  tone?: "primary" | "foreground";
  /** A filler character (e.g. "░") whose runs are rendered dimmed, like unlit pixels. */
  dim?: string;
  className?: string;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Presentational ASCII block with no figlet dependency, so client code may use it.
 * Each row is its own <span class="block"> with a `--i` index for staggered CSS animation.
 */
export function AsciiArt({ lines, label, variant = "section", tone = "primary", dim, className }: AsciiArtProps) {
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
  const dimRun = dim ? new RegExp(`(${escapeRegExp(dim)}+)`) : null;

  return (
    <pre
      {...a11y}
      className={cn(
        "ascii-banner font-mono leading-none",
        variant === "hero" ? "ascii-banner--hero" : "ascii-banner--section overflow-hidden",
        tone === "foreground" ? "text-foreground" : "text-primary",
        className
      )}
    >
      {lines.map((line, i) => (
        <span key={i} className="ascii-line block" style={{ "--i": i } as CSSProperties}>
          {dimRun
            ? line.split(dimRun).map((part, j) =>
                part.startsWith(dim!) ? (
                  <span key={j} className="opacity-30">
                    {part}
                  </span>
                ) : (
                  part
                )
              )
            : line}
        </span>
      ))}
    </pre>
  );
}
