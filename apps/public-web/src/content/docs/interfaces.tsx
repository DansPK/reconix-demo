import { Code, DocLink, DocSection, Mono } from "@/components/docs-layout";
import type { GroupContent } from "@/content/docs/types";

/** The terminal app's slash commands, as its own command registry groups them. */
const COMMANDS: { title: string; items: { name: string; description: string }[] }[] = [
  {
    title: "Start & navigate",
    items: [
      { name: "/help", description: "Show shortcuts for this screen." },
      { name: "/new", description: "Start a new assessment, optionally on a target." },
      { name: "/template", description: "Pick a template, then type its target." },
    ],
  },
  {
    title: "Flow",
    items: [
      { name: "/plan", description: "Review and run the test plan." },
      { name: "/approval", description: "Open the approval gate." },
      { name: "/status", description: "Live execution, after the plan runs." },
      { name: "/stop", description: "Stop the running assessment; asks first." },
    ],
  },
  {
    title: "Findings & reports",
    items: [
      { name: "/findings", description: "List all findings." },
      { name: "/finding", description: "Open one finding." },
      { name: "/report", description: "Open the assessment report." },
      { name: "/export", description: "Export the report as PDF, JSON or DOCX." },
      { name: "/summary", description: "Show the assessment summary." },
    ],
  },
  {
    title: "Assessments & data",
    items: [
      { name: "/assessments", description: "List and reopen assessments." },
      { name: "/audit", description: "Activity log and audit trail." },
    ],
  },
  {
    title: "AI models & agent",
    items: [
      { name: "/add-on", description: "Add reference files for the AI." },
      { name: "/provider", description: "Manage LLM providers: set, test, use or unset." },
      { name: "/model", description: "Pick the active model." },
    ],
  },
  {
    title: "Dashboard & session",
    items: [
      { name: "/web", description: "Open the local dashboard in your browser, starting it if needed." },
      { name: "/doctor", description: "Check the Reconix installation and local services." },
      { name: "/quit", description: "Quit Reconix." },
    ],
  },
];

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
            <li>Shows results, generates the report and exports it.</li>
          </ul>
        </DocSection>
        <DocSection title="Start it">
          <Code>{`reconix`}</Code>
          <p>
            Installation is in <DocLink href="/docs/getting-started/installation">Installation</DocLink>.
          </p>
        </DocSection>
        <DocSection title="Commands">
          <p>
            Describe what you want assessed in plain language, or use a slash command. <Mono>/help</Mono> lists the
            shortcuts for whichever screen you are on.
          </p>
          <div className="space-y-5">
            {COMMANDS.map((g) => (
              <div key={g.title}>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{g.title}</p>
                <ul className="mt-2">
                  {g.items.map((c) => (
                    <li key={c.name}>
                      <Mono>{c.name}</Mono>: {c.description}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p>
            The four templates behind <Mono>/template</Mono> are described in{" "}
            <DocLink href="/docs/assessments/templates">Assessment templates</DocLink>.
          </p>
        </DocSection>
      </>
    ),
  },
  "vscode-extension": {
    lede: "Reconix Code Scanner: scan the code you are working on and fix what it finds, without leaving VS Code.",
    body: (
      <>
        <DocSection title="What it is">
          <p>
            Reconix Code Scanner adds a security chat to VS Code. Ask it to scan, and it lists the vulnerabilities it
            finds by severity; each finding opens the exact file and line. It works alongside the{" "}
            <DocLink href="/docs/interfaces/terminal">terminal</DocLink> and the{" "}
            <DocLink href="/docs/interfaces/local-viewer">local dashboard</DocLink>, and talks to the same local Reconix
            backend.
          </p>
          <p>
            The scans run on that backend, in the Kali tool container, with tools such as semgrep, gitleaks and
            osv-scanner.
          </p>
        </DocSection>
        <DocSection title="Before you start">
          <ul>
            <li>
              Reconix installed and running. See <DocLink href="/docs/getting-started/installation">Installation</DocLink>.
            </li>
            <li>VS Code 1.90 or later.</li>
          </ul>
        </DocSection>
        <DocSection title="Install it">
          <p>
            The extension ships as a <Mono>.vsix</Mono> file. To install it:
          </p>
          <ol className="space-y-2 [&_li]:ml-5 [&_li]:list-decimal">
            <li>
              Find <Mono>reconix-code-scanner.vsix</Mono> in your Reconix folder, under <Mono>extension</Mono>.
            </li>
            <li>
              In VS Code, open the Extensions view (<Mono>Ctrl+Shift+X</Mono>), open the <Mono>…</Mono> menu and choose{" "}
              <strong>Install from VSIX…</strong>, then pick the file.
            </li>
          </ol>
          <p>The Reconix icon, a magnifying glass with an R, appears in the left sidebar.</p>
        </DocSection>
        <DocSection title="Set it up">
          <ol className="space-y-2 [&_li]:ml-5 [&_li]:list-decimal">
            <li>
              Click the Reconix icon to open the chat. It connects to the local Reconix backend and opens its own
              session; the token is kept in VS Code&apos;s secure storage.
            </li>
            <li>
              If no model is active yet, open the chat&apos;s model menu and choose <strong>Add Model</strong>. Models
              added in the terminal show up here too.
            </li>
          </ol>
        </DocSection>
        <DocSection title="Use it">
          <ul>
            <li>
              <strong>Scan:</strong> type <Mono>scan</Mono> in the chat, or run{" "}
              <strong>Reconix Code Scanner: Scan Workspace</strong> from the Command Palette. You can also scan one
              folder or file from the Explorer, or a GitHub repository.
            </li>
            <li>
              <strong>Review:</strong> findings are listed by severity. Click one to open its line, or ask the chat to
              explain it. Findings judged likely false positives are hidden unless you turn them on.
            </li>
            <li>
              <strong>Fix:</strong> <strong>Fix Findings</strong> asks the AI to fix the selected findings and shows the
              change as a diff for you to review.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Settings">
          <p>
            Search for <strong>Reconix</strong> in VS Code&apos;s Settings.
          </p>
          <ul>
            <li>
              <Mono>serverUrl</Mono>: the address of the Reconix backend. Defaults to the one on this computer.
            </li>
            <li>
              <Mono>scanOnSave</Mono>: after a scan, rescan the folder when you save a file in it. Off by default.
            </li>
            <li>
              <Mono>showLikelyFalsePositives</Mono>: show findings marked as likely false positives. Off by default.
            </li>
            <li>
              <Mono>extraExcludes</Mono>: extra gitignore-style patterns to leave out of scans.
            </li>
            <li>
              <Mono>maxFileSizeKB</Mono> and <Mono>maxUploadMB</Mono>: skip large files, and cap what is sent for a
              scan.
            </li>
          </ul>
        </DocSection>
      </>
    ),
  },
  "local-viewer": {
    lede: "A local web dashboard for your assessments, their findings and a report ready to hand over.",
    body: (
      <>
        <DocSection title="What you can see">
          <ul>
            <li>An overview of your runs, and the list of past assessments.</li>
            <li>Findings, filtered by severity, review state and free-text search.</li>
            <li>One finding at a time: its severity, masked evidence, impact and remediation.</li>
            <li>Reports, exported as PDF, JSON or DOCX.</li>
            <li>An AI Assistant you can ask about the results.</li>
            <li>The knowledge base, including the documents you added.</li>
          </ul>
          <p>
            Assessments are started and approved in the terminal; the dashboard reads them from the same local Reconix
            backend. The activity
            log and audit trail live in the terminal, under <Mono>/audit</Mono>.
          </p>
        </DocSection>
        <DocSection title="Start it">
          <p>
            From the terminal, type <Mono>/web</Mono>: it installs the packages the first time, starts the dashboard and
            opens your browser. If it needs rebuilding, run <Mono>reconix setup-web</Mono>. In a source checkout, by
            hand:
          </p>
          <Code>{`cd apps/web
npm install
npm run dev`}</Code>
          <p>
            The dashboard listens on <Mono>127.0.0.1</Mono> only, on port <Mono>3100</Mono> (<Mono>RECONIX_WEB_PORT</Mono>{" "}
            changes it).
          </p>
          <p>No account or sign-in is needed.</p>
        </DocSection>
      </>
    ),
  },
};
