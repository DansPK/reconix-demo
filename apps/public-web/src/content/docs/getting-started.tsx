import { Callout, Code, DocLink, DocSection, Mono } from "@/components/docs-layout";
import type { GroupContent } from "@/content/docs/types";

export const gettingStarted: GroupContent = {
  requirements: {
    lede: "What you need before you install Reconix.",
    body: (
      <>
        <DocSection title="Software">
          <ul>
            <li>Docker and Docker Compose. The backend, AI service, tool service, Qdrant and the LLM run as containers.</li>
            <li>Python 3.11 or later for the terminal client.</li>
          </ul>
        </DocSection>
        <DocSection title="Hardware">
          <ul>
            <li>
              A GPU is recommended for the local LLM served by vLLM. You can point the AI service at any OpenAI-compatible
              endpoint instead.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Authorization">
          <p>Written authorization for every target you plan to assess.</p>
          <Callout variant="warning" title="Authorized use only">
            Reconix enforces the scope you approve, but the authorization itself comes from you or your organization. See{" "}
            <DocLink href="/docs/guardrails/authorized-use">Authorized use</DocLink>.
          </Callout>
        </DocSection>
      </>
    ),
  },
  installation: {
    lede: "Start the services with Docker Compose, then install the terminal client.",
    body: (
      <>
        <DocSection title="Start the services">
          <p>Clone the repository and start the services. Replace the repository URL with your team&apos;s.</p>
          <Code>{`git clone <your-reconix-repo> reconix
cd reconix
cp .env.example .env
docker compose up -d`}</Code>
        </DocSection>
        <DocSection title="Install the terminal client">
          <Code>{`pip install -e ./terminal
reconix --help`}</Code>
        </DocSection>
        <DocSection title="Next steps">
          <p>
            Review the settings in <DocLink href="/docs/getting-started/configuration">Configuration</DocLink>, then run your{" "}
            <DocLink href="/docs/getting-started/first-assessment">first assessment</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
  configuration: {
    lede: "The main settings live in .env.",
    body: (
      <>
        <DocSection title="Environment settings">
          <ul>
            <li>
              <Mono>LLM_BASE_URL</Mono>: the OpenAI-compatible endpoint (default: the bundled vLLM service).
            </li>
            <li>
              <Mono>NVD_API_KEY</Mono>: optional, raises the rate limit for CVE lookups.
            </li>
            <li>
              <Mono>RISK_POLICY</Mono>: path to the Risk Policy Table that decides which actions need approval.
            </li>
            <li>Execution limits: maximum tool calls, iterations and run time per assessment.</li>
          </ul>
        </DocSection>
        <DocSection title="Going further">
          <p>
            Templates, the Scope Manifest, policies and credentials are covered in{" "}
            <DocLink href="/docs/configuration">Configuration</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
  "first-assessment": {
    lede: "From a plain-language request to a report, with every step approved by you.",
    body: (
      <>
        <DocSection title="Run it">
          <ol className="space-y-2 [&_li]:ml-5 [&_li]:list-decimal">
            <li>
              Start the terminal with <Mono>reconix</Mono>.
            </li>
            <li>
              Describe the task in plain language, or type <Mono>/template</Mono> to pick Network, API, Source Code or Web URL.
            </li>
            <li>Answer the questions Reconix asks and review the draft Scope Manifest.</li>
            <li>
              <strong>Approve the scope.</strong> Nothing runs before this step.
            </li>
            <li>Approve any medium- or high-risk action when prompted, or stop the assessment at any time.</li>
            <li>Generate the report when the analysis is complete.</li>
          </ol>
        </DocSection>
        <DocSection title="Review the results">
          <p>
            Browse findings, masked evidence, the audit log and the report in the{" "}
            <DocLink href="/docs/interfaces/local-viewer">Local assessment viewer</DocLink>. The full flow is in{" "}
            <DocLink href="/docs/assessments/workflow">Assessment workflow</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
};
