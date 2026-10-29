import { Callout, DocLink, DocSection, Mono } from "@/components/docs-layout";
import { Badge } from "@/components/ui/badge";
import { WORKFLOW_STEPS } from "@/components/workflow-data";
import type { GroupContent } from "@/content/docs/types";

/** What the landing page's Assessment categories section states for each template. */
const TEMPLATES = [
  { name: "Network", input: "An IP address, hostname or subnet", results: "Assessed hosts, discovered services and related findings." },
  { name: "API", input: "Endpoints and schema", results: "Assessed endpoints and methods, findings, masked request and response evidence." },
  { name: "Source Code", input: "A repository or directory", results: "Affected files and lines, dependency issues, masked code evidence." },
  { name: "Web URL", input: "An application URL", results: "Assessed URLs, findings and masked HTTP evidence." },
];

export const assessments: GroupContent = {
  workflow: {
    lede: "Seven steps from request to report, with one approval gate you can't skip.",
    body: (
      <>
        <DocSection title="Overview">
          <p>
            Selecting a template never authorizes testing on its own. The approved Scope Manifest is what every later check is
            measured against.
          </p>
        </DocSection>
        {WORKFLOW_STEPS.map((s, i) => (
          <DocSection key={s.id} title={`${i + 1}. ${s.title}`}>
            {s.gate && (
              <p>
                <Badge variant="accent">human approval</Badge>
              </p>
            )}
            <p className="text-foreground/90">{s.body}</p>
            <ul>
              {s.detail.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {s.note && <Callout variant="warning">{s.note}</Callout>}
          </DocSection>
        ))}
        <DocSection title="Related">
          <p>
            <DocLink href="/docs/guardrails/approval-model">Approval model</DocLink> ·{" "}
            <DocLink href="/docs/configuration/scope-manifest">Scope Manifest</DocLink> ·{" "}
            <DocLink href="/docs/reference/findings">Findings</DocLink>
          </p>
        </DocSection>
      </>
    ),
  },
  templates: {
    lede: "Four templates cover the targets teams assess most: what each needs from you and what the results show.",
    draft: true,
    body: (
      <>
        <DocSection title="The four templates">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-card font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th className="p-3">Template</th>
                  <th className="p-3">Input</th>
                  <th className="p-3">Results</th>
                </tr>
              </thead>
              <tbody>
                {TEMPLATES.map((t) => (
                  <tr key={t.name} className="border-t border-border align-top">
                    <td className="p-3 font-medium text-foreground">{t.name}</td>
                    <td className="p-3">{t.input}</td>
                    <td className="p-3">{t.results}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DocSection>
        <DocSection title="How templates are used">
          <ul>
            <li>
              Pick one with <Mono>/template</Mono> in the terminal, or describe the task in plain language.
            </li>
            <li>Each template asks for the inputs it needs; your answers become the draft Scope Manifest.</li>
            <li>Selecting a template never authorizes testing on its own: the approved Scope Manifest does.</li>
          </ul>
        </DocSection>
        <DocSection title="Still to document">
          <p>Template-specific questions, the tools used for each category and their options.</p>
        </DocSection>
      </>
    ),
  },
};
