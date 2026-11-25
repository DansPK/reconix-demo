import { Callout, DocLink, DocSection, Mono } from "@/components/docs-layout";
import type { GroupContent } from "@/content/docs/types";

export const reference: GroupContent = {
  findings: {
    lede: "Findings, not raw output: classified, correlated, rated and backed by evidence.",
    body: (
      <>
        <DocSection title="How findings are made">
          <ul>
            <li>Results from different tools are normalized into one findings format.</li>
            <li>They are classified, correlated across tools, rated and explained.</li>
            <li>Impact and remediation are explained with OWASP, CWE and CVE/NVD knowledge.</li>
          </ul>
        </DocSection>
        <DocSection title="Severity">
          <p>
            <Mono>CRITICAL</Mono>, <Mono>HIGH</Mono>, <Mono>MEDIUM</Mono> and <Mono>LOW</Mono>. Severity comes from the
            scanner or a CVSS score, never a guess. Two more values mark findings without a rated impact:
          </p>
          <ul>
            <li>
              <Mono>UNKNOWN</Mono>: the tool gave no severity. Review it.
            </li>
            <li>
              <Mono>NONE</Mono>: informational, with no direct impact, such as an open port.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Review state">
          <p>Every finding carries where its review stands, so nothing uncertain reads as settled.</p>
          <ul>
            <li>
              <strong>Confirmed</strong>: validated with evidence.
            </li>
            <li>
              <strong>Needs review</strong>: open and not confirmed yet, for a person to check.
            </li>
            <li>
              <strong>Closed</strong>: fixed, accepted, or a false positive.
            </li>
          </ul>
        </DocSection>
        <DocSection title="Evidence">
          <p>Each finding keeps its original evidence linked, with secrets masked.</p>
        </DocSection>
        <DocSection title="Browsing findings">
          <p>
            In the <DocLink href="/docs/interfaces/local-viewer">local dashboard</DocLink>, filter findings by severity
            and review state, or search them as text. In the terminal, <Mono>/findings</Mono> lists them and{" "}
            <Mono>/finding</Mono> opens one.
          </p>
        </DocSection>
      </>
    ),
  },
  reports: {
    lede: "A report ready to hand over.",
    body: (
      <>
        <DocSection title="What a report contains">
          <ol className="space-y-2 [&_li]:ml-5 [&_li]:list-decimal">
            <li>Executive summary.</li>
            <li>Findings summary, with severity, CVSS, status and category per finding.</li>
            <li>Approved scope and the assessment&apos;s limitations.</li>
            <li>Detailed findings, with their masked evidence.</li>
            <li>Policy and governance: the gated actions you decided on, and any blocked requests with the reason.</li>
          </ol>
          <p>When an assessment follows an earlier one, the report also lists the changes since then.</p>
        </DocSection>
        <DocSection title="Generating and exporting">
          <p>
            Open the report with <Mono>/report</Mono> in the terminal, then <Mono>/export</Mono> to save it as PDF, JSON
            or DOCX. The same three formats are available in the{" "}
            <DocLink href="/docs/interfaces/local-viewer">local dashboard</DocLink>.
          </p>
          <Callout>
            A report can be generated once the assessment is complete. PDF and DOCX need their optional libraries
            installed; JSON always works.
          </Callout>
        </DocSection>
      </>
    ),
  },
};
