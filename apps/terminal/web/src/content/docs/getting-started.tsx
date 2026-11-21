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
              <strong>A model is optional.</strong> With a provider configured and a model active (
              <DocRef>/provider</DocRef>, <DocRef>/model</DocRef>),
              the chat lines you type during a run go to that model. With the backend harness installed as well,{" "}
              <DocRef>/assess</DocRef> hands a real assessment to an AI agent that
              runs tools through a Kali MCP server, behind the same scope approval.
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
    lede: "What you need to run Reconix, and what you need only to build it from source.",
    body: (
      <>
        <DocSection title="Your machine">
          <ul>
            <li>
              <strong>A terminal with a dark background</strong> and a font with box-drawing glyphs (JetBrains Mono or
              any Nerd font). On Windows, use Windows Terminal.
            </li>
            <li>
              <strong>Docker Engine with Compose v2</strong>, for the Kali tool container and the services that run
              beside it (PostgreSQL, Qdrant, Ollama). The installer starts them. Every port is published on{" "}
              <Mono>127.0.0.1</Mono> only, and the tool container has no published port and no internet: it sits on
              internal networks.
            </li>
            <li>
              <strong>Disk for those images</strong>, plus whatever a local model needs if you run one.
            </li>
          </ul>
        </DocSection>
        <DocSection title="To build from source">
          <ul>
            <li>
              <strong>uv</strong> to install the terminal application in an isolated tool environment; uv manages its
              Python 3.12 runtime and dependencies.
            </li>
            <li>
              <strong>Node.js 20.9 or later</strong> with npm, only for the local dashboard. The first <Mono>/web</Mono>{" "}
              runs <Mono>npm install</Mono> in <Mono>apps/web/</Mono>, which takes a few minutes.
            </li>
            <li>
              <strong>Git</strong> to clone the repository.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Model access">
          <p>
            An OpenAI-compatible endpoint for the steps that need language understanding: an API key for OpenAI,
            Anthropic or DeepSeek, a local Ollama, or any other OpenAI-compatible endpoint. You add the provider and
            pick the model inside the terminal, not in a file. See <DocRef>AI models</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Optional, by feature">
          <DocTable
            caption="What each optional feature needs"
            head={["Feature", "Needs"]}
            rows={[
              { key: "PDF export", value: <>WeasyPrint (a Python package with system libraries), or a Chrome/Chromium browser on the machine: Reconix looks for google-chrome, google-chrome-stable, chromium, chromium-browser and chrome on the PATH, the usual Linux and macOS install paths, and Chrome or Edge on Windows. <Mono>RECONIX_CHROME</Mono> points at another binary. Without either, the PDF button reads &quot;not installed&quot;.</> },
              { key: "/assess (the AI agent)", value: <>A model, a reachable Kali MCP server (the <Mono>KALI_MCP_*</Mono> settings) and the backend harness, which is not part of this release: without it <Mono>/assess</Mono> runs the scripted assessment instead. See <DocRef>The AI agent</DocRef>.</> },
            ]}
          />
        </DocSection>
        <DocSection title="Authorization">
          <p>Written authorization for every target you plan to assess.</p>
          <Callout variant="warning" title="Authorized use only">
            Reconix enforces the scope you approve, but the authorization itself comes from you or your
            organization. The scripted run enforces it at every gate; the AI agent is checked against it on every tool
            call (target host, tool set, the time limit, methods and excluded paths on web scopes, ports on network
            scopes), but the per-action approval gates are not applied to it. See <DocRef>Authorized use</DocRef>.
          </Callout>
        </DocSection>
      </>
    ),
  },
  installation: {
    lede: "One command installs the reconix command and the containers it runs its tools in.",
    notice:
      "The installer ships with v1.0.0. Until then, install from source — the second half of this page.",
    body: (
      <>
        <DocSection title="Install Reconix">
          <p>
            <strong>Linux and macOS</strong>
          </p>
          <Code>{`curl -fsSL https://reconix.com/install.sh | bash`}</Code>
          <p>
            <strong>Windows (PowerShell)</strong>
          </p>
          <Code>{`irm https://reconix.com/install.ps1 | iex`}</Code>
          <p>
            The installer puts the <Mono>reconix</Mono> command on your PATH and starts the containers it needs: the
            Kali tool container and the services beside it. It needs Docker already running; see{" "}
            <DocRef>Requirements</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Start it where the reports should go">
          <Code>{`mkdir -p ~/engagements/acme && cd ~/engagements/acme
reconix`}</Code>
          <p>
            Reports are written to a <Mono>reports/</Mono> folder inside the directory you start Reconix in, so start it
            in the folder that belongs to the engagement. The Start screen opens with the Reconix logo and a prompt;{" "}
            <Kbd>Ctrl+Q</Kbd> quits. Saved copies of every run go to <Mono>~/.reconix/assessments/</Mono> wherever you
            started from.
          </p>
        </DocSection>
        <DocSection title="Add a model">
          <p>
            In the terminal, add a provider with <Mono>/provider</Mono> and pick its model with <Mono>/model</Mono>. API
            keys are entered there and stored encrypted in <Mono>~/.reconix/llm.db</Mono>, never in a file you edit by
            hand. See <DocRef>AI models</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Point it at the Kali MCP server">
          <p>
            An installed Reconix reads its Kali MCP settings from the environment, so export them in the shell you start
            it from (or your shell profile):
          </p>
          <Code>{`export KALI_MCP_TRANSPORT=http
export KALI_MCP_URL=http://127.0.0.1:8080/mcp
export KALI_MCP_AUTH_TOKEN=…        # if the server requires one
reconix`}</Code>
          <Callout variant="warning" title="Not a .env file">
            A <Mono>.env</Mono> file is read only next to a source checkout, never from the directory you launch in. On
            an installed Reconix, set these as real environment variables. Never put an API key in either: provider keys
            belong in <Mono>/provider</Mono>, which encrypts them.
          </Callout>
        </DocSection>
        <DocSection title="Install from source">
          <p>
            For a pre-release build, or to work on Reconix. <strong>Linux and macOS</strong>:
          </p>
          <Code>{`git clone https://github.com/14th-Generation-Advanced-Course/reconix-core-backend.git
cd reconix-core-backend/apps/tui
uv tool install .
reconix`}</Code>
          <p>
            <strong>Windows 10 and 11</strong>, in PowerShell in Windows Terminal:
          </p>
          <Code>{`git clone https://github.com/14th-Generation-Advanced-Course/reconix-core-backend.git
cd reconix-core-backend\\apps\\tui
uv tool install .
reconix`}</Code>
          <p>
            If scripts are blocked, allow them for your user first: <Mono>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</Mono>.
          </p>
          <Callout>
            uv keeps the terminal app in its isolated tool environment. When the TUI opens the web dashboard,
            it passes that environment&apos;s Python to the dashboard automatically.
          </Callout>
        </DocSection>
        <DocSection title="From source: settings and extras">
          <Code>{`cp .env.example .env                 # the model and Kali MCP settings (edit it)
cd ../..
uv sync --package reconix-tui --group dev   # test and development dependencies`}</Code>
          <p>
            In a checkout, <Mono>.env</Mono> at <Mono>apps/tui/.env</Mono> seeds the built-in &quot;Reconix&quot;
            provider (<Mono>LLM_BASE_URL</Mono>, <Mono>LLM_MODEL</Mono>) and configures the agent&apos;s Kali MCP
            server. API keys are never written to it. A real environment variable wins over anything in the file.
          </p>
        </DocSection>
      </>
    ),
  },
  launching: {
    lede: "How to start the terminal, where it writes, and the environment variables it reads.",
    body: (
      <>
        <DocSection title="Start the terminal">
          <Code>{`reconix`}</Code>
          <p>
            <strong>Where you start it matters:</strong> reports are written to a <Mono>reports/</Mono> folder in the
            current directory, so start Reconix in the folder that belongs to the engagement. Everything else is kept
            under your home folder and does not depend on the directory (<DocRef>Where things are</DocRef>).
          </p>
          <p>In a source checkout, install the current code with uv, then start it with:</p>
          <Code>{`uv tool install --force .
reconix`}</Code>
          <p>
            From a checkout, <Mono>/web</Mono> starts the dashboard from <Mono>apps/web/</Mono>, next to{" "}
            <Mono>apps/tui/</Mono>.
          </p>
        </DocSection>
        <DocSection title="Quit">
          <p>
            <Kbd>Ctrl+Q</Kbd> or <Mono>/quit</Mono> (alias <Mono>/exit</Mono>). On quit, every started assessment of the
            session is saved once more and marked closed, and a web dashboard that this terminal started is stopped.
          </p>
        </DocSection>
        <DocSection title="Environment variables">
          <DocTable
            caption="Environment variables the terminal reads"
            head={["Variable", "Meaning"]}
            rows={[
              { key: "RECONIX_DATA_DIR", value: <>Where saved copies go (default <Mono>~/.reconix/assessments</Mono>). The folder is created 0700 and each file is 0600; a folder of yours with looser permissions is tightened to 0700, and one that belongs to another user is refused.</> },
              { key: "RECONIX_SAVE", value: <><Mono>0</Mono>, <Mono>false</Mono>, <Mono>no</Mono> or <Mono>off</Mono> turns saving off.</> },
              { key: "RECONIX_WEB_URL_FILE", value: <>Where the dashboard leaves its sign-in link for <Mono>/web</Mono> (default <Mono>~/.reconix/web.url</Mono>). Only a loopback http link is accepted.</> },
              { key: "RECONIX_WEB_LOG", value: <>The dashboard&apos;s log when <Mono>/web</Mono> starts it (default <Mono>~/.reconix/web.log</Mono>).</> },
              { key: "RECONIX_WEB_PORT", value: <>The port the dashboard listens on, on <Mono>127.0.0.1</Mono> only (default <Mono>3100</Mono>). Read by its own launcher, which <Mono>/web</Mono> starts.</> },
              { key: "RECONIX_CHROME", value: "A Chrome/Chromium binary for the PDF export, when it is not on the PATH." },
              { key: "LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT", value: <>The built-in &quot;Reconix&quot; provider&apos;s endpoint, model and timeout (defaults <Mono>http://localhost:11434/v1</Mono> and a 120-second timeout). See <DocRef>Configuration</DocRef>.</> },
              { key: "LLM_DB, LLM_KEY_FILE", value: <>Where providers and the encryption key are kept (defaults <Mono>~/.reconix/llm.db</Mono> and <Mono>~/.reconix/llm.key</Mono>).</> },
              { key: "OLLAMA_BASE_URL", value: <>The default base URL of the Ollama provider (<Mono>http://localhost:11434</Mono>).</> },
              { key: "KALI_MCP_*, HARNESS_DB_PATH", value: <>The AI agent&apos;s Kali MCP server and its database (default <Mono>~/.reconix/harness.db</Mono>). See <DocRef>The AI agent</DocRef>.</> },
            ]}
          />
          <p>
            Set these in the shell you start Reconix in, or in your shell profile. A source checkout can put them in{" "}
            <Mono>apps/tui/.env</Mono> instead; a real environment variable always wins over the file.
          </p>
        </DocSection>
        <DocSection title="In the browser">
          <p>
            The web dashboard&apos;s <strong>Terminal</strong> page runs this same terminal in a browser tab, with the same
            screens, commands and gates, once you are signed in with the link the dashboard prints. Inside it,{" "}
            <Mono>/web</Mono> only tells you that you are already in the dashboard.
          </p>
        </DocSection>
      </>
    ),
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
