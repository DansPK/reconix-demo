import type { ReactNode } from "react";

import { Code, DocRef, DocSection, DocTable, Facts, Kbd, Mono } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";
import { COMMAND_GROUPS, COMMANDS, type CommandEntry } from "@/lib/docs-nav";

/**
 * The hand-written part of each command's page. The facts (name, aliases, description, whether
 * the argument is picked from a list) come from the generated commands.json; what is written
 * here is what the code does when the command runs. tests/docs-nav.test.ts fails when a command
 * of commands.json has no entry here, or an entry names a command that no longer exists.
 */
export type CommandDoc = {
  purpose: ReactNode;
  when: ReactNode;
  /** `/<name> [arg]` */
  syntax: string;
  example: string;
  behaviour: ReactNode;
  /** message → meaning; empty when the command shows no message of its own */
  errors: { message: string; meaning: ReactNode }[];
};

export const COMMAND_DOCS: Record<string, CommandDoc> = {
  help: {
    purpose: "Shows the keys that work on the current screen, then the keys that work everywhere.",
    when: (
      <>
        Whenever you wonder what a key does here. It is the same overlay as <Kbd>?</Kbd> (on the Start prompt, <Kbd>?</Kbd>{" "}
        works when the prompt is empty).
      </>
    ),
    syntax: "/help",
    example: "/help",
    behaviour: (
      <>
        An overlay lists &quot;This screen&quot; (the focused widget&apos;s keys, then the screen&apos;s own) and
        &quot;Everywhere&quot; (<Kbd>←</Kbd>/<Kbd>→</Kbd>, <Kbd>1</Kbd>…<Kbd>8</Kbd>, <Kbd>/</Kbd>, <Kbd>?</Kbd>,{" "}
        <Kbd>Ctrl+O</Kbd>, <Kbd>Ctrl+Q</Kbd>). <Kbd>?</Kbd> or <Kbd>Esc</Kbd> closes it. The full list is on{" "}
        <DocRef>Keys</DocRef>.
      </>
    ),
    errors: [],
  },
  new: {
    purpose: "Starts a new assessment, optionally on a target, and leaves the current one listed under /assessments.",
    when: (
      <>
        After a run completed or stopped, or to abandon the one in progress and begin on another target. Also the way
        out after a rejected scope or action.
      </>
    ),
    syntax: "/new [target]",
    example: "/new https://staging.example.com",
    behaviour: (
      <>
        The current run stops playing, a fresh assessment is loaded (the earlier ones stay listed; the audit trail and
        the prompt history are kept), the findings filter resets and the Start screen opens. With a target, the line is
        submitted as if you had typed it at the prompt: a target starts the run (a bare hostname waits at the Template
        screen), anything else gets a short answer. See <DocRef>The prompt</DocRef>.
      </>
    ),
    errors: [
      { message: "Keep the request under 500 characters.", meaning: "The target line is too long." },
      { message: "<the reason a target is malformed>", meaning: <>An address like <Mono>10.0.0.300</Mono> or a range wider than /16 is refused with the reason; nothing starts.</> },
    ],
  },
  template: {
    purpose: "Opens the Template screen to pick a kind of target and type its target.",
    when: (
      <>
        When you want to choose the template yourself instead of letting the target&apos;s shape pick it, or to start
        over from the template after an assessment was approved or stopped.
      </>
    ),
    syntax: "/template [web_url | network | api | source]",
    example: "/template network",
    behaviour: (
      <>
        Without an id, the Template screen shows the four templates (Network, API, Source Code, Web URL) with an example
        target each; pick one, then type the target. With an id, the screen goes straight to that template&apos;s
        target prompt. The ids are only suggested, never asked for. If the current assessment is already past the
        scope (approved or stopped), a new one starts first: &quot;Started a new assessment. The previous one is under
        /assessments.&quot; The typed target must fit the template. See{" "}
        <DocRef>Request and template</DocRef>.
      </>
    ),
    errors: [
      { message: "Unknown template <id>.", meaning: "The id is not web_url, network, api or source." },
      { message: "A template can only be chosen when Reconix asks for one.", meaning: "The run is not waiting at the template gate." },
      { message: "This assessment already has a template.", meaning: "A template was already applied to this run." },
    ],
  },
  plan: {
    purpose: "Opens the Plan screen: the phases, the login the tools need and the gated steps, with Run plan, Edit steps and Cancel.",
    when: "After approving the scope, to review the plan and run it; later, to see where the run stands or to edit a gated step that has not been decided yet.",
    syntax: "/plan",
    example: "/plan",
    behaviour: (
      <>
        The screen reflects the run&apos;s state: no plan yet (pick a template first), scope still a draft (&quot;Approve
        the scope first — the plan runs only inside it.&quot;), preparing, ready (Run plan / Edit steps / Cancel), running
        (View execution, and View findings once it finished) or stopped (Start a new assessment). <Kbd>Tab</Kbd> browses
        the steps. See <DocRef>Plan and tools</DocRef>.
      </>
    ),
    errors: [
      { message: "The plan can only be run when Reconix asks for it.", meaning: "The run is not at the plan gate, or the scope is not approved." },
      { message: "The plan is already running.", meaning: "Run plan was chosen twice." },
      { message: "No step can be edited now.", meaning: "Edit steps: every gated step is decided or has nothing to edit." },
    ],
  },
  approval: {
    purpose: "Opens the Approval screen for the gated action the run waits on.",
    when: (
      <>
        When the run paused at a gate and you moved away (<Kbd>Esc</Kbd> decides later), or to review the last decision.
      </>
    ),
    syntax: "/approval",
    example: "/approval",
    behaviour: (
      <>
        Shows the waiting action with Approve &amp; run, Reject, Edit params and View details (highlighted first; <Kbd>d</Kbd>{" "}
        opens it). A HIGH-risk approval opens the second confirmation with &quot;No, go back&quot; selected. When nothing
        waits, the screen offers Back to execution or Review the plan. See{" "}
        <DocRef>Approval gates</DocRef>.
      </>
    ),
    errors: [
      { message: "This action isn't waiting for a decision.", meaning: "The run is not paused at this gate." },
      { message: "This action was already decided.", meaning: "A decision is already recorded." },
      { message: "This approval is for a different request. / The request changed after it was shown. Review it again.", meaning: "The approval's hash does not match the request on screen." },
      { message: "HIGH-risk actions need the confirmation step first.", meaning: "The second dialog was not confirmed." },
      { message: "Blocked by policy: <reason>.", meaning: "The request no longer fits the approved scope." },
      { message: "This action can't be edited now.", meaning: "Edit params outside the plan or this gate, or on a decided action." },
    ],
  },
  status: {
    purpose: "Opens the Execution screen: the live run, its tasks, spinner and output.",
    when: "While the plan runs, to watch it, open what it waits for or stop it; afterwards, to read the output again.",
    syntax: "/status",
    example: "/status",
    behaviour: (
      <>
        Same as <Kbd>5</Kbd> or <Kbd>→</Kbd> from the Approval screen. The screen exists only once the plan has run;
        before that the command only shows a notice. On it, <Kbd>Enter</Kbd> opens what the run waits for, <Kbd>End</Kbd>{" "}
        follows the newest output and <Kbd>Ctrl+C</Kbd> asks before stopping. See{" "}
        <DocRef>Execution</DocRef>.
      </>
    ),
    errors: [
      { message: "Execution starts after you run the plan (3 or /plan).", meaning: "The plan has not been run yet; the screen stays where it is." },
    ],
  },
  findings: {
    purpose: "Opens the Findings list.",
    when: "As soon as the run reveals findings, and afterwards to filter, sort or triage.",
    syntax: "/findings",
    example: "/findings",
    behaviour: (
      <>
        The list of revealed findings under the current filter and sort: <Kbd>Enter</Kbd> opens one, <Kbd>f</Kbd> filter,{" "}
        <Kbd>s</Kbd> sort, <Kbd>t</Kbd> triage, <Kbd>c</Kbd> chat. The filter and sort are kept while you move around.
        See <DocRef>Understanding findings</DocRef>.
      </>
    ),
    errors: [],
  },
  finding: {
    purpose: "Opens one finding on the Finding Detail screen.",
    when: "To jump to a finding by its id, or to pick one from a menu without going through the list.",
    syntax: "/finding [id]",
    example: "/finding 001",
    behaviour: (
      <>
        With an id (case does not matter: <Mono>001</Mono>, <Mono>IMP-001</Mono>, <Mono>ai-002</Mono>), the finding opens.
        Without one, a menu &quot;Which finding?&quot; lists every revealed finding with its title and severity. On the
        detail screen <Kbd>[</Kbd>/<Kbd>]</Kbd> step to the previous or next finding in the same filter and sort,{" "}
        <Kbd>t</Kbd> triages, <Kbd>r</Kbd> goes to the report.
      </>
    ),
    errors: [
      { message: "No findings yet. They appear as testing finds them.", meaning: "Nothing has been revealed: run the plan first." },
      { message: "(the \u201cWhich finding?\u201d menu opens)", meaning: "An id that matches no finding is not an error: the menu opens so you can pick one." },
    ],
  },
  report: {
    purpose: "Opens the Report screen: the executive summary, findings by severity, the key findings and the export buttons.",
    when: "Once the assessment completed, to read the summary and export; earlier, to see why export is not available yet.",
    syntax: "/report",
    example: "/report",
    behaviour: (
      <>
        Same as <Kbd>8</Kbd>. The buttons <Kbd>p</Kbd> PDF, <Kbd>j</Kbd> JSON and <Kbd>w</Kbd> DOCX are enabled once
        the run completed; <Mono>/web</Mono> opens the web dashboard. See{" "}
        <DocRef>Reviewing results</DocRef>.
      </>
    ),
    errors: [],
  },
  export: {
    purpose: "Writes the report in a format to ./reports/ and offers to open it.",
    when: "After the assessment completed. From any screen; the Report screen's keys do the same.",
    syntax: "/export [pdf | json | docx]",
    example: "/export pdf",
    behaviour: (
      <>
        With a format, the file <Mono>./reports/&lt;assessment id&gt;.&lt;ext&gt;</Mono> is written (relative to where
        Reconix was launched) and a dialog &quot;Saved … Open it now?&quot; offers to open it in the browser or the
        default app. Without a format, a menu &quot;Export the report as…&quot; lists the three formats; PDF is dimmed
        without a PDF engine, DOCX without python-docx. The path is kept on the Report screen and in <Mono>/summary</Mono>. See{" "}
        <DocRef>Exporting</DocRef>.
      </>
    ),
    errors: [
      { message: "The report is available once the assessment is complete.", meaning: "The run is still going or was stopped." },
      { message: "(the \u201cExport the report as…\u201d menu opens)", meaning: "An argument that is not one of the three format ids is not an error: the menu opens instead." },
      { message: "<Format> reports aren't in this demo.", meaning: "PDF without WeasyPrint or Chrome, or DOCX without python-docx." },
      { message: "PDF export needs WeasyPrint or a Chrome/Chromium browser. / Couldn't render the PDF with the browser. / The browser did not produce a PDF.", meaning: "The PDF engine is missing or failed; export DOCX or JSON instead." },
      { message: "Couldn't open it. The report is saved at <path>.", meaning: "The file is written but no browser or app could be launched here." },
    ],
  },
  summary: {
    purpose: "Shows the assessment summary in a dialog, with a shortcut to the exported report.",
    when: "To see the totals at a glance, or to open the report file again.",
    syntax: "/summary",
    example: "/summary",
    behaviour: (
      <>
        The dialog shows the assessment id, the target, the status (Running, Completed or Stopped), the blocked
        requests, the confirmed findings and the ones needing review, and the approvals given (scope, MEDIUM, HIGH).
        Once a report was exported, <strong>Open the report</strong> opens it; otherwise only Close.
      </>
    ),
    errors: [],
  },
  assessments: {
    purpose: "Lists every assessment of this session and reopens one where it stands.",
    when: "To go back to an earlier assessment (its findings, report or pending gate), to compare runs, or to start a new one.",
    syntax: "/assessments",
    example: "/assessments",
    behaviour: (
      <>
        A menu lists each assessment with its label, target, template, status and number of findings (the current one
        is tagged CURRENT), plus <strong>New assessment</strong>. Picking another one switches to it: the screen that
        shows where it stands opens (its pending gate, Execution or Template), and a run that was playing plays on. The
        session&apos;s assessments live in memory; the saved copies on disk are for the dashboard.
      </>
    ),
    errors: [{ message: "No such assessment.", meaning: "The index is out of range (cannot happen from the menu)." }],
  },
  audit: {
    purpose: "Shows the activity log, the audit trail and any feedback you typed.",
    when: "To check what happened and when: decisions, policy verdicts, exports, provider changes.",
    syntax: "/audit",
    example: "/audit",
    behaviour: (
      <>
        A dialog with the last 40 activity lines (time, source, message), the last 40 audit events (<Mono>scope.approved</Mono>,{" "}
        <Mono>plan.run</Mono>, <Mono>policy.blocked</Mono>, <Mono>approval.*</Mono>, <Mono>report.generated</Mono>,{" "}
        <Mono>llm.*</Mono> …) and, when present, &quot;Your feedback&quot; (what you typed at a question). <Kbd>PgUp</Kbd>/
        <Kbd>PgDn</Kbd> scroll it. The full log is in the saved copy the dashboard reads.
      </>
    ),
    errors: [],
  },
  assess: {
    purpose: "Runs a real assessment of a target with the AI agent, through the same scope gate.",
    when: "When a model is active and the backend harness is installed, to let the agent plan and run tools against an authorized target.",
    syntax: "/assess <target>",   // needs the harness (Python 3.10+) and a /model
    example: "/assess http://target.example.com",
    behaviour: (
      <>
        The run and its scope are built like the scripted flow and the Template screen opens; the scope lists the
        agent&apos;s whole tool set. Approving the scope hands the assessment to the agent, which runs on the Execution
        screen: its plan as task rows, its tool calls in the live output, its findings as <Mono>AI-NNN</Mono> findings.
        It asks for decisions and logins through dialogs; a chat line continues it; <Mono>/model</Mono> switches its model
        mid-run. A running assessment&apos;s playback pauses and it stays listed under <Mono>/assessments</Mono>. See{" "}
        <DocRef>The AI agent</DocRef>.
      </>
    ),
    errors: [
      { message: "The harness backend isn't installed (pip install -e backend).", meaning: "Install the harness from the repository root." },
      { message: "Pick a model first with /model.", meaning: "No active model." },
      { message: "Give a target, e.g. /assess http://host", meaning: "No argument." },
      { message: "That doesn't look like a scan target (URL, host or repo).", meaning: "The argument names no target." },
      { message: "No LLM model is active. Use /model to pick one.", meaning: "The model was removed while the agent was running." },
      { message: "The assessment is running — you can chat once it finishes.", meaning: "A chat line while a turn runs; wait." },
      { message: "Agent error: <the Python error>", meaning: "The harness failed; the run is marked finished and the terminal keeps working." },
    ],
  },
  "add-on": {
    purpose:
      "Adds a reference document the AI may quote from: its text is read once, redacted and kept on this computer.",
    when: (
      <>
        When a runbook, policy, API notes or a past report would help the AI answer about this
        engagement. The add-ons are used by the terminal chat, the <Mono>/assess</Mono> agent and the web AI
        Assistant alike; they are never run, and the web only reads them.
      </>
    ),
    syntax: "/add-on [path]",
    example: "/add-on ~/docs/runbook.md",
    behaviour: (
      <>
        Without a path, a menu lists <strong>Add a file…</strong>, each saved source (
        <Mono>name · kind · N passages</Mono>, picking one offers <strong>Remove</strong>) and
        <strong>Remove all</strong> (both confirms default to No); when empty it explains what add-ons are; when the
        index can&apos;t be read it offers only <strong>Remove all</strong>.
        <strong> Add a file…</strong> opens a form with one path field, busy while the file is read in the
        background. With a path, the file is added straight away and a notification gives the passage count (and
        says when a file was cut to its first 2,000 passages). The relevant passages are sent to the active model with
        your questions, local or remote; the notification says so when the model is remote.
        Supported: <Mono>.txt .md .json .yaml .yml .docx .pdf</Mono>,
        at most 10 MB, a regular file (no symlink); at most 50 sources. The text is cleaned and
        <strong> redacted at ingest</strong> (secrets never reach disk), split into passages (≤ 1,200 characters)
        and saved under <Mono>~/.reconix/knowledge</Mono> (0700, files 0600). See{" "}
        <DocRef>Models</DocRef>.
      </>
    ),
    errors: [
      { message: "Enter the path to a file to add.", meaning: "The field or argument is empty." },
      { message: "That path is a symlink; add the real file instead.", meaning: "Symlinks are refused." },
      { message: "No file at that path. / That isn't a regular file. / Couldn't read that file.", meaning: "The path doesn't exist, isn't a plain file, or can't be read." },
      { message: "Unsupported file type. Use one of: .txt .md .json .yaml .yml .docx .pdf.", meaning: "The extension isn't supported." },
      { message: "That file is too large (over 10 MB).", meaning: "Split or trim the file." },
      { message: "That file isn't valid JSON. / That file isn't valid YAML.", meaning: "A .json/.yaml file didn't parse." },
      { message: "Couldn't read that Word file. / Couldn't read that PDF. / That PDF is encrypted; add an unencrypted copy.", meaning: "The document couldn't be opened, or the PDF is encrypted." },
      { message: "That file has no readable text to add.", meaning: "Nothing was left after extraction." },
      { message: "The knowledge limit is 50 files. Remove one first.", meaning: "At most 50 sources are kept." },
      { message: "The knowledge index is corrupt. Remove it with /add-on, then add files again.", meaning: "The saved index on disk is unreadable; Remove all and re-add." },
      { message: "That YAML file can't be added: YAML anchors (&name) aren't supported.", meaning: "Anchors, aliases, merge keys and nesting over 100 levels are refused (they can expand a small file hugely)." },
      { message: "That Word file unpacks to over 50 MB; add a smaller copy. / That Word file has too many parts to read.", meaning: "The .docx is a zip whose contents are too large or too many." },
      { message: "Couldn't add that file; nothing was saved.", meaning: "Reading the file failed unexpectedly; nothing changed on disk." },
    ],
  },
  provider: {
    purpose: "Manages LLM providers: set one up, test it, use one of its models, or remove it.",
    when: "Before using a model for the first time, after changing a key, or to switch to another provider.",
    syntax: "/provider [<id> | set <id> | update <id> | test <id> | unset <id>]",
    example: "/provider set ollama",
    behaviour: (
      <>
        Without an argument, a menu lists the six providers (reconix, openai, anthropic, deepseek, ollama,
        openai_compatible) with status, key hint and models. <Mono>/provider &lt;id&gt;</Mono> opens that provider&apos;s
        submenu: Set up / Update, Test connection, Use a model, Unset. <Mono>set</Mono> and <Mono>update</Mono> open the
        form; <Mono>test</Mono> runs the reachability test in the background and saves the result; <Mono>unset</Mono> asks
        before deleting the saved key and settings. See <DocRef>Providers</DocRef>.
      </>
    ),
    errors: [
      { message: "Unknown provider.", meaning: "The id is not in the catalog." },
      { message: "<Provider> needs an API key. / … needs a base URL. / At least one model name is required.", meaning: "A required field is empty." },
      { message: "The base URL must start with http:// or https://. / Put the API key in the key field, not in the base URL.", meaning: "The base URL is not a plain http(s) URL." },
      { message: "<Provider> holds a single model. / Reconix's base URL comes from .env and can't be changed.", meaning: "That provider's rules; see the catalog." },
      { message: "<Provider> is not configured (yet).", meaning: "Test, use or unset before set." },
      { message: "<Provider>: UNREACHABLE — <detail>", meaning: <>The test failed; see <DocRef>Common errors</DocRef>.</> },
    ],
  },
  model: {
    purpose: "Picks the active LLM model, the one that answers chat lines and drives the AI agent.",
    when: "After a provider tested Reachable, and whenever you want to switch models, even mid-run.",
    syntax: "/model [<provider>/<model>]",
    example: "/model openai/gpt-4o-mini",
    behaviour: (
      <>
        Without an argument, a menu lists every model of every configured provider (disabled until its provider is
        Reachable). With <Mono>provider/model</Mono>, that model becomes active at once: the top bar shows{" "}
        <Mono>llm: &lt;provider label&gt; · &lt;model&gt; ●</Mono>, the chat notes the switch, and a running agent is repointed
        with its history kept. The run, findings and approvals are untouched. See{" "}
        <DocRef>Models</DocRef>.
      </>
    ),
    errors: [
      { message: "Use provider/model, e.g. openai/gpt-4o-mini.", meaning: "The argument has no slash." },
      { message: "No models yet. Use /provider to set one up and test it.", meaning: "No configured provider has models to list." },
      { message: "Test the connection first — the provider is not reachable.", meaning: "Only a Reachable provider's model can be active." },
      { message: "<model> is not configured for <Provider>.", meaning: "The model is not in that provider's list." },
      { message: "Unknown provider. / <Provider> is not configured.", meaning: "The part before the slash is wrong." },
    ],
  },
  web: {
    purpose: "Opens the web dashboard in your browser, starting it in the background first if it is not running.",
    when: "To browse the saved runs, download reports, combine runs into one report, or use the AI Assistant.",
    syntax: "/web",
    example: "/web",
    behaviour: (
      <>
        If a dashboard is listening at the saved sign-in link, the browser opens it. Otherwise the first call installs
        the dashboard&apos;s packages if needed, starts <Mono>npm run dev</Mono> in <Mono>web/</Mono> quietly (log:{" "}
        <Mono>~/.reconix/web.log</Mono>) and the dashboard opens the browser when ready; it stops when you quit. The
        Report screen has no button for it: type <Mono>/web</Mono> there too. See <DocRef>The web dashboard</DocRef>.
      </>
    ),
    errors: [
      { message: "The web dashboard folder (web/) isn't next to this install.", meaning: "Run from the cloned repository." },
      { message: "The web dashboard needs Node.js (node and npm).", meaning: "Install Node.js 20 or later." },
      { message: "Another web dashboard already uses its port on 127.0.0.1 (an older one left running?). Stop it, then run /web again.", meaning: "The launcher exited with code 2: its port is taken." },
      { message: "Couldn't install the web dashboard's packages. / The web dashboard stopped while starting. / The web dashboard is taking a while to start.", meaning: <>Read the log; see <DocRef>Troubleshooting</DocRef>.</> },
      { message: "Open it in your browser: <link>", meaning: "The dashboard runs but no browser could be launched here." },
    ],
  },
  quit: {
    purpose: "Quits Reconix.",
    when: "When you are done. Same as Ctrl+Q.",
    syntax: "/quit",
    example: "/quit",
    behaviour: (
      <>
        Every started assessment of the session is saved once more to <Mono>~/.reconix/assessments</Mono> and marked
        closed, a web dashboard that this terminal started is stopped, and the application exits. Assessments are not
        reloaded on the next start; their saved copies are for the dashboard.
      </>
    ),
    errors: [],
  },
};

const ARGUMENT: Record<string, string> = {
  new: "an optional target, typed",
  template: "an optional template id (suggested, never asked for)",
  finding: "a finding id; asked with a menu when left out",
  export: "a format id; asked with a menu when left out",
  assess: "a target, typed (required)",
  "add-on": "an optional file path, typed",
  provider: "an optional verb and provider id, typed",
  model: "an optional provider/model, typed",
};

function argumentFacts(c: CommandEntry): string {
  if (ARGUMENT[c.name]) return ARGUMENT[c.name];
  return c.takes_argument ? "picked from a list" : "none";
}

function commandPage(c: CommandEntry, groupTitle: string, doc: CommandDoc) {
  return {
    lede: c.description,
    body: (
      <>
        <Facts
          items={[
            { label: "Command", value: <Mono>/{c.name}</Mono> },
            { label: "Aliases", value: c.aliases.length ? c.aliases.map((a) => <Mono key={a}>/{a}</Mono>).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), []) : "none" },
            { label: "Argument", value: argumentFacts(c) },
            { label: "Area", value: groupTitle },
          ]}
        />
        <DocSection title="Purpose">
          <p>{doc.purpose}</p>
        </DocSection>
        <DocSection title="When to use it">
          <p>{doc.when}</p>
        </DocSection>
        <DocSection title="Syntax">
          <Code>{doc.syntax}</Code>
          {c.takes_argument && c.ask && c.question && (
            <p>
              Without the argument, a menu asks &quot;{c.question}&quot;.
              {c.empty ? ` With nothing to choose from: “${c.empty}”` : ""}
            </p>
          )}
        </DocSection>
        <DocSection title="Example">
          <Code>{doc.example}</Code>
        </DocSection>
        <DocSection title="What happens">
          <p>{doc.behaviour}</p>
        </DocSection>
        <DocSection title="Common errors">
          {doc.errors.length ? (
            <DocTable caption={`Messages /${c.name} can show`} head={["Message", "Meaning"]} rows={doc.errors.map((e) => ({ key: e.message, value: e.meaning }))} />
          ) : (
            <p>This command shows no message of its own.</p>
          )}
        </DocSection>
      </>
    ),
  };
}

/** One page per command of the generated reference, in COMMANDS order. */
export const commandsContent: GroupContent = Object.fromEntries(
  COMMAND_GROUPS.flatMap((g) =>
    g.commands
      .filter((c) => COMMAND_DOCS[c.name])
      .map((c) => [c.name, commandPage(c, g.title, COMMAND_DOCS[c.name])])
  )
);

/** Commands with a generated entry but no hand-written page (must be empty: checked by the tests). */
export const UNDOCUMENTED_COMMANDS = COMMANDS.filter((c) => !COMMAND_DOCS[c.name]).map((c) => c.name);

/** Hand-written pages for commands that no longer exist (must be empty: checked by the tests). */
export const STALE_COMMAND_DOCS = Object.keys(COMMAND_DOCS).filter((name) => !COMMANDS.some((c) => c.name === name));
