import { Callout, Code, DocLink, DocSection, Mono } from "@/components/docs-layout";
import { Badge } from "@/components/ui/badge";
import type { GroupContent } from "@/content/docs/types";

export const guardrails: GroupContent = {
  "authorized-use": {
    lede: "Reconix is for authorized security assessments only.",
    body: (
      <>
        <DocSection title="Your responsibility">
          <p>
            Only assess targets you are authorized to test. Reconix enforces the scope you approve, but the authorization
            itself comes from you or your organization. Keep written permission for every target.
          </p>
          <Callout variant="warning" title="Before you start">
            Selecting a template never authorizes testing on its own. Nothing runs until you approve the Scope Manifest.
          </Callout>
        </DocSection>
        <DocSection title="Who it is for">
          <p>Developers checking their own code and services, and security teams running assessments for others.</p>
        </DocSection>
        <DocSection title="What Reconix refuses">
          <p>
            Requests outside its predefined tasks or the approved scope. See{" "}
            <DocLink href="/docs/guardrails/limitations">Limitations</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
  "scope-and-safety": {
    lede: "Checks that run before, during and after every action.",
    body: (
      <>
        <DocSection title="Scope check">
          <p>Every target and action is compared with the approved Scope Manifest. Out-of-scope requests are blocked.</p>
        </DocSection>
        <DocSection title="Command validation">
          <p>
            Commands are built from validated inputs against configured templates and allowed parameters, never free text.
          </p>
        </DocSection>
        <DocSection title="Untrusted input stays separate">
          <p>Web pages, tool output, retrieved documents and uploaded files are treated as data, never as instructions.</p>
        </DocSection>
        <DocSection title="Execution limits">
          <p>
            Caps on tool calls, iterations, run time and repeated actions, checked before every call and monitored while a
            tool runs.
          </p>
        </DocSection>
        <DocSection title="Where the checks run">
          <p>
            In the backend, before any tool request is forwarded. See{" "}
            <DocLink href="/docs/architecture">Architecture</DocLink> for the full path.
          </p>
        </DocSection>
      </>
    ),
  },
  "approval-model": {
    lede: "Two kinds of approval: the scope, once, and higher-risk actions, every time.",
    body: (
      <>
        <DocSection title="Scope approval">
          <p>
            The terminal shows the final Scope Manifest. Testing begins only after you explicitly approve it. Without
            approval, no tool is started.
          </p>
        </DocSection>
        <DocSection title="Action approval">
          <p>
            Every action is classified by the Risk Policy Table. <Badge variant="success">LOW</Badge> runs automatically;{" "}
            <Badge variant="accent">MEDIUM</Badge> and <Badge variant="accent">HIGH</Badge> wait for your approval. See{" "}
            <DocLink href="/docs/configuration/policies">Policies</DocLink> for the table.
          </p>
          <p>The AI may suggest a risk level, but the backend decides. You can stop an assessment at any time.</p>
        </DocSection>
        <DocSection title="Audit">
          <p>Every request, decision and approver lands in the audit log, which you can review in the local viewer.</p>
        </DocSection>
        <DocSection title="Related">
          <p>
            <DocLink href="/docs/configuration/policies">Policies</DocLink> ·{" "}
            <DocLink href="/docs/assessments/workflow">Assessment workflow</DocLink>
          </p>
        </DocSection>
      </>
    ),
  },
  "credential-handling": {
    lede: "Secrets are masked before anything is shown or stored.",
    body: (
      <>
        <DocSection title="Secret masking">
          <p>
            Keys, passwords, tokens and cookies are masked in output, reports and logs before they are shown or stored.
          </p>
        </DocSection>
        <DocSection title="Where masking runs">
          <ul>
            <li>In the tool service, before results leave it.</li>
            <li>Before results are displayed, stored or written to a report.</li>
            <li>Evidence in findings and in the local viewer is the masked version.</li>
          </ul>
        </DocSection>
        <DocSection title="Your own keys">
          <p>
            Service keys such as <Mono>NVD_API_KEY</Mono> live in <Mono>.env</Mono>. See{" "}
            <DocLink href="/docs/getting-started/configuration">Configuration</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
  "llm-data-handling": {
    lede: "What the model sees, and what it never does.",
    body: (
      <>
        <DocSection title="Language steps only">
          <p>
            The LLM is called only in steps that need language understanding, with a short context rather than raw tool output.
            Tools run in the tool service, and only after the backend&apos;s scope, command, risk and limit checks.
          </p>
        </DocSection>
        <DocSection title="Where the model runs">
          <p>
            By default a local model served by vLLM, on your own server. You can point <Mono>LLM_BASE_URL</Mono> at any
            OpenAI-compatible endpoint instead. See <DocLink href="/docs/guardrails/model-switching">Model switching</DocLink>.
          </p>
          <Callout variant="warning">
            If you use an external endpoint, the short context for each language step is sent to that endpoint.
          </Callout>
        </DocSection>
        <DocSection title="Untrusted content">
          <p>
            Never treated as instructions. See{" "}
            <DocLink href="/docs/guardrails/scope-and-safety">Scope &amp; safety</DocLink>.
          </p>
        </DocSection>
        <DocSection title="Grounded answers">
          <ul>
            <li>Before the model explains an impact or recommends a fix, Reconix retrieves matching knowledge with hybrid search.</li>
            <li>Internal knowledge comes first, filtered by the user&apos;s role.</li>
            <li>Missing facts are filled from the knowledge base or the NVD API, or clearly marked unknown.</li>
          </ul>
          <p>
            More in <DocLink href="/docs/guardrails/knowledge-and-rag">Knowledge &amp; RAG</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
  "model-switching": {
    lede: "Run the bundled local model, or point Reconix at any OpenAI-compatible endpoint.",
    draft: true,
    body: (
      <>
        <DocSection title="Where the model runs">
          <ul>
            <li>
              <strong>Default:</strong> a local model served by vLLM, running as a container on your own server. A GPU is
              recommended.
            </li>
            <li>
              <strong>Alternative:</strong> any OpenAI-compatible endpoint. The AI service talks to the model through an
              OpenAI-compatible client, so it works with either.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Switch the model">
          <ol className="space-y-2 [&_li]:ml-5 [&_li]:list-decimal">
            <li>
              Open <Mono>.env</Mono>.
            </li>
            <li>
              Set <Mono>LLM_BASE_URL</Mono> to the endpoint you want. Leave the default to keep the bundled vLLM service.
            </li>
            <li>
              Restart the services with <Mono>docker compose up -d</Mono>.
            </li>
          </ol>
          <Code>{`# .env
LLM_BASE_URL=https://llm.example.com/v1   # any OpenAI-compatible endpoint`}</Code>
          <Callout variant="draft">
            The settings for the model name and the endpoint&apos;s API key are still to document.
          </Callout>
        </DocSection>
        <DocSection title="What switching does not change">
          <p>
            The model only handles the steps that need language understanding. Scope checks, command validation, the Risk
            Policy Table and the execution limits run in the backend, so a different model never changes what is allowed to
            run. The AI may suggest a risk level, but the backend decides.
          </p>
        </DocSection>
        <DocSection title="External endpoints">
          <Callout variant="warning">
            With an external endpoint, the short context for each language step is sent to that endpoint. Check that this is
            acceptable for the data in your assessment.
          </Callout>
          <p>
            What that context contains is covered in{" "}
            <DocLink href="/docs/guardrails/llm-data-handling">LLM data handling</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
  "knowledge-and-rag": {
    lede: "Before the model explains an impact or recommends a fix, Reconix retrieves matching knowledge, your own documents first.",
    draft: true,
    body: (
      <>
        <DocSection title="How retrieval works">
          <ol className="space-y-2 [&_li]:ml-5 [&_li]:list-decimal">
            <li>A finding needs an explanation of its impact or a recommended fix.</li>
            <li>Reconix runs a hybrid search over the knowledge base: BGE-M3 embeddings stored in Qdrant.</li>
            <li>Internal documents come first, filtered by the user&apos;s role.</li>
            <li>Public sources fill in the rest: OWASP, CWE, CVE/NVD and advisories.</li>
            <li>The model answers from what was retrieved. Facts it cannot find are marked unknown, never guessed.</li>
          </ol>
        </DocSection>
        <DocSection title="Your own documents">
          <p>
            Internal documents live in the same knowledge base as the public sources and rank ahead of them, so explanations
            and fixes follow your organization&apos;s own guidance. Retrieval is filtered by role: a user only gets passages
            from documents their role allows.
          </p>
          <Callout variant="draft">
            How to add, update and remove documents, the supported formats and how roles are assigned are still to document.
          </Callout>
        </DocSection>
        <DocSection title="Retrieved text is data">
          <p>
            Retrieved documents are never treated as instructions, whatever they contain. See{" "}
            <DocLink href="/docs/guardrails/scope-and-safety">Scope &amp; safety</DocLink>.
          </p>
        </DocSection>
        <DocSection title="CVE lookups">
          <p>
            CVE details come from the NVD API. Set <Mono>NVD_API_KEY</Mono> in <Mono>.env</Mono> to raise the rate limit. See{" "}
            <DocLink href="/docs/getting-started/configuration">Configuration</DocLink>.
          </p>
        </DocSection>
        <DocSection title="Related">
          <p>
            <DocLink href="/docs/guardrails/llm-data-handling">LLM data handling</DocLink> ·{" "}
            <DocLink href="/docs/reference/findings">Findings</DocLink> ·{" "}
            <DocLink href="/docs/architecture">Architecture</DocLink>
          </p>
        </DocSection>
      </>
    ),
  },
  limitations: {
    lede: "What to keep in mind when you read Reconix results.",
    body: (
      <>
        <DocSection title="Known limitations">
          <ul>
            <li>
              Findings generated with AI can be wrong. Classifications with confidence below 0.80 are marked{" "}
              <Mono>NEEDS_REVIEW</Mono> for a person to check.
            </li>
            <li>
              Severity is never guessed. Without a scanner rating or a CVSS score, a finding is marked <Mono>UNKNOWN</Mono>.
            </li>
            <li>Reconix supports predefined tasks. Requests outside those tasks, or outside the approved scope, are refused.</li>
          </ul>
          <p>
            More on severity and confidence in <DocLink href="/docs/reference/findings">Findings</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
};
