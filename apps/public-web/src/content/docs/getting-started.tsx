import { Callout, Code, DocLink, DocSection, Mono } from "@/components/docs-layout";
import type { GroupContent } from "@/content/docs/types";

export const gettingStarted: GroupContent = {
  requirements: {
    lede: "What you need before you install Reconix.",
    body: (
      <>
        <DocSection title="Computer">
          <ul>
            <li>Linux, macOS 13 or later, or Windows 10/11 (64-bit, with WSL 2).</li>
            <li>4 CPU cores and 8 GB of RAM at least; 16 GB is recommended.</li>
            <li>About 20 GB of free disk for the container images: the Kali tool image alone is 12 GB.</li>
          </ul>
        </DocSection>
        <DocSection title="Software">
          <ul>
            <li>Docker with Compose. Required: the backend and the Kali tool container run in Docker.</li>
            <li>uv, which sets up Python 3.12 for the terminal app.</li>
            <li>Node.js 20.9 or later, only for the local dashboard.</li>
          </ul>
          <p>The installer offers to install any of these that are missing.</p>
        </DocSection>
        <DocSection title="Model access">
          <p>
            A model for the steps that need language understanding. The default is the RECONIX model, served by the
            Reconix team: the installer asks for its server address and key. You can also use OpenAI, Anthropic,
            DeepSeek, your own Ollama or any OpenAI-compatible endpoint. See{" "}
            <DocLink href="/docs/guardrails/model-switching">Model switching</DocLink>.
          </p>
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
    lede: "One installer sets up Reconix and everything it needs to run.",
    body: (
      <>
        <DocSection title="Install Reconix">
          <p>Run the installer from the Reconix folder your team received.</p>
          <p>
            <strong>Linux and macOS</strong>
          </p>
          <Code>{`bash install.sh`}</Code>
          <p>
            <strong>Windows (PowerShell)</strong>
          </p>
          <Code>{".\\install.ps1"}</Code>
          <p>The installer:</p>
          <ul>
            <li>offers to install Docker, uv and Node.js if they are missing;</li>
            <li>sets up Reconix and writes its settings with fresh random secrets;</li>
            <li>puts the <Mono>reconix</Mono> command on your PATH and builds the local dashboard;</li>
            <li>asks for the AI model&apos;s server address and key, starts the containers and tests the model.</li>
          </ul>
          <p>
            Once it finishes, start Reconix with <Mono>reconix</Mono>. On Linux, if the installer added you to the{" "}
            <Mono>docker</Mono> group, log out and back in once first.
          </p>
        </DocSection>
        <DocSection title="Shell commands">
          <ul>
            <li>
              <Mono>reconix</Mono>: start the terminal app.
            </li>
            <li>
              <Mono>reconix status</Mono>: check the backend containers.
            </li>
            <li>
              <Mono>reconix doctor</Mono>: run the diagnostic checks.
            </li>
            <li>
              <Mono>reconix model</Mono>: change the AI model server address or key.
            </li>
            <li>
              <Mono>reconix setup-web</Mono>: rebuild the local dashboard.
            </li>
            <li>
              <Mono>reconix stop</Mono>: stop the backend containers.
            </li>
            <li>
              <Mono>reconix help</Mono>: list every option.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Add another model">
          <p>
            In the terminal, add a provider with <Mono>/provider</Mono> and pick its model with <Mono>/model</Mono>.
            API keys are stored encrypted, never in a file you edit by hand.
          </p>
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
    lede: "The installer writes Reconix's settings to a .env file in its install folder.",
    body: (
      <>
        <DocSection title="Where the settings live">
          <ul>
            <li>
              Linux and macOS: <Mono>~/.local/share/reconix/.env</Mono> (<Mono>/opt/reconix/.env</Mono> when installed
              as root).
            </li>
            <li>
              Windows: <Mono>%LOCALAPPDATA%\Reconix\.env</Mono>.
            </li>
          </ul>
          <p>
            The installer fills it in, with fresh random secrets; you rarely need to edit it. Running the installer again
            keeps your file.
          </p>
        </DocSection>
        <DocSection title="Main settings">
          <ul>
            <li>
              <Mono>RECONIX_MODEL_URL</Mono>: the address of the built-in RECONIX model&apos;s server. Change it with{" "}
              <Mono>reconix model</Mono>.
            </li>
            <li>
              <Mono>RECONIX_MODEL_NAME</Mono>: the model name on that server.
            </li>
            <li>
              <Mono>RECONIX_CORE_API</Mono>: the backend the terminal and the dashboard talk to. Defaults to{" "}
              <Mono>http://127.0.0.1:8000</Mono>.
            </li>
            <li>
              <Mono>RECONIX_PROVIDER_ENCRYPTION_KEY</Mono>: encrypts the API keys you save and the hidden values behind
              masked evidence. If it is lost or changed, saved keys must be entered again.
            </li>
          </ul>
          <Callout>
            Provider API keys do not live in this file. Add them in the terminal with <Mono>/provider</Mono>: they are
            stored encrypted.
          </Callout>
        </DocSection>
        <DocSection title="Going further">
          <p>
            Templates, the Scope Manifest and the risk policies are covered in{" "}
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
              Start Reconix with <Mono>reconix</Mono>.
            </li>
            <li>
              Describe what you want assessed in plain language: Reconix reads the target out of your sentence and
              picks the matching template. Or type <Mono>/new</Mono>, or <Mono>/template</Mono> to choose Network, API,
              Source Code or Web URL yourself.
            </li>
            <li>Answer the questions Reconix asks and review the draft Scope Manifest.</li>
            <li>
              <strong>Approve the scope</strong> at the approval gate (<Mono>/approval</Mono>). Nothing runs before this
              step.
            </li>
            <li>
              Follow the run with <Mono>/status</Mono>, and approve any medium- or high-risk action when prompted. You
              can stop an assessment at any time.
            </li>
            <li>
              Read the results with <Mono>/findings</Mono>, then <Mono>/report</Mono> and <Mono>/export</Mono> for PDF,
              JSON or DOCX.
            </li>
          </ol>
        </DocSection>
        <DocSection title="Review the results">
          <p>
            Type <Mono>/web</Mono> to open the{" "}
            <DocLink href="/docs/interfaces/local-viewer">local dashboard</DocLink>, which shows the findings, their
            masked evidence and the report. The activity log and audit trail are in the terminal, under{" "}
            <Mono>/audit</Mono>. The full flow is in{" "}
            <DocLink href="/docs/assessments/workflow">Assessment workflow</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
};
