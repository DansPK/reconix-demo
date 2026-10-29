import Link from "next/link";
import { AsciiBanner } from "@/components/ascii-banner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { TypedLine } from "@/components/typed-line";
import { cn } from "@/lib/utils";

const STATUS = [
  { label: "scope", value: "approved" },
  { label: "policy", value: "armed" },
  { label: "tools", value: "ready" },
] as const;

const monoBtn = "font-mono text-xs font-semibold uppercase tracking-[0.14em]";

/**
 * Centered hero: figlet "ANSI Shadow" wordmark with a teal gradient fill that boots in
 * row by row (CSS, see `.ascii-banner--hero`), typed tagline, status readouts and two
 * calls to action. The nav hides its own "Get started" while this section is on screen.
 * The visible heading is the ASCII art; the sr-only h1 carries the name for assistive tech.
 */
export function Hero() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="hero-surface relative isolate overflow-clip"
    >
      <div aria-hidden className="backdrop backdrop-glow" />
      <div aria-hidden className="hero-scan absolute inset-0" />

      <div className="relative mx-auto flex min-h-[88vh] max-w-5xl flex-col items-center justify-center gap-8 px-4 py-24 text-center sm:px-6">
        

        <h1 id="hero-title" className="sr-only">
          Reconix
        </h1>
        <AsciiBanner text="Reconix" variant="hero" decorative />

        <TypedLine
          className="max-w-4xl font-mono text-sm uppercase tracking-[0.14em] text-foreground sm:text-base lg:text-lg"
          lines={[
            "AI-planned security assessments inside an approved scope.",
            "From scope manifest to report, every step approved by you.",
          ]}
        />

        <ul aria-label="Assessment status" className="flex flex-wrap items-center justify-center gap-2">
          {STATUS.map((s) => (
            <li key={s.label}>
              <StatusChip label={s.label} value={s.value} />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link href="/docs/getting-started" className={cn(buttonVariants({ size: "lg" }), monoBtn)}>
            Get started
          </Link>
          <Link
            href="/docs"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              monoBtn,
              "hover:border-primary/60 hover:bg-primary/5"
            )}
          >
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  );
}
