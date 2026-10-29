import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { AsciiBanner } from "@/components/ascii-banner";
import { SectionShell } from "@/components/section-shell";

export function Cta() {
  return (
    <SectionShell id="start" backdrop="glow" tint="primary" containerClassName="max-w-3xl text-center">
      <Reveal className="space-y-6">
        <div data-reveal className="flex justify-center"><AsciiBanner text="Start" /></div>
        <h2 data-reveal className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Run your next authorized assessment with Reconix.
        </h2>
        <p data-reveal className="text-base leading-relaxed text-muted-foreground sm:text-lg">
          Install the terminal, start the local viewer, and approve your first Scope Manifest.
        </p>
        <div data-reveal className="flex flex-wrap justify-center gap-3">
          <Link href="/docs/getting-started" className={buttonVariants({ size: "lg" })}>
            Read the getting started guide
          </Link>
          <Link href="/docs" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Browse the docs
          </Link>
        </div>
      </Reveal>
    </SectionShell>
  );
}
