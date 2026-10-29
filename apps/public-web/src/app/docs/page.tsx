import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { DocGroupCards } from "@/components/docs-cards";
import { Callout, DocLink, DocsLayout, DocSection } from "@/components/docs-layout";
import { DOCS_NAV } from "@/lib/docs-nav";

export const metadata = { title: "Documentation · Reconix" };

const TEMPLATES = [
  { name: "Network", input: "IP, hostname or subnet", href: "/docs/assessments/templates" },
  { name: "API", input: "Endpoints and schema", href: "/docs/assessments/templates" },
  { name: "Source Code", input: "Repository or directory", href: "/docs/assessments/templates" },
  { name: "Web URL", input: "Application URL", href: "/docs/assessments/templates" },
];

export default function DocsHome() {
  return (
    <DocsLayout href="/docs" title="Documentation" lede="What Reconix is, what it expects from you, and where to go next.">
      <Link
        href="/docs/getting-started/first-assessment"
        className="group flex items-center gap-4 rounded-2xl border border-primary/40 bg-primary/5 p-5 transition-colors hover:border-primary"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Rocket className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-primary">Start here</span>
          <span className="block font-display text-lg font-semibold text-foreground">Run your first assessment</span>
          <span className="block text-sm text-muted-foreground">Requirements, installation and a first approved scope.</span>
        </span>
        <ArrowRight className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" aria-hidden />
      </Link>

      <DocSection title="What Reconix does">
        <p>
          Reconix is an AI-powered terminal assistant for authorized security assessments. It plans tasks, uses approved
          tools within a scope you sign off on, analyzes the results, retrieves trusted security knowledge, and suggests next
          steps.
        </p>
        <p>
          It is built for two kinds of users: developers checking their own code and services, and security teams running
          assessments for others.
        </p>
        <Callout variant="warning" title="Authorized use only">
          Only assess targets you are authorized to test. See <DocLink href="/docs/guardrails/authorized-use">Authorized use</DocLink>.
        </Callout>
      </DocSection>

      <DocSection title="Supported assessments">
        <p>Four templates cover the targets teams assess most:</p>
        <ul className="grid gap-3 sm:grid-cols-2 !ml-0 [&>li]:!ml-0 [&>li]:!list-none">
          {TEMPLATES.map((t) => (
            <li key={t.name}>
              <Link
                href={t.href}
                className="block rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/50"
              >
                <span className="block font-display font-semibold text-foreground">{t.name}</span>
                <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t.input}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </DocSection>

      <DocSection title="Browse the docs">
        <DocGroupCards groups={DOCS_NAV.filter((g) => g.id !== "overview")} />
      </DocSection>
    </DocsLayout>
  );
}
