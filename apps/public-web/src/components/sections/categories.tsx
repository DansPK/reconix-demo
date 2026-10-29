import { DocsMoreLink } from "@/components/docs-more-link";
import { Reveal } from "@/components/reveal";
import { AsciiBanner } from "@/components/ascii-banner";
import { SectionShell } from "@/components/section-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const categories = [
  { name: "Network", input: "IP, hostname or subnet", shows: "Assessed hosts, discovered services and related findings." },
  { name: "API", input: "Endpoints and schema", shows: "Assessed endpoints and methods, findings, masked request and response evidence." },
  { name: "Source Code", input: "Repository or directory", shows: "Affected files and lines, dependency issues, masked code evidence." },
  { name: "Web URL", input: "Application URL", shows: "Assessed URLs, findings and masked HTTP evidence." },
];

export function Categories() {
  return (
    <SectionShell id="categories" backdrop="dots" tint="muted">
      <Reveal className="mb-12 max-w-2xl space-y-4">
        <p data-reveal className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">Assessment categories</p>
        <div data-reveal><AsciiBanner text="Targets" /></div>
        <h2 data-reveal className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Four templates cover the targets teams assess most.
        </h2>
        <div data-reveal><DocsMoreLink href="/docs/assessments" /></div>
      </Reveal>
      <Reveal className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c) => (
          <Card key={c.name} data-reveal>
            <CardHeader>
              <p className="font-mono text-xs text-muted-foreground">{c.input}</p>
              <CardTitle>{c.name}</CardTitle>
            </CardHeader>
            <CardContent>{c.shows}</CardContent>
          </Card>
        ))}
      </Reveal>
    </SectionShell>
  );
}
