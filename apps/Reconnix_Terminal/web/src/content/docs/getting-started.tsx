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
              findings, and the policy engine checks every request against the scope you approved. The sample data uses
              reserved example domains and synthetic, masked evidence.
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
              { key: "Backend harness", value: "Optional (backend/). The AI agent behind /assess: plans, runs tools through a Kali MCP server, reports findings into the store." },
              { key: "Reports", value: "PDF, JSON and DOCX written to ./reports/." },
              { key: "Web dashboard", value: "Optional (web/, started by /web). Read-only views of the saved runs and an AI Assistant. Assessments run and are decided in this TUI only." },
            ]}
          />
        </DocSection>
        <DocSection title="Where things are">
          <ul>
            <li>
              The terminal: <Mono>python -m reconix</Mono> (or <Mono>reconix</Mono>, or <Mono>python run.py</Mono>). See{" "}
              <DocRef>Launching</DocRef> below.
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
    lede: "Python and a terminal are enough for the simulated run. The rest is optional, by feature.",
    body: (
      <>
        <DocSection title="Required">
          <ul>
            <li>
              <strong>Python 3.9 or later.</strong> The package depends on Textual, Rich, LiteLLM, cryptography and
              python-dotenv; <Mono>pip install -e .</Mono> installs them.
            </li>
            <li>
              <strong>A terminal with a dark background</strong> and a font with box-drawing glyphs (JetBrains Mono or a
              Nerd font). On Windows, use Windows Terminal.
            </li>
            <li>
              <strong>Git</strong> to clone the repository.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Optional, by feature">
          <DocTable
            caption="What each optional feature needs"
            head={["Feature", "Needs"]}
            rows={[
              { key: "PDF export", value: <>WeasyPrint (a Python package with system libraries), or a Chrome/Chromium browser on the machine: Reconix looks for google-chrome, google-chrome-stable, chromium, chromium-browser and chrome on the PATH, the usual Linux and macOS install paths, and Chrome or Edge on Windows. <Mono>RECONIX_CHROME</Mono> points at another binary. Without either, the PDF button reads &quot;not installed&quot;.</> },
              { key: "/web dashboard", value: <>Node.js 20 or later with npm. The first <Mono>/web</Mono> runs <Mono>npm install</Mono> in <Mono>web/</Mono>, which takes a few minutes.</> },
              { key: "A model", value: <>An API key for OpenAI, Anthropic or DeepSeek, a local Ollama, or any OpenAI-compatible endpoint. See <DocRef>AI models</DocRef>.</> },
              { key: "/assess (the AI agent)", value: <>A model, the backend harness (<Mono>pip install -e backend</Mono>, which needs <strong>Python 3.10 or later</strong>) and a reachable Kali MCP server configured in <Mono>.env</Mono>. See <DocRef>The AI agent</DocRef>.</> },
            ]}
          />
        </DocSection>
        <DocSection title="Authorization">
          <p>Written authorization for every target you plan to assess.</p>
          <Callout variant="warning" title="Authorized use only">
            The scripted run enforces the scope you approve. The AI agent is checked against it on every tool call
            (target host, tool set, the time limit, methods and excluded paths on web scopes, ports on network
            scopes), but the per-action approval gates are not applied to it. The authorization itself comes from you or your organization. See{" "}
            <DocRef>Authorized use</DocRef>.
          </Callout>
        </DocSection>
      </>
    ),
  },
  installation: {
    lede: "Clone the repository, create a virtual environment and install the package.",
    body: (
      <>
        <DocSection title="Linux and macOS">
          <Code>{`git clone https://github.com/SokpisethNhoeun/Reconnix_Terminal.git
cd Reconnix_Terminal
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .`}</Code>
        </DocSection>
        <DocSection title="Windows 10 and 11">
          <p>PowerShell, in Windows Terminal:</p>
          <Code>{`git clone https://github.com/SokpisethNhoeun/Reconnix_Terminal.git
cd Reconnix_Terminal
py -m venv .venv
.venv\\Scripts\\Activate.ps1
python -m pip install -e .`}</Code>
          <p>
            If scripts are blocked, allow them for your user first: <Mono>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</Mono>.
          </p>
        </DocSection>
        <DocSection title="Optional extras">
          <Code>{`pip install -r requirements-dev.txt  # pytest and pytest-asyncio (to run the tests)
pip install -e backend               # the AI agent's harness, for /assess
cp .env.example .env                 # the model and Kali MCP settings (edit it)`}</Code>
          <p>
            <Mono>.env</Mono> is only needed for a model: it seeds the built-in &quot;Reconix&quot; provider and configures the
            agent. API keys are never written to it; they are entered in the terminal with{" "}
            <DocRef>/provider</DocRef> and stored encrypted.
          </p>
        </DocSection>
        <DocSection title="Check the install">
          <Code>{`python -m reconix`}</Code>
          <p>
            The Start screen opens with the Reconix logo and a prompt. Press <Kbd>Ctrl+Q</Kbd> to quit. Next:{" "}
            <DocRef>Launching</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  launching: {
    lede: "Three equivalent ways to start the terminal, and the environment variables it reads.",
    body: (
      <>
        <DocSection title="Start the terminal">
          <p>With the virtual environment active, any of these starts the same application:</p>
          <Code>{`python -m reconix     # the module
reconix               # the command installed by pip install -e .
python run.py         # the launcher in the repository root`}</Code>
          <p>
            Run it from the repository folder: reports are written to <Mono>./reports/</Mono> relative to where you launch,
            and <Mono>/web</Mono> looks for the dashboard in <Mono>web/</Mono> next to the package.
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
              { key: "RECONIX_CHROME", value: "A Chrome/Chromium binary for the PDF export, when it is not on the PATH." },
              { key: "LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT", value: <>The built-in &quot;Reconix&quot; provider&apos;s endpoint, model and timeout, read from <Mono>.env</Mono>. See <DocRef>Configuration</DocRef>.</> },
              { key: "LLM_DB, LLM_KEY_FILE", value: <>Where providers and the encryption key are kept (defaults <Mono>~/.reconix/llm.db</Mono> and <Mono>~/.reconix/llm.key</Mono>).</> },
              { key: "OLLAMA_BASE_URL", value: <>The default base URL of the Ollama provider (<Mono>http://localhost:11434</Mono>).</> },
              { key: "KALI_MCP_*, HARNESS_DB_PATH", value: <>The AI agent&apos;s Kali MCP server and database, from <Mono>.env</Mono>. See <DocRef>The AI agent</DocRef>.</> },
            ]}
          />
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
    lede: "A first assessment on the example target, gate by gate.",
    body: (
      <>
        <DocSection title="Before you start">
          <p>
            Everything below is simulated: the example target is a reserved example domain, and no request leaves your
            machine. The screens, decisions and outputs are the real ones.
          </p>
        </DocSection>
        <DocSection title="Step by step">
          <Steps>
            <li>
              <strong>Start.</strong> Press <Kbd>Enter</Kbd> on the empty prompt to use the example request, or type a target
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
              run pauses when it needs you: the <strong>target login</strong> opens a secure form (the simulated tools,
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
              <Kbd>←</Kbd> / <Kbd>→</Kbd> move through the flow; <Kbd>1</Kbd>…<Kbd>8</Kbd> jump to a screen when no menu
              has focus.
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
