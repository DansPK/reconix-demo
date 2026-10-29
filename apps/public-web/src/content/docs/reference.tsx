import { DocLink, DocSection, Mono } from "@/components/docs-layout";
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
            Severity comes from the scanner or a CVSS score, never a guess. Without either, a finding is marked{" "}
            <Mono>UNKNOWN</Mono>.
          </p>
        </DocSection>
        <DocSection title="Confidence">
          <p>
            Classifications with confidence below 0.80 are marked <Mono>NEEDS_REVIEW</Mono> for a person to check.
          </p>
        </DocSection>
        <DocSection title="Evidence">
          <p>Each finding keeps its original evidence linked, with secrets masked.</p>
        </DocSection>
        <DocSection title="Browsing findings">
          <p>
            In the <DocLink href="/docs/interfaces/local-viewer">local viewer</DocLink>, filter findings by severity, target,
            category and tool.
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
          <ul>
            <li>The approved scope.</li>
            <li>Findings, with their evidence (masked).</li>
            <li>Limitations of the assessment.</li>
            <li>Recommended fixes.</li>
          </ul>
        </DocSection>
        <DocSection title="Generating and exporting">
          <p>
            Generate the report from the terminal when the analysis is complete. Review it in the{" "}
            <DocLink href="/docs/interfaces/local-viewer">local viewer</DocLink> and export it as PDF.
          </p>
        </DocSection>
      </>
    ),
  },
};
