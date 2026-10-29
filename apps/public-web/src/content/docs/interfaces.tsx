import { Callout, Code, DocLink, DocSection, Mono } from "@/components/docs-layout";
import type { GroupContent } from "@/content/docs/types";

export const interfaces: GroupContent = {
  terminal: {
    lede: "The primary interface. Start assessments, edit the scope, approve actions and see results.",
    body: (
      <>
        <DocSection title="What it does">
          <ul>
            <li>Starts assessments from a plain-language request or a template.</li>
            <li>Shows the draft Scope Manifest so you can edit it, and asks for your approval.</li>
            <li>Pauses for your approval on medium- and high-risk actions; you can stop an assessment at any time.</li>
            <li>Shows results and generates the report.</li>
          </ul>
        </DocSection>
        <DocSection title="Commands">
          <Code>{`reconix          # start the terminal
reconix --help   # list all commands and options
reconix viewer   # start the read-only local viewer`}</Code>
          <p>Inside the terminal:</p>
          <ul>
            <li>
              <Mono>/template</Mono>: pick Network, API, Source Code or Web URL. See{" "}
              <DocLink href="/docs/assessments/templates">Assessment templates</DocLink>.
            </li>
            <li>Or describe the task in plain language.</li>
          </ul>
          <Callout variant="draft">
            The full command and option list is still to document. Until then, <Mono>reconix --help</Mono> is the reference.
          </Callout>
        </DocSection>
      </>
    ),
  },
  "vscode-extension": {
    lede: "Reconix inside VS Code, next to the code and configuration you are assessing.",
    draft: true,
    body: (
      <>
        <DocSection title="What it is">
          <p>
            The VS Code extension is another way to work with Reconix, alongside the{" "}
            <DocLink href="/docs/interfaces/terminal">terminal</DocLink> and the{" "}
            <DocLink href="/docs/interfaces/local-viewer">local viewer</DocLink>. It connects to the same backend, so the
            Scope Manifest, the risk policies and the approval gates apply exactly as they do in the terminal. See{" "}
            <DocLink href="/docs/guardrails/scope-and-safety">Scope &amp; safety</DocLink>.
          </p>
          <Callout variant="draft">
            Installation, the commands the extension adds and its settings are still to document.
          </Callout>
        </DocSection>
      </>
    ),
  },
  "local-viewer": {
    lede: "A read-only web dashboard for every assessment, and a report ready to hand over.",
    body: (
      <>
        <DocSection title="What you can see">
          <ul>
            <li>Current and past assessments.</li>
            <li>Findings filtered by severity, target, category and tool.</li>
            <li>Masked evidence, validation status and the full audit trail.</li>
            <li>Reports, exported as PDF with scope, findings and remediation.</li>
          </ul>
          <p>The viewer is read-only: assessments are started and approved in the terminal.</p>
        </DocSection>
        <DocSection title="Start it">
          <Code>{`reconix viewer
# open http://localhost:3000`}</Code>
        </DocSection>
      </>
    ),
  },
};
