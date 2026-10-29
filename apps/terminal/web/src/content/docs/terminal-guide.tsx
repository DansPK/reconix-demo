import { Callout, Code, DocRef, DocSection, DocTable, Kbd, KeyTable, Mono } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";

export const terminalGuide: GroupContent = {
  screens: {
    lede: "Eight screens in one flow. The run plays on while you move between them.",
    body: (
      <>
        <DocSection title="The flow">
          <p className="font-mono text-xs text-foreground">
            1 Start → 2 Template → 3 Plan → 4 Approval → 5 Execution → 6 Findings → 7 Finding Detail → 8 Report
          </p>
          <p>
            The line under the top bar tracks it: <Mono>✓</Mono> done, <Mono>✕</Mono> stopped, <Mono>!</Mono> waiting for
            you, <Mono>●</Mono> the current step. The run is hosted by the app, not by a screen, so it keeps playing while
            you browse; when it reaches a gate, the app opens the screen that decides it (a gate that arrives while a
            dialog is open waits for the dialog to close). Execution opens only after the plan has run; until then{" "}
            <Kbd>←</Kbd>/<Kbd>→</Kbd> step over it.
          </p>
        </DocSection>
        <DocSection title="1 · Start">
          <p>
            The welcome: the logo, a three-step quickstart and the prompt. After your first line it becomes the
            conversation: your latest line on top, then Reconix&apos;s answer, or one spinner line while the run heads
            for its first gate (<Kbd>Ctrl+O</Kbd> expands the steps it finished). Slash-command suggestions appear inline
            above the prompt. What a typed line does is on <DocRef>The prompt</DocRef>.
          </p>
        </DocSection>
        <DocSection title="2 · Template">
          <p>
            Picks the kind of target and shows the drafted scope manifest. <Mono>/template</Mono> opens the four templates
            (Network, API, Source Code, Web URL) and asks for the target; a target typed on Start picks its template by
            its shape, and asks only when a bare hostname could be several. The manifest lists what will be tested, what
            may be done, what is excluded, the tools and the time limit; the menu offers Approve scope, Edit manifest and
            Reject, and on the API template Attach OpenAPI spec (a .json or .yaml OpenAPI 3 / Swagger 2 file or URL on the API&apos;s own host, read and never run; it cannot add a method to the scope) and, once one is attached, Replace or Remove OpenAPI spec. On the API template the form opens on its own once the scope is drafted, with the API base URL (prefilled; a different one re-drafts the scope) and an optional spec; leave the spec empty to skip it, or Cancel. Once approved the manifest is locked and the screen points to the plan. See{" "}
            <DocRef>Scope manifest</DocRef>.
          </p>
        </DocSection>
        <DocSection title="3 · Plan">
          <p>
            Every phase, the target login the tools may need, and each risky action with its exact request. The menu
            offers Run plan, Edit steps (change where a gated step runs) and Cancel; <Kbd>Tab</Kbd> moves between the menu
            and the step list. Testing starts only when you run the plan. See{" "}
            <DocRef>Plan and tools</DocRef>.
          </p>
        </DocSection>
        <DocSection title="4 · Approval">
          <p>
            One gated action at a time: its purpose, impact and exact request. MEDIUM risk asks once; HIGH risk asks, then
            double-checks the exact request with &quot;No, go back&quot; selected. <strong>View details</strong> is
            highlighted first so a stray Enter is harmless; <Kbd>d</Kbd> opens it directly; <Kbd>Esc</Kbd> decides later.
            See <DocRef>Approval gates</DocRef>.
          </p>
        </DocSection>
        <DocSection title="5 · Execution">
          <p>
            The live run: each task queued, running, paused or done (no percentages), a spinner with what Reconix is on
            and for how long, and the live output (time · who · message). The output follows new lines while you are at
            the bottom; scroll up to read and it stays put until <Kbd>End</Kbd>. <Kbd>Enter</Kbd> opens what the run waits
            for (a login form or an approval); <Kbd>Ctrl+C</Kbd> asks before stopping the run. See{" "}
            <DocRef>Execution</DocRef>.
          </p>
        </DocSection>
        <DocSection title="6 · Findings and 7 · Finding Detail">
          <p>
            The list: filter (<Kbd>f</Kbd>), sort (<Kbd>s</Kbd>), triage (<Kbd>t</Kbd>),
            open one (<Kbd>Enter</Kbd>), chat about the assessment (<Kbd>c</Kbd>). The detail: description, affected URL, evidence (masked), impact, remediation,
            references and CVSS; <Kbd>[</Kbd>/<Kbd>]</Kbd> step to the previous or next finding in the same filter and
            sort, <Kbd>r</Kbd> jumps to the report, <Kbd>c</Kbd> chats about the finding, <Kbd>←</Kbd> goes back to
            the list. See{" "}
            <DocRef>Understanding findings</DocRef>.
          </p>
        </DocSection>
        <DocSection title="8 · Report">
          <p>
            The executive summary, findings by severity, the key findings and the changes since the last assessment of
            the same target, with the export buttons (<Kbd>p</Kbd> PDF, <Kbd>j</Kbd> JSON, <Kbd>w</Kbd> DOCX) and{" "}
            <Kbd>c</Kbd> to chat about the assessment (<Mono>/web</Mono> opens the web dashboard). Exports are
            available once the assessment completes. See <DocRef>Reviewing results</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Dialogs and forms">
          <p>
            Questions are ↑/↓ menus with numbered choices and a description each; the recommended one is marked. Risky
            choices are unnumbered and default to the safe answer. &quot;Type something.&quot; records what you write as
            feedback (visible in <Mono>/audit</Mono>); &quot;Chat about this&quot; takes you to the prompt. Text input
            pop-ups (the target login, the scope edit, a step&apos;s parameter, a provider) have fields,
            an error line and Submit / Cancel; a value the store refuses keeps the form open with the reason. The
            contextual help (<Kbd>?</Kbd>) lists the keys of whatever has focus.
          </p>
        </DocSection>
      </>
    ),
  },
  keys: {
    lede: "The keys that work everywhere, and the ones each screen adds. Press ? on any screen for the same list.",
    body: (
      <>
        <DocSection title="Everywhere">
          <KeyTable
            caption="Keys that work on every screen"
            rows={[
              { key: <><Kbd>←</Kbd> / <Kbd>→</Kbd></>, value: "Previous / next screen in the flow (Execution is skipped until the plan has run)." },
              { key: <><Kbd>1</Kbd> … <Kbd>8</Kbd></>, value: "Jump to a screen when no menu has focus: 1 Start, 2 Template, 3 Plan, 4 Approval, 5 Execution, 6 Findings, 7 Finding Detail, 8 Report." },
              { key: <Kbd>/</Kbd>, value: "Command suggestions: inline above the Start prompt, a command bar on every other screen." },
              { key: <Kbd>?</Kbd>, value: "Toggle the help for the current screen (on Start: when the prompt is empty)." },
              { key: <Kbd>Ctrl+O</Kbd>, value: "Expand or collapse the steps Reconix finished, under its spinner line." },
              { key: <Kbd>Ctrl+Q</Kbd>, value: "Quit." },
            ]}
          />
        </DocSection>
        <DocSection title="The prompt and the command bar">
          <KeyTable
            caption="Keys in the prompt and the command bar"
            rows={[
              { key: <Kbd>/</Kbd>, value: "Show command suggestions as you type." },
              { key: <><Kbd>↑</Kbd> / <Kbd>↓</Kbd></>, value: "Prompt history, or move in the open menu." },
              { key: <Kbd>Tab</Kbd>, value: "Complete the highlighted command." },
              { key: <Kbd>Enter</Kbd>, value: "Send the request or run the command." },
              { key: <Kbd>Esc</Kbd>, value: "Close the menu, then clear the prompt (in the command bar: close it)." },
              { key: <Kbd>Ctrl+R</Kbd>, value: "Search the prompt history." },
            ]}
          />
        </DocSection>
        <DocSection title="Menus, lists and dialogs">
          <KeyTable
            caption="Keys in menus, lists and dialogs"
            rows={[
              { key: <><Kbd>↑</Kbd> / <Kbd>↓</Kbd></>, value: "Move between choices, suggestions, list rows and table rows." },
              { key: <Kbd>Enter</Kbd>, value: "Confirm the highlighted choice." },
              { key: <><Kbd>1</Kbd> … <Kbd>9</Kbd></>, value: "Pick a numbered choice in the focused menu." },
              { key: "type", value: "On “Type something.”, write an answer, then Enter." },
              { key: <Kbd>Esc</Kbd>, value: "Cancel a dialog or form." },
              { key: <><Kbd>PgUp</Kbd> / <Kbd>PgDn</Kbd></>, value: "Scroll a long dialog." },
            ]}
          />
        </DocSection>
        <DocSection title="Per screen">
          <DocTable
            caption="Keys each screen adds"
            head={["Screen", "Keys"]}
            rows={[
              { key: "Start", value: <><Kbd>Enter</Kbd> start the assessment (or send the line); <Kbd>?</Kbd> help when the prompt is empty.</> },
              { key: "Template", value: <><Kbd>Enter</Kbd> select; <Kbd>Esc</Kbd> back.</> },
              { key: "Plan", value: <><Kbd>Enter</Kbd> select; <Kbd>Tab</Kbd> switch between the menu and the steps; <Kbd>Esc</Kbd> back.</> },
              { key: "Approval", value: <><Kbd>Enter</Kbd> select; <Kbd>d</Kbd> details (scope limits, exact request, audit trail); <Kbd>Esc</Kbd> decide later.</> },
              { key: "Execution", value: <><Kbd>Enter</Kbd> continue (open what the run waits for); <Kbd>Ctrl+C</Kbd> stop the run, after a confirmation; <Kbd>End</Kbd> jump to the newest output line and follow it again; <Kbd>Esc</Kbd> back to the plan.</> },
              { key: "Findings", value: <><Kbd>Enter</Kbd> open the finding; <Kbd>f</Kbd> filter; <Kbd>s</Kbd> cycle the sort; <Kbd>t</Kbd> triage; <Kbd>c</Kbd> chat; <Kbd>Esc</Kbd> back.</> },
              { key: "Finding Detail", value: <><Kbd>t</Kbd> triage; <Kbd>r</Kbd> report; <Kbd>c</Kbd> chat about this finding; <Kbd>[</Kbd> / <Kbd>]</Kbd> previous / next finding (same filter and sort); <Kbd>←</Kbd> or <Kbd>Esc</Kbd> back to the list.</> },
              { key: "Report", value: <><Kbd>p</Kbd> PDF, <Kbd>j</Kbd> JSON, <Kbd>w</Kbd> DOCX; <Kbd>c</Kbd> chat; <Kbd>Esc</Kbd> back.</> },
            ]}
          />
          <Callout>
            A screen&apos;s own binding wins over the global one: on Finding Detail <Kbd>←</Kbd> goes back to the list, not
            to the previous screen.
          </Callout>
        </DocSection>
      </>
    ),
  },
  "command-bar": {
    lede: "Slash commands run from the prompt on Start and from the command bar everywhere else.",
    body: (
      <>
        <DocSection title="Opening it">
          <p>
            Press <Kbd>/</Kbd>. On the Start screen the suggestions appear inline above the prompt; on every other screen
            a command bar opens over the screen with <Mono>/</Mono> already typed. <Kbd>Esc</Kbd> closes it. The command
            runs after the bar closes, so a command that switches screens lands on the right one.
          </p>
        </DocSection>
        <DocSection title="Filtering, completing, running">
          <ul>
            <li>
              Keep typing to filter. Matches are ranked: an exact name or alias first (so Enter on <Mono>/finding</Mono>{" "}
              runs <Mono>/finding</Mono>, not <Mono>/findings</Mono>), then names starting with what you typed, then
              aliases starting with it, then anything containing it. Case does not matter: <Mono>/Plan</Mono> works.
            </li>
            <li>
              <Kbd>↑</Kbd>/<Kbd>↓</Kbd> move through the suggestions, <Kbd>Tab</Kbd> completes the highlighted command,{" "}
              <Kbd>Enter</Kbd> runs it.
            </li>
            <li>
              An argument follows the name: <Mono>/export pdf</Mono>, <Mono>/finding 001</Mono>, <Mono>/new https://…</Mono>.
              Extra spaces are ignored.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Commands that ask">
          <p>
            A command whose argument is picked from a list asks with a menu when you leave it out:{" "}
            <Mono>/finding</Mono> asks &quot;Which finding?&quot; and <Mono>/export</Mono> &quot;Export the report as…&quot;.
            An argument that matches none of the choices opens the same menu (it is never an error). If there is nothing
            to choose from yet, it says so (&quot;No findings yet. They appear as testing finds them.&quot;). <Mono>/template</Mono> only suggests the template ids: without one it opens the Template screen.
            Unavailable choices are shown dimmed and cannot be picked.
          </p>
        </DocSection>
        <DocSection title="History">
          <p>
            Every accepted line (a request or a command) is remembered for the session. On the prompt, with no menu
            open, <Kbd>↑</Kbd>/<Kbd>↓</Kbd> walk through the history and <Kbd>Ctrl+R</Kbd> searches it; the example request
            is the first entry, so <Kbd>↑</Kbd> on a fresh start recalls it.
          </p>
        </DocSection>
        <DocSection title="Unknown commands">
          <p>
            A name that is not a command shows &quot;Unknown command /name. Type / to see the list.&quot; (in the bar:
            &quot;… — pick one from the list.&quot;). One exception: a line whose name contains a slash, such as{" "}
            <Mono>/home/me/app</Mono>, is a local path, which is a target, not a command. See{" "}
            <DocRef>Unknown commands</DocRef>.
          </p>
          <Code>{`/export pdf        # export the report as PDF
/finding 001       # open finding 001
/provider test ollama
/model openai/gpt-4o-mini`}</Code>
          <p>
            Every command is described in the <DocRef>command reference</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  prompt: {
    lede: "What a line typed at the Start prompt does depends on what it is and where the run stands.",
    body: (
      <>
        <DocSection title="Before a run">
          <ul>
            <li>
              <strong>A target starts the run.</strong> An http(s) URL, an IPv4 address or range (such as{" "}
              <Mono>10.0.0.0/24</Mono>), a git repository URL or a local path leave no doubt about the template, so it is
              applied at once. A bare hostname could be any kind of target: the run waits on the Template screen for you
              to pick one, with Reconix&apos;s suggestion marked. Words on the same line only break ties (&quot;api&quot;,
              &quot;ports&quot;, &quot;repo&quot;, &quot;website&quot;) and can name ports or tools.
            </li>
            <li>
              <strong>An empty line uses the example request</strong>, a reserved example site.
            </li>
            <li>
              <strong>Anything else gets a short answer</strong> and nothing starts: a greeting, a question, or
              &quot;scan my network&quot; without an address.
            </li>
            <li>
              <strong>A malformed target is refused</strong> with the reason, so you can fix it: an address like{" "}
              <Mono>10.0.0.300</Mono>, or a range wider than /16. A request longer than 500 characters is refused too.
            </li>
          </ul>
        </DocSection>
        <DocSection title="During a run">
          <ul>
            <li>
              A line goes to the assistant: the active model when one is set (see{" "}
              <DocRef>Models</DocRef>), otherwise the built-in reply. The reply shows under
              your line.
            </li>
            <li>
              An empty line reopens what the run waits for (a login form or the Approval screen).
            </li>
            <li>
              While the run waits for the target login, the chat is closed: &quot;Reconix is waiting for the target login.
              Press Enter on the Execution screen to open the secure input; never paste credentials into the chat.&quot;
              The line is not recorded. A run stopped at the login refuses it too, so a pasted password never
              reaches the chat or a model.
            </li>
          </ul>
        </DocSection>
        <DocSection title="After a run">
          <p>
            Once the run has completed or stopped, every line you type is chat about the same assessment, with its
            history and findings. An empty line opens Findings (or the Report when there are none). <Mono>/new</Mono>,{" "}
            <Mono>/assess &lt;target&gt;</Mono> or <Mono>/template</Mono> start another assessment; the finished one
            stays listed under <Mono>/assessments</Mono>. On Findings, Finding Detail and the Report, <Kbd>c</Kbd>{" "}
            opens the chat.
          </p>
        </DocSection>
        <DocSection title="With a model and the harness">
          <p>
            When a model is active and the backend harness is installed, the AI agent handles the prompt: a target
            enters the Template screen in agent mode (approving the scope hands the assessment to the agent), and plain
            text is a chat turn with the agent. See <DocRef>The AI agent</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Paths and commands">
          <p>
            A line starting with <Mono>/</Mono> is a command unless its first word contains another slash:{" "}
            <Mono>/home/me/app</Mono> is a local path and starts a Source Code assessment. <Kbd>?</Kbd> on an empty prompt
            opens the help instead of typing a question mark.
          </p>
        </DocSection>
      </>
    ),
  },
};
