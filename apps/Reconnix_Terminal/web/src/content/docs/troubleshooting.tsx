import { Callout, Code, DocRef, DocSection, DocTable, Kbd, Mono } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";

export const troubleshooting: GroupContent = {
  "model-connection": {
    lede: "A provider tests Unreachable, a model cannot be activated, or a chat line falls back to the built-in reply.",
    body: (
      <>
        <DocSection title="Read the test result">
          <p>
            <Mono>/provider test &lt;id&gt;</Mono> saves a status and a short, redacted detail. Each one points somewhere:
          </p>
          <DocTable
            caption="Unreachable details and what to check"
            head={["Detail", "Check"]}
            rows={[
              { key: "connection refused", value: <>Nothing listens at the base URL. Is the server running? For Ollama, is it on <Mono>http://localhost:11434</Mono> (or your <Mono>OLLAMA_BASE_URL</Mono>)? For the Reconix provider, is <Mono>LLM_BASE_URL</Mono> in <Mono>.env</Mono> right (most servers end in <Mono>/v1</Mono>)?</> },
              { key: "timed out", value: "No answer within a request's ten-second limit: a firewall, a sleeping server or a slow network." },
              { key: "bad API key (unauthorized)", value: <>The endpoint refused the key. Update it with <Mono>/provider set &lt;id&gt;</Mono>; the hint (<Mono>sk-…3f9a</Mono>) tells you which key is saved.</> },
              { key: "model not found", value: <>The model name is not known at the endpoint. For Ollama, <Mono>ollama pull &lt;model&gt;</Mono> first; for the Reconix provider, check <Mono>LLM_MODEL</Mono>; for a frontier provider, check the spelling of the model.</> },
              { key: "could not reach the model", value: "Another provider or transport error. Try the endpoint from the command line with the same key and model." },
            ]}
          />
        </DocSection>
        <DocSection title="The model cannot be activated">
          <p>
            &quot;Test the connection first — the provider is not reachable.&quot;: <Mono>/model</Mono> only activates a
            model of a Reachable provider; test it again after fixing the cause above. &quot;&lt;model&gt; is not
            configured for &lt;Provider&gt;.&quot;: add the model to the provider&apos;s list with{" "}
            <Mono>/provider set &lt;id&gt;</Mono>, then test again.
          </p>
        </DocSection>
        <DocSection title="Chat falls back to the built-in reply">
          <p>
            &quot;LLM unavailable (&lt;reason&gt;). Showing the built-in reply.&quot; means the call to the active model failed
            at that moment; the reason is one of the details above, or &quot;empty response from the model&quot; or
            &quot;the model&apos;s reply was too long&quot; (over 8,000 characters). The run is unaffected. Test the provider
            again; if it is fine, retry the line.
          </p>
        </DocSection>
        <DocSection title="Changing .env">
          <p>
            <Mono>.env</Mono> is read once at start, and the Reconix provider&apos;s base URL and model are copied into{" "}
            <Mono>llm.db</Mono> when you save the provider; tests and chat read that stored row. So after editing{" "}
            <Mono>LLM_BASE_URL</Mono> or <Mono>LLM_MODEL</Mono>: quit, start the terminal again, then{" "}
            <Mono>/provider set reconix</Mono> to re-save it (leave the key blank to keep the saved one; the status goes
            back to Untested) and test it again. Only <Mono>LLM_TIMEOUT</Mono> applies after a restart alone.
          </p>
        </DocSection>
      </>
    ),
  },
  "missing-tools": {
    lede: "A button reads “not installed”, or a command says what it needs.",
    body: (
      <>
        <DocSection title="No PDF">
          <p>
            The PDF button reads &quot;PDF (not installed)&quot; and <Mono>/export pdf</Mono> says &quot;PDF reports aren&apos;t
            available.&quot; or &quot;PDF export needs WeasyPrint or a Chrome/Chromium browser.&quot;. Install one of the
            two:
          </p>
          <ul>
            <li>
              <strong>A browser:</strong> Chrome or Chromium on the PATH (google-chrome, google-chrome-stable, chromium,
              chromium-browser, chrome), in the usual install locations on Linux and macOS, or Chrome/Edge on Windows. If
              it lives elsewhere, point <Mono>RECONIX_CHROME</Mono> at the binary and restart.
            </li>
            <li>
              <strong>WeasyPrint:</strong> <Mono>pip install weasyprint</Mono>, which needs system libraries (pango, cairo).
            </li>
          </ul>
          <p>
            Meanwhile, export the Word document (<Kbd>w</Kbd>) or the JSON (<Kbd>j</Kbd>): neither needs a PDF engine.
          </p>
        </DocSection>
        <DocSection title="No DOCX">
          <p>
            &quot;DOCX (not installed)&quot;: <Mono>python-docx</Mono> is installed with Reconix, so the install skipped its
            dependencies. Run <Mono>pip install -r requirements.txt</Mono> (or <Mono>pip install python-docx</Mono>) in the
            same virtual environment, then restart.
          </p>
        </DocSection>
        <DocSection title="No AI agent">
          <p>
            &quot;The harness backend isn&apos;t installed (pip install -e backend).&quot;: install it from the repository
            root. The agent also needs a reachable Kali MCP server in <Mono>.env</Mono> and an active model; see{" "}
            <DocRef>The AI agent</DocRef>.
          </p>
        </DocSection>
        <DocSection title="No Node.js">
          <p>
            &quot;The web dashboard needs Node.js (node and npm).&quot;: install Node.js 20 or later, or run the dashboard on
            another machine. See <DocRef>The web dashboard</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  "policy-errors": {
    lede: "A request was blocked, an edit was refused, or an approval would not record.",
    body: (
      <>
        <DocSection title="A request was blocked">
          <p>
            A red line in the live output and a banner mean the policy engine refused a request the run proposed. This
            is the system working: the request was outside the approved scope (another host, an excluded path, a method
            or port not allowed), and it was never sent; once the scope&apos;s time limit is reached the run stops
            altogether. The reasons are listed in{" "}
            <DocRef>Policy checks</DocRef>; the verdicts are in{" "}
            <Mono>/audit</Mono>, the report and the saved copy the dashboard reads. If the block was wrong, the scope was: start
            a new assessment and edit the manifest before approving it.
          </p>
        </DocSection>
        <DocSection title="An edit was refused">
          <DocTable
            caption="Messages when a step's parameter or the scope is edited"
            head={["Message", "What to do"]}
            rows={[
              { key: "Blocked by policy: <reason>.", value: "The new path, host:port or file is outside the approved scope. Choose one inside it; the scope itself cannot be widened after approval." },
              { key: "Edit an action on the plan, or when Reconix asks you to approve it.", value: "Edits are only possible while the run waits at the plan or at that action's gate." },
              { key: "This action can't be edited now. / This action has nothing to edit. / This action was already decided.", value: "Nothing to change: the step has no editable value, or it was decided." },
              { key: "Enter the path. / That path can't be used: one value, no spaces, at most 200 characters.", value: "One plain value; a host:port must look like host:port, a file like a repository path." },
              { key: "The scope can only be edited while it waits for approval.", value: "The manifest is locked once approved." },
              { key: "Keep at least one allowed method. / … one allowed port. / … one tool.", value: "A scope needs at least one of each." },
              { key: "Not an HTTP method: … / Not a valid port: … / Excluded paths start with '/': … / The time limit is a number of minutes.", value: "Fix the value in the form; it stays open." },
            ]}
          />
        </DocSection>
        <DocSection title="An approval would not record">
          <p>
            &quot;This approval is for a different request.&quot; and &quot;The request changed after it was shown. Review it
            again.&quot; mean the request on screen is not the one the approval was bound to (for example after Edit
            params): read it again and approve what is shown now. &quot;HIGH-risk actions need the confirmation step
            first.&quot; means the second dialog was left without a Yes. See{" "}
            <DocRef>Approval gates</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  "unknown-commands": {
    lede: "“Unknown command”, a path that looks like a command, and commands that need a run.",
    body: (
      <>
        <DocSection title="Unknown command">
          <p>
            &quot;Unknown command /name. Type / to see the list.&quot; (in the command bar: &quot;… — pick one from the
            list.&quot;). The name is not a command or an alias. Type <Mono>/</Mono> and pick from the suggestions, or
            see the <DocRef>command reference</DocRef>. Old names are gone: <Mono>/scope</Mono> is now{" "}
            <Mono>/template</Mono>.
          </p>
        </DocSection>
        <DocSection title="The path rule">
          <p>
            A line starting with <Mono>/</Mono> whose first word contains another slash is <strong>not</strong> a command:{" "}
            <Mono>/home/me/app</Mono> or <Mono>/srv/repo</Mono> is a local path and starts a Source Code assessment (or is
            refused like any other target when it cannot be read). So a mistyped command with a slash in it, such as{" "}
            <Mono>/export/pdf</Mono>, is treated as a path; write <Mono>/export pdf</Mono>.
          </p>
        </DocSection>
        <DocSection title="The command needs something first">
          <DocTable
            caption="Commands that depend on the run's state"
            head={["Message", "Meaning"]}
            rows={[
              { key: "No findings yet. They appear as testing finds them.", value: "/finding has nothing to open: run the plan first." },
              { key: "Nothing to choose from yet.", value: "A command's list is empty." },
              { key: "The report is available once the assessment is complete.", value: "/export before the run completed." },
              { key: "No assessment is running.", value: "Stopping with nothing to stop." },
              { key: "A template can only be chosen when Reconix asks for one. / This assessment already has a template.", value: "/template <id> outside the template gate; /template without an id starts over when the current one is past it." },
              { key: "Started a new assessment. The previous one is under /assessments.", value: "Not an error: /template started a fresh assessment because the current one was already approved or stopped." },
            ]}
          />
        </DocSection>
        <DocSection title="Keys that seem dead">
          <p>
            <Kbd>1</Kbd>…<Kbd>8</Kbd> jump between screens only when no menu has focus (in a menu they pick a numbered
            choice); <Kbd>?</Kbd> on the Start prompt works only when it is empty; <Kbd>5</Kbd> and <Kbd>→</Kbd> skip
            Execution until the plan has run. <Kbd>?</Kbd> lists what works right now.
          </p>
        </DocSection>
      </>
    ),
  },
  "report-failures": {
    lede: "An export is refused, the file cannot be written, or it will not open.",
    body: (
      <>
        <DocSection title="Refused before writing">
          <ul>
            <li>
              <strong>&quot;The report is available once the assessment is complete.&quot;</strong> The run is still going,
              or it was stopped (a stopped assessment never completes; its partial findings stay on the Findings screen
              and in the saved copy). Let the plan finish, or start a new assessment.
            </li>
            <li>
              <strong>A format that does not exist</strong> is never refused: <Mono>/export</Mono> with an unknown argument
              opens the &quot;Export the report as…&quot; menu instead.
            </li>
            <li>
              <strong>&quot;&lt;Format&gt; reports aren&apos;t available.&quot;</strong> The format&apos;s engine is missing:
              see <DocRef>Missing tools</DocRef>.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Failed while writing">
          <ul>
            <li>
              <strong>&quot;Couldn&apos;t render the PDF with the browser.&quot; / &quot;The browser did not produce a
              PDF.&quot;</strong> Chrome was found but printing failed (a broken install, no write access to a temp
              folder). Export DOCX instead, or set <Mono>RECONIX_CHROME</Mono> to another browser.
            </li>
            <li>
              <strong>An operating-system error</strong> (permission denied, disk full) is shown as it is: the file goes to{" "}
              <Mono>./reports/</Mono> under the folder you launched from, so launch from a folder you can write to.
            </li>
            <li>
              <strong>&quot;The assessment id can&apos;t be used as a file name.&quot; / &quot;Reports can only be saved in
              the reports folder.&quot;</strong> Guards against an id that could leave <Mono>./reports/</Mono>; they do not
              occur with ids Reconix generates.
            </li>
          </ul>
        </DocSection>
        <DocSection title="It will not open">
          <p>
            &quot;Couldn&apos;t open it. The report is saved at ./reports/…&quot;: the file is there; the machine has no
            browser or default app for it, or the terminal cannot launch one (for example in the dashboard&apos;s Terminal
            page). Open the path yourself.
          </p>
        </DocSection>
      </>
    ),
  },
  "web-dashboard": {
    lede: "/web cannot start the dashboard, or the browser does not open.",
    body: (
      <>
        <DocSection title="What /web does">
          <p>
            The first <Mono>/web</Mono> of a session starts <Mono>npm run dev</Mono> in <Mono>web/</Mono> in the background
            (after <Mono>npm install</Mono> if packages are missing, which takes a few minutes), waits up to three minutes
            for it to answer, and the dashboard opens your browser itself. Later calls open the running dashboard. Its
            output goes to <Mono>~/.reconix/web.log</Mono> (or <Mono>RECONIX_WEB_LOG</Mono>), never to the terminal.
          </p>
        </DocSection>
        <DocSection title="The messages">
          <DocTable
            caption="/web messages and what to do"
            head={["Message", "What to do"]}
            rows={[
              { key: "The web dashboard folder (web/) isn't next to this install.", value: <>Run Reconix from the cloned repository, where <Mono>web/package.json</Mono> exists.</> },
              { key: "The web dashboard needs Node.js (node and npm).", value: <>Install Node.js 20 or later so <Mono>node</Mono> and <Mono>npm</Mono> are on the PATH, or start it yourself: <Mono>cd web &amp;&amp; npm run dev</Mono>.</> },
              { key: "Another web dashboard already uses its port on 127.0.0.1 (an older one left running?). Stop it, then run /web again.", value: <>The launcher exited with code 2: its port is taken, usually by a dashboard from an earlier session. Find it with <Mono>ss -ltnp</Mono> (or your OS&apos;s equivalent) and stop that process, then <Mono>/web</Mono> again.</> },
              { key: "Couldn't install the web dashboard's packages.", value: <><Mono>npm install</Mono> failed; the log has the reason (network, Node version).</> },
              { key: "The web dashboard stopped while starting.", value: "It exited for another reason; read the log." },
              { key: "The web dashboard is taking a while to start.", value: "Three minutes passed without an answer; a first compile can be slow. Wait, then /web again, or read the log." },
              { key: "The web dashboard is still starting. It opens in your browser when it's ready.", value: "Not an error: a start is in progress." },
              { key: "Open it in your browser: http://127.0.0.1:…", value: "The dashboard runs but no browser could be launched here (for example over SSH): open the link yourself." },
            ]}
          />
        </DocSection>
        <DocSection title="Reading the log">
          <Code>{`tail -n 50 ~/.reconix/web.log`}</Code>
          <p>
            The log is readable by your user only. It may mention the dashboard&apos;s address; the sign-in link itself is
            printed only to a terminal, never to the log.
          </p>
        </DocSection>
        <DocSection title="Running it yourself">
          <Code>{`cd web && npm install && npm run dev       # prints a sign-in link; /web opens the same one
RECONIX_DATA_DIR=sample-data npm run dev    # browse the bundled sample assessments
npm run dev -- --no-open                    # print the link without opening a browser`}</Code>
          <Callout>
            The dashboard binds to 127.0.0.1 only and refuses other Host headers. A dashboard the terminal started stops
            when the terminal quits; one you started yourself keeps running.
          </Callout>
        </DocSection>
      </>
    ),
  },
};
