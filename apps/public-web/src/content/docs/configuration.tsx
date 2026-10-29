import { Code, DocLink, DocSection, Mono } from "@/components/docs-layout";
import { Badge } from "@/components/ui/badge";
import type { GroupContent } from "@/content/docs/types";

export const configuration: GroupContent = {
  "scope-manifest": {
    lede: "Targets, permitted actions, exclusions and limits, written down and approved.",
    body: (
      <>
        <DocSection title="What it contains">
          <ul>
            <li>
              <strong>Targets</strong> and <strong>exclusions</strong>: explicit, nothing is inferred later.
            </li>
            <li>
              <strong>Permitted actions</strong>: what tools may do against those targets.
            </li>
            <li>
              <strong>Assessment limits</strong>: caps that apply to the whole run.
            </li>
          </ul>
        </DocSection>
        <DocSection title="How it is made">
          <ol className="space-y-2 [&_li]:ml-5 [&_li]:list-decimal">
            <li>Reconix drafts it from the template and your plain-language request.</li>
            <li>You edit targets, permitted actions, exclusions and limits before anything runs.</li>
            <li>The terminal shows the final manifest, and testing begins only after you explicitly approve it.</li>
          </ol>
        </DocSection>
        <DocSection title="Example">
          <p>Illustrative only:</p>
          <Code>{`targets:
  - https://staging.example.com/api
permitted: [discovery, auth-checks]
exclusions: [/api/admin/*]
limits: 5 req/s · 2h window`}</Code>
        </DocSection>
        <DocSection title="Why it matters">
          <p>
            The approved Scope Manifest is what every later check is measured against: out-of-scope targets and actions are
            blocked. See <DocLink href="/docs/guardrails/scope-and-safety">Scope &amp; safety</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
  policies: {
    lede: "The Risk Policy Table decides which actions need approval; execution limits cap every run.",
    body: (
      <>
        <DocSection title="Risk Policy Table">
          <p>Every action is classified LOW, MEDIUM or HIGH.</p>
          <ul className="!ml-0 space-y-2 [&>li]:!ml-0 [&>li]:!list-none">
            <li className="flex items-center gap-3">
              <Badge variant="success">LOW</Badge> Runs automatically after checks pass.
            </li>
            <li className="flex items-center gap-3">
              <Badge variant="accent">MEDIUM</Badge> Needs operator approval.
            </li>
            <li className="flex items-center gap-3">
              <Badge variant="accent">HIGH</Badge> Needs explicit, clear approval.
            </li>
          </ul>
          <p>
            Classification uses this fixed table. The AI may suggest a level, but the backend decides. Point{" "}
            <Mono>RISK_POLICY</Mono> in <Mono>.env</Mono> at the table you want to use.
          </p>
        </DocSection>
        <DocSection title="Execution limits">
          <p>
            Caps on tool calls, iterations, run time and repeated actions. They are checked before every tool call and
            monitored while a tool runs.
          </p>
        </DocSection>
        <DocSection title="Related">
          <p>
            <DocLink href="/docs/guardrails/approval-model">Approval model</DocLink> ·{" "}
            <DocLink href="/docs/getting-started/configuration">Environment settings</DocLink>
          </p>
        </DocSection>
      </>
    ),
  },
};
