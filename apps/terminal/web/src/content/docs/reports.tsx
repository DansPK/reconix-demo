import { Callout, Code, DocRef, DocSection, DocTable, Kbd, Mono, Steps } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";

export const reports: GroupContent = {
  reviewing: {
    lede: "The Report screen, the summary dialog and the audit trail: where to read what the run did.",
    body: (
      <>
        <DocSection title="The Report screen">
          <p>
            <Mono>/report</Mono> or <Kbd>Alt+8</Kbd>. It shows, for the current assessment:
          </p>
          <ul>
            <li>
              <strong>Executive summary:</strong> the template, the target, the client and mode, the findings line, how
              many out-of-scope requests the policy engine blocked and how many risky actions ran only after a human
              approved them.
            </li>
            <li>
              <strong>Findings by severity:</strong> bars for CRITICAL, HIGH, MEDIUM and LOW.
            </li>
            <li>
              <strong>Key findings:</strong> the top four, with id, severity, CVSS, validation, triage status and source.
            </li>
            <li>
              <strong>Changes since the last assessment:</strong> when the same target was assessed earlier in the
              session, how many findings are new, recurring and resolved; otherwise &quot;First assessment of this target
              in this session.&quot;
            </li>
          </ul>
          <p>
            Until the run completes, the export buttons are disabled with the reason: &quot;The report can be exported
            once the assessment completes.&quot; or, after a stop, &quot;The assessment stopped (…), so no report can be
            exported. Partial findings are listed below.&quot;
          </p>
        </DocSection>
        <DocSection title="The summary dialog">
          <p>
            <Mono>/summary</Mono> opens the assessment summary: the id, the target, the status (Running, Completed,
            Stopped), the counts, the approvals given and, once a report was exported, its path with an{" "}
            <strong>Open the report</strong> choice.
          </p>
        </DocSection>
        <DocSection title="The audit trail">
          <p>
            <Mono>/audit</Mono> (aliases <Mono>/activity</Mono>, <Mono>/log</Mono>) shows the last 40 lines of the activity
            log (time, source, message), the last 40 audit events (<Mono>scope.approved</Mono>, <Mono>plan.run</Mono>,{" "}
            <Mono>policy.blocked</Mono>, <Mono>approval.*</Mono>, <Mono>report.generated</Mono>, <Mono>llm.*</Mono> …) and any
            feedback you typed at a question. The full log is in the saved copy the dashboard reads.
          </p>
        </DocSection>
      </>
    ),
  },
  "understanding-findings": {
    lede: "What each field of a finding means, and how to filter, sort and triage.",
    notice: "This reference is under review and may not match the latest implementation.",
    body: (
      <>
        <DocSection title="The fields">
          <DocTable
            caption="The fields of a finding"
            head={["Field", "Meaning"]}
            rows={[
              { key: "Id", value: <>Three digits for the run&apos;s own findings; <Mono>AI-NNN</Mono> for the agent&apos;s.</> },
              { key: "Severity", value: "CRITICAL, HIGH, MEDIUM or LOW, as detected. An analyst's override wins: the effective severity is what the list, the filters and the report use." },
              { key: "Validation", value: "CONFIRMED, UNCONFIRMED or INCONCLUSIVE. Anything but CONFIRMED needs review." },
              { key: "CVSS", value: "A 3.1 score and vector when the finding is scored; 0.0 means not scored." },
              { key: "References", value: "OWASP, CWE and CVE identifiers; the CWE, OWASP and CVE columns are read from them." },
              { key: "Evidence", value: "What the tool saw, already masked (tokens, emails and ids are partly hidden)." },
              { key: "Impact, remediation", value: "What it means and what to do." },
              { key: "Tool, category", value: "The tool that found it (as the approved scope names it) and its category." },
              { key: "Triage", value: "The status, an optional severity override and a note." },
            ]}
          />
        </DocSection>
        <DocSection title="Filters and sorts">
          <p>
            <Kbd>f</Kbd> on the Findings screen picks a filter, each with its count: All findings, Critical &amp; High,
            Medium, Low, Confirmed, Needs review, Open (not triaged), Triaged. <Kbd>s</Kbd> cycles the sort between
            severity and validation. <Kbd>[</Kbd> and <Kbd>]</Kbd> on a finding step through the same
            filter and sort.
          </p>
        </DocSection>
        <DocSection title="Triage">
          <p>
            <Kbd>t</Kbd> on a finding (list or detail) sets its status: <strong>Open</strong>, <strong>Fixed</strong>,{" "}
            <strong>Accepted risk</strong> or <strong>False positive</strong>. A severity override and a note can be
            recorded too; an override equal to the detected severity clears it. Triage is the analyst&apos;s decision, is
            written to the activity log, and travels into the report and the saved copy (the dashboard leaves false
            positives out of its counts).
          </p>
        </DocSection>
      </>
    ),
  },
  exporting: {
    lede: "Three formats (PDF, JSON and DOCX), written to ./reports/ once the assessment is complete.",
    notice: "This reference is under review and may not match the latest implementation.",
    body: (
      <>
        <DocSection title="The formats">
          <DocTable
            caption="The report formats the terminal exports"
            head={["Format (file)", "What it is and what it needs"]}
            rows={[
              { key: "PDF (.pdf)", value: <>The styled report, page 1 the executive summary, printed to PDF by WeasyPrint when installed, otherwise by a headless Chrome/Chromium on the machine. Shown as &quot;not installed&quot; without either. See <DocRef>Requirements</DocRef>.</> },
              { key: "JSON (.json)", value: "The complete report data, machine-readable." },
              { key: "DOCX (.docx)", value: <>The same report as an editable Word document, every section included. Uses the <Mono>python-docx</Mono> package (installed with Reconix).</> },
            ]}
          />
        </DocSection>
        <DocSection title="How to export">
          <Steps>
            <li>
              On the Report screen: <Kbd>p</Kbd> PDF, <Kbd>j</Kbd> JSON, <Kbd>w</Kbd> DOCX. Or <Mono>/export</Mono>{" "}
              from anywhere, with the format or without (a menu asks); <Kbd>r</Kbd> on a finding jumps to the Report
              screen.
            </li>
            <li>
              The file is written to <Mono>./reports/&lt;assessment id&gt;.&lt;ext&gt;</Mono>, relative to the folder you
              launched Reconix from (the folder is created if needed). Reports are only ever written there.
            </li>
            <li>
              A dialog says &quot;Saved ./reports/… Open it now?&quot;: <strong>Open it</strong> opens the file in your
              browser or the default app for the format; the Report screen&apos;s footer keeps the path, and{" "}
              <Mono>/summary</Mono> can open it again.
            </li>
          </Steps>
          <Code>{`/export pdf      # ./reports/<id>.pdf
/export json
/export docx`}</Code>
        </DocSection>
        <DocSection title="What a report contains">
          <p>
            Executive summary, Methodology, Evidence and validation results, References, Approved scope and limitations,
            Findings and severity, Impact and remediation. The data behind every format is the same: the assessment
            (id, target, template, client, mode, operator, methodology, version, window), the approved scope, the blocked
            requests, the approval decisions, every finding with its triage, the changes since the last assessment, and
            when it was generated. Every string goes through redaction, and the report never contains the test account.
          </p>
        </DocSection>
        <DocSection title="When an export is refused">
          <DocTable
            caption="Export messages"
            head={["Message", "Meaning"]}
            rows={[
              { key: "The report is available once the assessment is complete.", value: "The run has not completed (it is still going, or it was stopped)." },
              { key: "(the \u201cExport the report as…\u201d menu opens)", value: "An argument that is not a format id is not refused: /export opens its menu instead." },
              { key: "<Format> reports aren't in this demo.", value: "PDF without WeasyPrint or Chrome, or DOCX without python-docx." },
              { key: "PDF export needs WeasyPrint or a Chrome/Chromium browser.", value: "Neither PDF engine was found at export time." },
              { key: "Couldn't render the PDF with the browser. / The browser did not produce a PDF.", value: "Chrome was found but printing failed; the DOCX and JSON exports still work." },
              { key: "The assessment id can't be used as a file name. / Reports can only be saved in the reports folder.", value: "The id contains characters that could leave ./reports/." },
            ]}
          />
          <p>
            More in <DocRef>Troubleshooting · Report failures</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  dashboard: {
    lede: "The web dashboard reads the saved runs: download one run's report as PDF, JSON or DOCX, and combine up to five runs into one report.",
    body: (
      <>
        <DocSection title="Opening it">
          <p>
            <Mono>/web</Mono> (or <Kbd>b</Kbd> on the Report screen) starts the dashboard in the background the first time
            (<Mono>npm run dev</Mono> in <Mono>apps/web/</Mono>, installing its packages first if needed) and opens your
            browser on it; later calls just open it. It listens on <Mono>127.0.0.1</Mono> only, on port{" "}
            <Mono>3100</Mono> unless <Mono>RECONIX_WEB_PORT</Mono> says otherwise. It reads the saved copies in{" "}
            <Mono>~/.reconix/assessments</Mono>, so every
            started assessment of every session is there, with secrets removed. Its Findings and Reports views read the local Core API instead (<Mono>RECONIX_CORE_API</Mono>, <Mono>http://127.0.0.1:8000</Mono> by default). Its views: Overview, Assessments,
            Findings, Reports, Terminal, AI Assistant. Nothing in the dashboard writes to or decides anything the
            terminal reads.
          </p>
        </DocSection>
        <DocSection title="One assessment's report">
          <p>
            The Reports view reads the local Core API, for the assessment chosen in its <strong>Assessment</strong>{" "}
            picker (the Findings view shares it: <Mono>?assessment=&lt;id&gt;</Mono>). Its summary strip shows the
            findings (false positives left out), the plan steps done, the tool runs and the masked evidence; under it,
            every <strong>report version</strong> the Core API holds for it, newest first, then the combined reports that
            cover it, each with its build status and its review sign-off.
          </p>
          <p>
            A version that is <strong>Ready</strong> and <strong>Signed off</strong> offers its files (PDF, DOCX, JSON):
            the dashboard fetches each one from the Core API, then saves it, and the line under the list says what
            happened. Any other version says why it has no files yet (still generating, failed, or its review not
            approved), and a download the Core API refuses shows what it said. Making a report, combining assessments
            and asking for the review stay in the TUI; the dashboard only reads. With no assessment chosen, the view
            lists the Core API&apos;s assessments, and a row opens that one&apos;s report.
          </p>
        </DocSection>
        <DocSection title="False positives">
          <p>
            A finding an analyst marked as a false positive in the TUI is left out of every count on the dashboard: the
            Overview&apos;s summary strip and Findings by Severity, the Assessments rows, the Reports and the AI
            Assistant&apos;s cards all count the same findings. The Findings view leaves false positives out of its list
            too, so its headline and chips agree; the <strong>False positives · Show</strong> chip lists them (as
            Closed, with the analyst&apos;s note), shown beside the total (&quot;Showing 41 of 40 findings + 1 false
            positive&quot;), and Clear filters hides them again. A link that names a false positive while they are
            hidden says so, with <strong>Show it</strong>.
          </p>
        </DocSection>
        <DocSection title="The combined report">
          <p>
            A report that covers two to five assessments is made through the Core API from the TUI. It is filed under
            the first assessment and listed under every one it covers, marked <strong>Combined</strong> with how many
            assessments it covers, and it is signed off and downloaded like any other version.
          </p>
          <Callout>
            The Findings and Reports views need the Core API running (<Mono>./deploy/dev.sh</Mono>); without it they
            say so. See <DocRef>Troubleshooting · The web dashboard</DocRef>.
          </Callout>
        </DocSection>
      </>
    ),
  },
  panels: {
    lede: "Every panel on the dashboard carries a help icon; this is what each one shows, how its numbers are counted, and what you can click.",
    body: (
      <>
        <DocSection title="Activity Timeline">
          <p>
            With one run open it draws that run&apos;s log as labelled lanes, one lane per kind of event, over a time
            axis; with every run shown it draws the runs started per day as stacked bars, coloured by how each run
            ended. The note beside the title is the window it covers.
          </p>
          <p>
            Every mark has a tooltip, and clicking or focusing one expands it to the events behind it. The legend under
            the chart names each colour and, on the per-day bars, each status.
          </p>
        </DocSection>
        <DocSection title="Execution Timeline">
          <p>
            With one run open it lists that run&apos;s plan steps as rows: the step, its status badge, a progress bar
            and how far it got; under them the tool steps sit on a time track, and the row for a gate shows what the run
            is waiting on. The note beside the title says which run it is.
          </p>
          <p>
            With every run shown it becomes the newest eight runs, one row each, with status and a{" "}
            <Mono>4/5</Mono>-style count of finished plan steps. A row opens that run.
          </p>
        </DocSection>
        <DocSection title="Findings by Severity">
          <p>
            A stacked bar of the severity mix, then one row per severity with its badge, a share bar, the count and the
            percentage. The four rows &mdash; Critical, High, Medium, Low &mdash; are always all there, each shown even
            at 0, because that is the whole scale; there is no Info level. The count beside the title, the bar and the
            percentages are those four levels only, and <strong>false positives are left out of every one of them</strong>{" "}
            (see <DocRef>Reports &middot; The web dashboard &middot; False positives</DocRef>).
          </p>
          <p>
            The chips below are the review state of those same findings: <strong>confirmed</strong> means validated with
            evidence, <strong>need review</strong> means open and not confirmed yet, and <strong>closed</strong> (shown
            only when there are any) means fixed, accepted or a false positive. <strong>Top findings &middot; CVSS</strong>{" "}
            ranks the highest-scored findings by their CVSS rating, highest first; the Report view cuts that list to
            three.
          </p>
          <p>
            A severity row with at least one finding opens the Findings view filtered to that severity, the count beside
            the title opens Findings unfiltered, and a row of the top list opens that finding. Severity and CVSS
            themselves are explained in <DocRef>Reports &middot; Understanding findings</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Reports">
          <p>
            One assessment&apos;s report versions from the Core API, newest first, then the combined reports that cover
            it: the version, its build status (Generating, Ready, Failed), its review sign-off (Not reviewed, Review
            pending, Signed off, Review rejected, Review expired), when and by whom it was made, and its executive
            summary. The note beside the title counts the versions.
          </p>
          <p>
            A Ready, signed-off version offers a button per file it has; any other says why it has none yet. The
            formats are in <DocRef>Reports &middot; Exporting</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Assessments">
          <p>
            Every saved run, newest first, ten to a page: the run and its target, when it was saved, its status, the
            template it used and how many findings it holds. A row opens that run&apos;s Overview.
          </p>
          <p>
            The search box and the status and template chips narrow the rows, and what you pick lives in the address
            (<Mono>?view=assessments&amp;q=api&amp;status=Completed&amp;page=2</Mono>), so a reload or a shared link
            lands on the same rows. When nothing matches, the view says so and the chips stay, so one click clears it.
          </p>
        </DocSection>
        <DocSection title="Findings list">
          <p>
            Every finding the local Core API holds — for every assessment, or for the one chosen in the
            Assessment picker above the list — worst severity first, with its ID, severity, title, review state, tool
            and rating. When the Core API isn&apos;t running, the view says so. Choosing a row opens that finding beside the list: its
            description, its masked evidence, its remediation and its references.
          </p>
          <p>
            The search box and the severity, review and tool filters narrow the list, and the open finding and the
            filters live in the address (<Mono>?view=findings&amp;assessment=&lt;id&gt;&amp;sev=MEDIUM&amp;finding=F-001</Mono>). False positives
            are counted but hidden until you ask for them. Nothing here changes a run: decisions stay in the terminal.
          </p>
        </DocSection>
        <DocSection title="Run log">
          <p>
            The open run&apos;s activity as it happened, newest last: what the operator did, what the policy engine
            checked or blocked, what each tool ran, and the assistant&apos;s own lines. The note beside the title says
            which run it is and how much of it is shown.
          </p>
          <p>
            The model&apos;s longer reasoning is folded into a <strong>thinking</strong> block you can open. Sensitive
            values were masked when the run saved them, so the log shows them as <Mono>••••</Mono> and never holds the
            original. With no run open, the view asks you to pick one in the top bar&apos;s run switcher.
          </p>
        </DocSection>
        <DocSection title="AI Assistant">
          <p>
            A conversation about the saved runs. It reads the same saved copies the rest of the dashboard shows and
            answers from them; the numbers on any card it draws come from those files, never from the model. The header
            names what the conversation is about — one run, or every run — with that scope&apos;s status.
          </p>
          <p>
            The model is chosen in the composer&apos;s model chip, <strong>Security knowledge</strong> opens the
            documents it may quote, and <strong>History</strong> lists earlier conversations, which survive a reload.
            Questions are masked before they are sent, and the assistant can neither approve, reject nor change
            anything: those stay in the terminal.
          </p>
        </DocSection>
      </>
    ),
  },
};
