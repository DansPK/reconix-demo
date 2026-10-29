import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DotField } from "@/components/dot-field";
import type { Backdrop, Tint } from "@/components/section-themes";

export type SectionShellProps = {
  id: string;
  /** Tiled pattern + glow behind the section (`.backdrop-<name>` in globals.css). */
  backdrop?: Backdrop;
  /** Hue the fixed ambient layer fades to while this section crosses the 55% line. Omit = neutral. */
  tint?: Tint;
  /** Opt-in slow drift of the tiled pattern (grid / dots / scanlines only). */
  drift?: boolean;
  /** Extra classes on the <section>, e.g. "bg-card/40" to alternate banding. */
  className?: string;
  /** Merged into the standard inner container (`mx-auto max-w-6xl px-4 sm:px-6`). */
  containerClassName?: string;
  children: ReactNode;
};

/**
 * Standard landing-page section: anchor id, top border, vertical rhythm, a
 * themed backdrop layer and the centered content container.
 *
 * Uses `overflow-clip`, never `overflow-hidden`: hidden would turn the section into
 * the scroll container for sticky children (the workflow's left column).
 */
export function SectionShell({
  id,
  backdrop = "none",
  tint,
  drift,
  className,
  containerClassName,
  children,
}: SectionShellProps) {
  return (
    <section
      id={id}
      data-ambient={tint}
      className={cn(
        "relative isolate overflow-clip scroll-mt-20 border-t border-border py-20 lg:py-28",
        className
      )}
    >
      {backdrop !== "none" && (
        <div aria-hidden className={cn("backdrop", `backdrop-${backdrop}`, drift && "backdrop-drift")}>
          {/* the dot matrix is a canvas so it can react to the cursor; the other patterns are pure CSS */}
          {backdrop === "dots" && <DotField />}
        </div>
      )}
      <div className={cn("mx-auto max-w-6xl px-4 sm:px-6", containerClassName)}>{children}</div>
    </section>
  );
}
