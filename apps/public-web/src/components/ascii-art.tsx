import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type AsciiArtProps = {
  lines: string[];
  label?: string;
  tone?: "primary" | "foreground";
  dim?: string;
  className?: string;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


export function AsciiArt({ lines, label, tone = "primary", dim, className }: AsciiArtProps) {
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
  const dimRun = dim ? new RegExp(`(${escapeRegExp(dim)}+)`) : null;

  return (
    <pre
      {...a11y}
      className={cn(
        "ascii-banner ascii-banner--section font-mono leading-none overflow-hidden",
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
