import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";
import { AsciiBanner } from "@/components/ascii-banner";
import { SectionShell } from "@/components/section-shell";
import { ToolLogo } from "@/components/tool-logo";
import { INTEGRATION_GROUPS, type GroupId } from "@/components/integrations-data";
import { cn } from "@/lib/utils";

const group = (id: GroupId) => INTEGRATION_GROUPS.find((g) => g.id === id)!;

/** What the backend enforces on every request (docs/architecture: Backend row). */
const CONTROLS = ["Scope Manifest", "Risk policy", "Execution limits", "Approvals", "Audit log"];

/**
 * The stack drawn as an architecture diagram, top to bottom: interfaces (terminal +
 * read-only viewer) → backend control plane → services (AI, knowledge, security tools)
 * → infrastructure. Rows share a 12-column grid on lg so each connector sits under the
 * layer it leaves; below lg everything stacks and each gap shows one combined connector.
 * Connector + layer CSS: `.stack-link`, `.integration-card`, `.stack-foundation` in globals.css.
 */
export function Integrations() {
  return (
    <SectionShell id="integrations" backdrop="grid" tint="muted">
      <Reveal className="mb-12 max-w-3xl space-y-4">
        <p data-reveal className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">
          Ecosystem
        </p>
        <div data-reveal><AsciiBanner text="Integrations" /></div>
        <h2 data-reveal className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Approved tools on a stack you run yourself.
        </h2>
        <p data-reveal className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Approved tools · one scope · masked output
        </p>
        <p data-reveal className="text-base text-foreground/90 sm:text-lg">
          Every request goes through one backend that checks it against your approved scope before anything reaches
          the model or a security tool, and the whole stack runs on infrastructure you control.
        </p>
      </Reveal>

      <Reveal stagger={0.08}>
        {/* 1 · interfaces */}
        <div data-reveal className="grid gap-5 lg:grid-cols-12">
          <Layer id="terminal" kicker="Interface" className="lg:col-span-7" cols="@sm:grid-cols-3" />
          <Layer id="frontend" kicker="Interface" className="lg:col-span-5" cols="@xs:grid-cols-2" />
        </div>

        <Links
          desktop={[
            { span: "lg:col-span-7", label: "request · approval", dir: "down" },
            { span: "lg:col-span-5", label: "results", dir: "up" },
          ]}
          mobile="request · approval · results"
        />

        {/* 2 · control plane */}
        <div data-reveal>
          <Layer id="backend" kicker="Control plane" accent cols="@md:grid-cols-2 @3xl:grid-cols-[repeat(2,minmax(0,16rem))]">
            <ul aria-label="Checks on every request" className="flex flex-wrap gap-2">
              {CONTROLS.map((c) => (
                <li
                  key={c}
                  className="rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary"
                >
                  {c}
                </li>
              ))}
            </ul>
          </Layer>
        </div>

        <Links
          desktop={[
            { span: "lg:col-span-4", label: "language steps · short context", dir: "down" },
            { span: "lg:col-span-5 lg:col-start-8", label: "validated actions only", dir: "down" },
          ]}
          mobile="language steps · validated actions"
        />

        {/* 3 · services */}
        <div data-reveal className="grid gap-5 lg:grid-cols-12">
          <div className="relative lg:col-span-4">
            <Layer id="ai" kicker="Service" className="h-full" cols="" />
            {/* retrieval: AI service <-> knowledge base */}
            <span aria-hidden className="stack-hlink hidden lg:block" />
          </div>
          <Layer id="knowledge" kicker="Service" className="lg:col-span-3" cols="" />
          <Layer id="security" kicker="Tool service" className="lg:col-span-5" cols="@sm:grid-cols-2" />
        </div>

        <Links desktop={[{ span: "lg:col-span-12", label: "everything runs on", dir: "down" }]} mobile="everything runs on" />

        {/* 4 · foundation */}
        <div data-reveal>
          <Layer id="infrastructure" kicker="Foundation" foundation cols="@md:grid-cols-2 @3xl:grid-cols-[repeat(2,minmax(0,16rem))]" />
        </div>
      </Reveal>
    </SectionShell>
  );
}

/** One layer of the diagram: header (icon, kicker, title, blurb) + its tools as compact chips. */
function Layer({
  id,
  kicker,
  className,
  cols,
  accent,
  foundation,
  children,
}: {
  id: GroupId;
  kicker: string;
  className?: string;
  /** container-query columns for the tool chips */
  cols: string;
  /** control plane: teal-tinted surface */
  accent?: boolean;
  /** infrastructure: hatched base plate */
  foundation?: boolean;
  children?: ReactNode;
}) {
  const g = group(id);
  const Icon = g.icon;
  return (
    <article
      aria-labelledby={`integration-${g.id}`}
      data-accent={accent || undefined}
      className={cn(
        "integration-card @container flex flex-col gap-5 rounded-2xl border p-5 sm:p-6",
        foundation && "stack-foundation",
        className
      )}
    >
      <header className="flex flex-col gap-4 @3xl:flex-row @3xl:items-start @3xl:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Icon className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">{kicker}</p>
            <h3 id={`integration-${g.id}`} className="text-lg font-semibold leading-tight tracking-tight text-foreground">
              {g.title}
            </h3>
            <p className="text-sm text-muted-foreground">{g.blurb}</p>
          </div>
        </div>
        {children}
      </header>
      {/* mt-auto: when a row stretches a card, its chips sit on the bottom edge, in line with the neighbour's */}
      <ul className={cn("mt-auto grid gap-x-5 gap-y-3", cols)}>
        {g.items.map((tool) => (
          <li key={tool.name}>
            <ToolLogo {...tool} size="sm" />
          </li>
        ))}
      </ul>
    </article>
  );
}

type Link = { span: string; label: string; dir: "up" | "down" };

/** The vertical connectors between two rows: one per column on lg, one combined below lg. */
function Links({ desktop, mobile }: { desktop: Link[]; mobile: string }) {
  return (
    <div aria-hidden>
      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-5">
        {desktop.map((l) => (
          <div key={l.label} className={cn("stack-link", l.span)} data-dir={l.dir}>
            <span className="stack-label">{l.label}</span>
          </div>
        ))}
      </div>
      <div className="stack-link lg:hidden" data-dir="down">
        <span className="stack-label">{mobile}</span>
      </div>
    </div>
  );
}
