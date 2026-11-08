import { Callout, Code, DocRef, DocSection, DocTable, Kbd, Mono, Steps } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";
import { DOCX_MAX_MIB } from "@/lib/report/formats";

export const reports: GroupContent = {
  reviewing: {
    lede: "The Report screen, the summary dialog and the audit trail: where to read what the run did.",
    body: (
      <>
        <DocSection title="The Report screen">
          <p>
            <Mono>/report</Mono> or <Kbd>8</Kbd>. It shows, for the current assessment:
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
              { key: "<Format> reports aren't available.", value: "PDF without WeasyPrint or Chrome, or DOCX without python-docx." },
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
            (<Mono>npm run dev</Mono> in <Mono>web/</Mono>, installing its packages first if needed) and opens your browser
            on it; later calls just open it. It reads the saved copies in <Mono>~/.reconix/assessments</Mono>, so every
            started assessment of every session is there, with secrets removed. Its views: Overview, Assessments,
            Findings, Reports, Terminal, AI Assistant. Nothing in the dashboard writes to or decides anything the
            terminal reads.
          </p>
        </DocSection>
        <DocSection title="One run's report">
          <p>
            In the Reports view, with a run chosen, the summary strip shows its findings, plan steps, requests sent and
            masked evidence, Findings by Severity lists the top three findings by CVSS, and the findings table lists
            every finding (a false positive with its review state, named beside the count rather than in it:
            &quot;7 findings + 1 false positive&quot;). The download buttons offer:
          </p>
          <DocTable
            caption="The dashboard's export formats for one run"
            head={["Format", "What it is"]}
            rows={[
              { key: "PDF", value: "The styled report printed to PDF on this computer by a headless Chrome; page 1 is the one-page executive summary. Without one the route answers 501 with a link to the Word export and the hint \"PDF export needs a Chrome/Chromium browser on the dashboard machine (set RECONIX_CHROME). Download the Word (DOCX) report instead.\"" },
              { key: "JSON", value: "The complete saved assessment, exactly as the terminal wrote it (evidence already masked)." },
              { key: "DOCX", value: "The same report as an editable Word document, with every section of the PDF." },
            ]}
          />
          <p>
            Every format is a download: the dashboard fetches the whole file, then saves it, and the line under the
            buttons says what happened (&quot;Downloaded &lt;run&gt;.pdf.&quot;). A PDF that can&apos;t be printed shows the
            hint above with a <strong>Download DOCX</strong> link; any other failure says why, with{" "}
            <strong>Retry</strong>. With no run chosen, the Reports view sums up every saved run: Findings by
            Severity (the top three by CVSS) beside the Targets card, which lists every target, the most findings first,
            seven a page with Previous and Next (a target opens its newest run&apos;s report), and a table of the runs;
            each row opens that run&apos;s report and offers the same three downloads, with one status line under the
            table that names the run.
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
          <p>As specified in the v3 redesign plan, the Reports view builds one report from several runs:</p>
          <Steps>
            <li>
              <strong>Pick runs</strong>, one to five; the sixth is disabled with the reason. The selected count and a
              Clear button are shown.
            </li>
            <li>
              <strong>Set the options:</strong> include the (masked) evidence, include LOW findings, include the
              appendix.
            </li>
            <li>
              <strong>Preview:</strong> exactly what the PDF prints, shown in a sandboxed frame. A change to the
              selection or the options after it marks it out of date (&quot;Preview again before generating the PDF or
              the DOCX.&quot;) and the Generate buttons wait for a new preview; a preview that fails offers Retry.
            </li>
            <li>
              <strong>Generate PDF or Generate DOCX</strong> (once the preview is shown): the dashboard fetches the
              finished file and downloads it as one PDF or one Word document. Without a browser to print with, the PDF
              offers the Word document instead; a Word document over {DOCX_MAX_MIB} MB of text is refused with the reason (leave the
              evidence out, or save the PDF).
            </li>
          </Steps>
          <p>
            The combined report has ten sections and counts <strong>unique findings</strong> (same title, weakness and
            target) separately from their <strong>occurrences</strong> across runs. It is built on request from the saved
            files by <Mono>GET /api/reports/combined?uids=…&amp;format=preview|pdf|docx</Mono>,
            accepts one to five valid run ids (otherwise 400), only reads, and writes nothing. Missing data, a failed
            preview and a failed export each show their own state. The terminal keeps its own per-run export; combining
            runs is web-only.
          </p>
          <Callout>
            The dashboard needs Node.js 20 or later; the PDF needs a Chrome/Chromium on the machine. See{" "}
            <DocRef>Troubleshooting · The web dashboard</DocRef>.
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
        <DocSection title="Assessment">
          <p>
            One run&apos;s facts at the head of its report: what was assessed, by whom and when, its state and its scope,
            each as a labelled value and some as badges.
          </p>
          <p>
            Under them, <strong>Plan</strong> lists the run&apos;s steps in order, each with a status badge, a progress
            bar and how far it got as a percentage. Before the scope is approved there is no plan yet, and the panel
            says so.
          </p>
        </DocSection>
        <DocSection title="Findings">
          <p>
            Every finding in the open run as a table: ID, severity, the finding, its review state, the tool that found
            it, its weakness (CWE) and its rating. The worst severities come first.
          </p>
          <p>
            The note beside the title names false positives beside the count rather than inside it. Clicking an{" "}
            <strong>ID</strong> opens that finding in the Findings view with its evidence and remediation, and a false
            positive is opened with false positives shown, so the link never lands on a hidden row.
          </p>
        </DocSection>
        <DocSection title="Preview">
          <p>
            Exactly what the combined PDF will print, rendered in a fully sandboxed frame that scrolls inside itself. It
            appears after <strong>Preview report</strong> and takes focus, so the keyboard and screen readers land on it.
          </p>
          <p>
            Changing the selection or the options after a preview marks it out of date and the Generate buttons wait for
            a new one; a preview that fails offers <strong>Retry</strong>.
          </p>
        </DocSection>
        <DocSection title="Runs">
          <p>
            Every saved run, newest first: Run, Target, Status, Findings and Plan, with the run&apos;s own report to
            download in each format beside it. The note beside the title is how many are saved, or how many a search is
            showing.
          </p>
          <p>
            From seven runs up a search narrows the rows by ID, template, target or status; ten rows show at a time.
            Clicking a run&apos;s name opens that run&apos;s report. One status line under the table names the run a
            download belongs to &mdash; the formats themselves are in <DocRef>Reports &middot; Exporting</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Combine runs">
          <p>
            Builds one report out of several saved runs. Tick up to five runs in the table below it; the note beside the
            title counts what is picked, and the sixth tick is refused with the reason.
          </p>
          <p>
            The options are include the masked evidence, include LOW findings (off: only Critical, High and Medium) and
            include the appendix. <strong>Preview report</strong> shows it, then <strong>Generate</strong> saves it as
            one PDF or one Word document, and <strong>Clear selection</strong> empties the picks. A finding seen in
            several runs is counted once, with each run as an occurrence; the whole flow is in{" "}
            <DocRef>Reports &middot; The web dashboard</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Targets">
          <p>
            Every target across the saved runs, the most findings first, with its number of runs, its number of findings
            and the worst severity among them (or &quot;no findings&quot;). The note beside the title counts the
            targets.
          </p>
          <p>
            Seven targets show at a time, with Previous and Next under the list; the page is kept in the address, so a
            reload lands on the same one. A row opens that target&apos;s newest run report.
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
            Every finding across the runs this view covers — one run, or all of them — worst severity first, with its
            ID, severity, title, review state, tool and rating. Choosing a row opens that finding beside the list: its
            description, its masked evidence, its remediation and its references.
          </p>
          <p>
            The search box and the severity, review and tool filters narrow the list, and the open finding and the
            filters live in the address (<Mono>?view=findings&amp;sev=MEDIUM&amp;finding=F-001</Mono>). False positives
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
            <strong>Security knowledge</strong> opens the
            documents it may quote, and <strong>History</strong> lists earlier conversations, which survive a reload.
            Questions are masked before they are sent, and the assistant can neither approve, reject nor change
            anything: those stay in the terminal.
          </p>
        </DocSection>
      </>
    ),
  },
};
