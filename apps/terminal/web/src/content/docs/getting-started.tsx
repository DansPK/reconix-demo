import { Callout, Code, DocRef, DocSection, DocTable, Kbd, Mono, Steps } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";

export const gettingStarted: GroupContent = {
  introduction: {
    lede: "A terminal for authorized security assessments: you decide, Reconix drafts, checks and records.",
    body: (
      <>
        <DocSection title="What Reconix does">
          <p>
            Reconix is a keyboard-first terminal application. You type a target (a URL, an IPv4 address or range, a git
            repository or a local path); Reconix picks a template, drafts a <strong>scope manifest</strong> and shows it in
            plain words. Nothing is tested until you approve it. You then review the <strong>test plan</strong>, run it,
            and the run pauses at every risky step for your decision. Findings appear as testing finds them, and the{" "}
            <strong>report</strong> can be saved as PDF, JSON or DOCX.
          </p>
          <p>
            The flow is eight screens: Start → Template → Plan → Approval → Execution → Findings → Finding Detail → Report.
            The run keeps playing while you move between them; when it reaches a gate the app opens the screen that
            decides it.
          </p>
        </DocSection>
        <DocSection title="What is simulated and what is real">
          <ul>
            <li>
              <strong>The scripted run is simulated.</strong> Without a model, no scanner runs and no network traffic
              goes to the target. The target you type still picks the template, builds the scope, plan, approvals and
              findings, and the policy engine checks every request against the scope you approved. The demo data uses
              reserved example domains and fake, masked evidence.
            </li>
            <li>
              <strong>The process is real.</strong> Scope approval, the plan, the policy verdicts, the approval gates
              (with the HIGH-risk double check), triage, the audit trail and the exports work exactly as they would with
              a backend.
            </li>
            <li>
              <strong>The assistant runs locally.</strong> It uses the demo&apos;s saved assessments to show findings, progress and report cards.
            </li>
          </ul>
        </DocSection>
        <DocSection title="How the pieces fit">
          <DocTable
            caption="The parts of Reconix and what each one does"
            head={["Part", "What it does"]}
            rows={[
              { key: "Terminal (TUI)", value: "The screens, keys and slash commands. Built with Textual. It only asks; it never decides." },
              { key: "Store", value: "The authority: every decision goes through a store function that validates it. Holds the run, the scope, the policy engine, the approvals and the findings." },
              { key: "LLM layer", value: "Providers and the active model (/provider, /model). Keys are encrypted in ~/.reconix/llm.db; the model is called through LiteLLM and can only propose text." },
              { key: "Reports", value: "PDF, JSON and DOCX written to ./reports/, in the directory you started Reconix in." },
              { key: "Web dashboard", value: "Optional, started by /web. Read-only views of the saved runs and an AI Assistant. Assessments run and are decided in this TUI only." },
            ]}
          />
        </DocSection>
        <DocSection title="Where things are">
          <ul>
            <li>
              The terminal: <Mono>reconix</Mono>, installed with uv. See <DocRef>Launching</DocRef> below.
            </li>
            <li>
              Reports: <Mono>./reports/&lt;assessment id&gt;.&lt;ext&gt;</Mono>, in the folder you launched from. See{" "}
              <DocRef>Exporting</DocRef> in Reports.
            </li>
            <li>
              Saved copies of every run, with secrets removed: <Mono>~/.reconix/assessments/</Mono>; the web dashboard
              (<Mono>/web</Mono>) reads them. See <DocRef>The web dashboard</DocRef> in Reports.
            </li>
            <li>
              Model settings: <Mono>~/.reconix/llm.db</Mono>, with API keys encrypted. See <DocRef>Configuration</DocRef>{" "}
              in AI models.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Where to go next">
          <ul>
            <li>
              <DocRef>Requirements</DocRef> and <DocRef>Installation</DocRef> below, then <DocRef>First steps</DocRef>.
            </li>
            <li>
              <DocRef>Terminal guide</DocRef> for the screens and keys, and <DocRef>Commands</DocRef> for every slash
              command.
            </li>
            <li>
              <DocRef>Security assessment guide</DocRef> for what happens between your request and the findings.
            </li>
          </ul>
        </DocSection>
      </>
    ),
  },
  requirements: {
    lede: "Run the demo on your computer with Python and Node.js.",
    body: <DocSection title="Requirements"><p>The terminal uses Python 3. The dashboard uses Node.js 20.9 or newer and npm. The launcher installs each app&apos;s dependencies on first use.</p></DocSection>,
  },
  installation: {
    lede: "Start from the root of the demo repository.",
    body: <DocSection title="Installation"><p>Open a terminal in the project folder. On Windows use PowerShell. On Linux and macOS use the Bash launcher.</p><Code>{`# Windows PowerShell
.\\setup.ps1 tui

# Linux or macOS
./setup.sh tui`}</Code></DocSection>,
  },
  launching: {
    lede: "Open the terminal or web dashboard.",
    body: <DocSection title="Launching"><p>Choose <Mono>tui</Mono> for the terminal or <Mono>web</Mono> for the dashboard. The dashboard opens a private local sign-in link. A fresh demo shows bundled sample runs.</p><Code>{`# Windows PowerShell
.\\setup.ps1 web

# Linux or macOS
./setup.sh web`}</Code></DocSection>,
  },
  "first-steps": {
    lede: "A first assessment on the demo target, gate by gate.",
    body: (
      <>
        <DocSection title="Before you start">
          <p>
            Everything below is simulated: the demo target is a reserved example domain, and no request leaves your
            machine. The screens, decisions and outputs are the real ones.
          </p>
        </DocSection>
        <DocSection title="Step by step">
          <Steps>
            <li>
              <strong>Start.</strong> Press <Kbd>Enter</Kbd> on the empty prompt to use the demo request, or type a target
              of your own (for example <Mono>https://staging.example.com</Mono>). The logo makes way for the conversation:
              your line, then Reconix&apos;s answer or a spinner while it reads the target. <Kbd>Ctrl+O</Kbd> lists the
              steps it finished.
            </li>
            <li>
              <strong>Template.</strong> The URL picks the Web URL template and Reconix drafts a scope manifest: what it
              will test, what it may do, what it will never touch, which tools. Choose <strong>Approve scope</strong>.
              (<strong>Edit manifest</strong> changes methods, excluded paths, ports, tools or the time limit;{" "}
              <strong>Reject</strong> tests nothing and starts over.)
            </li>
            <li>
              <strong>Plan.</strong> Every phase, the target login the tools will need, and each risky step with its exact
              request. <Kbd>Tab</Kbd> browses the steps. Choose <strong>Run plan</strong>: testing starts only now.
            </li>
            <li>
              <strong>Execution.</strong> Tasks move from queued to running to done with a live output underneath. The
              run pauses when it needs you: the <strong>target login</strong> opens a secure form (the demo&apos;s tools,
              Nuclei and OWASP ZAP, need a test account: email or username and password), and each{" "}
              <strong>gated action</strong> opens the Approval screen. <Kbd>Enter</Kbd> opens what the run waits for.
            </li>
            <li>
              <strong>Approval.</strong> The first gate is MEDIUM risk: <strong>Approve &amp; run</strong>. The second is
              HIGH risk: after Approve &amp; run a second dialog shows the exact request and asks again, with &quot;No, go
              back&quot; selected; choose <strong>Yes, run …</strong> to let it run. <Kbd>d</Kbd> shows the details (scope
              limits, exact request, audit trail).
            </li>
            <li>
              <strong>Findings.</strong> They appear as testing finds them. <Kbd>Enter</Kbd> opens one; <Kbd>f</Kbd>{" "}
              filters, <Kbd>s</Kbd> sorts, <Kbd>t</Kbd> triages. <Kbd>[</Kbd> and <Kbd>]</Kbd> step through findings on the
              detail screen.
            </li>
            <li>
              <strong>Report.</strong> When the run completes, press <Kbd>p</Kbd> to export the PDF report (or{" "}
              <Kbd>j</Kbd> JSON, <Kbd>w</Kbd> DOCX). The file lands in <Mono>./reports/</Mono> and a dialog offers to
              open it.
            </li>
          </Steps>
        </DocSection>
        <DocSection title="Getting around">
          <ul>
            <li>
              <Kbd>←</Kbd> / <Kbd>→</Kbd> move through the flow (while typing they move the cursor; with a step chat open
              they stay until <Kbd>Esc</Kbd> closes it, and they never decide a gate); <Kbd>Alt+1</Kbd>…<Kbd>Alt+8</Kbd> jump
              to a screen. A bare
              digit only picks a numbered menu choice; every choice has a number, and a red choice (Reject, Cancel) is selected by its number and needs Enter.
            </li>
            <li>
              <Kbd>/</Kbd> opens the command bar on any screen (suggestions appear inline on Start); <Kbd>?</Kbd> shows the
              keys of the screen you are on.
            </li>
            <li>
              <Mono>/assessments</Mono> lists every assessment of the session and reopens one where it stands;{" "}
              <Mono>/new</Mono> starts a fresh one.
            </li>
          </ul>
          <p>
            Next: <DocRef>The screens</DocRef>, or the full{" "}
            <DocRef>security assessment guide</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
};
