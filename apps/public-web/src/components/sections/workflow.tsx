import { DocsMoreLink } from "@/components/docs-more-link";
import { Reveal } from "@/components/reveal";
import { AsciiBanner } from "@/components/ascii-banner";
import { SectionShell } from "@/components/section-shell";
import { WorkflowStepper } from "@/components/workflow-stepper";

/**
 * How an assessment runs, as a horizontal, clickable stepper. The section stays a
 * server component (AsciiBanner is server-only); the interactive part is
 * WorkflowStepper, with its steps in workflow-data.ts.
 */
export function Workflow() {
  return (
    <SectionShell id="workflow" backdrop="grid" tint="primary" className="bg-card/40">
      <Reveal className="mb-12 max-w-3xl space-y-4">
        <p data-reveal className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">How it works</p>
        <div data-reveal><AsciiBanner text="Workflow" /></div>
        <h2 data-reveal className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Seven steps, one approval gate you can&apos;t skip.
        </h2>
        <p data-reveal className="text-base leading-relaxed text-foreground/90 sm:text-lg">
          Selecting a template never authorizes testing on its own. The approved Scope Manifest is
          what every later check is measured against.
        </p>
        <div data-reveal><DocsMoreLink href="/docs/assessments/workflow" /></div>
      </Reveal>
      <Reveal stagger={0.12}>
        <WorkflowStepper />
      </Reveal>
    </SectionShell>
  );
}
