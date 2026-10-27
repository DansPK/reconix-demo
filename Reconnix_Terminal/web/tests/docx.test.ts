/* The Word reports (lib/report/docx/): a valid package (every part well-formed XML, stored
   entries whose CRCs check, no external relationship), the same sections as the PDF, every value
   escaped and stripped of what XML can't hold, one run per value, a bounded size (DocxTooLarge
   past DOCX_MAX_BYTES), and nothing the mask removed (more in docx-masking.test.ts). */
import { describe, expect, it } from "vitest";

import { combineAssessments } from "@/lib/report/combined/select";
import { DEFAULT_COMBINE_OPTIONS } from "@/lib/report/combined/options";
import { renderCombinedDocx } from "@/lib/report/docx/combined";
import { type Block, DOCX_MAX_BYTES, docxFile, DocxTooLarge, xmlText } from "@/lib/report/docx/ooxml";
import { renderReportDocx } from "@/lib/report/docx/report";
import { crc32, zipStore } from "@/lib/report/docx/zip";
import { DOCX_MAX_MIB, DOCX_TOO_LARGE } from "@/lib/report/formats";
import { maskAssessment } from "@/lib/report/mask";

import { sampleAssessments } from "./fixtures";
import { unzip } from "./unzip";
import { assertWellFormed } from "./xml";

const samples = sampleAssessments();
const withFindings = samples.find((a) => a.findings.length > 0)!;
const NOW = new Date("2026-10-21T08:00:00Z");

const PARTS = ["[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "word/_rels/document.xml.rels", "word/styles.xml", "word/document.xml"];

describe("the package", () => {
  it("holds the document, its styles and its properties, and nothing that loads from elsewhere", () => {
    const parts = unzip(renderReportDocx(withFindings, NOW));
    expect([...parts.keys()]).toEqual(PARTS);
    for (const [name, xml] of parts) expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), name).toBe(true);
    const rels = [...parts].filter(([n]) => n.endsWith(".rels")).map(([, x]) => x).join("");
    expect(rels).not.toContain("TargetMode");
    expect(rels).not.toMatch(/Target="https?:/);
    expect(parts.get("[Content_Types].xml")).not.toMatch(/macroEnabled|vbaProject|oleObject/i);
  });

  it("is well-formed XML in every part, for one run and for a combined report", () => {
    const combined = renderCombinedDocx(combineAssessments(samples.slice(0, 4).map(maskAssessment), DEFAULT_COMBINE_OPTIONS), NOW);
    for (const file of [...samples.map((a) => renderReportDocx(a, NOW)), combined]) {
      const parts = unzip(file);
      expect(parts.size).toBe(PARTS.length);
      for (const [name, xml] of parts) expect(() => assertWellFormed(xml), name).not.toThrow();
    }
  });

  it("checks the checker: it refuses what a parser would", () => {
    for (const bad of ["<a><b></a></b>", "<a>x & y</a>", '<a b="1" b="2"/>', "<a b=1/>", "<a/><b/>", "<a>]]></a>", "<a>\u0001</a>", "<a>", '<a b="<"/>']) {
      expect(() => assertWellFormed(bad), bad).toThrow();
    }
    expect(() => assertWellFormed('<?xml version="1.0"?>\n<a x="&amp;&#10;"><b/>t &lt; <![CDATA[<raw>]]></a>')).not.toThrow();
  });

  it("checks each entry with a CRC-32 that matches the standard's values", () => {
    const enc = new TextEncoder();
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(enc.encode("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
  });

  it("is the same bytes for the same report", () => {
    expect(renderReportDocx(withFindings, NOW)).toEqual(renderReportDocx(withFindings, NOW));
  });

  it("refuses an entry name it did not choose", () => {
    expect(() => zipStore([{ name: "../evil", data: new Uint8Array() }])).toThrow();
  });
});

describe("one run's report", () => {
  it("has the PDF's five sections and every finding", () => {
    const doc = unzip(renderReportDocx(withFindings, NOW)).get("word/document.xml") ?? "";
    for (const heading of ["Security Assessment Report", "1 Executive summary", "2 Findings summary", "3 Approved scope &amp; limitations", "4 Detailed findings", "5 Policy &amp; governance"]) {
      expect(doc).toContain(heading);
    }
    for (const f of withFindings.findings) expect(doc).toContain(xmlText(`${f.id} · ${f.title}`));
    expect(doc).toContain("Evidence &amp; validation (masked)");
  });

  it("escapes markup and drops the characters XML can't hold", () => {
    const tricky = structuredClone(withFindings);
    tricky.findings[0].description = '<script>alert("x")</script> & ]]> \u0001\u0008 done';
    tricky.findings[0].evidence = ["GET /?q=<img src=x onerror=1>", "tab\there"];
    const doc = unzip(renderReportDocx(tricky, NOW)).get("word/document.xml") ?? "";
    expect(doc).not.toContain("<script");
    expect(doc).not.toContain("<img");
    expect(doc).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; ]]&gt;  done");
    expect(doc).not.toMatch(/[\u0000-\u0008]/);
    expect(doc).toContain("<w:tab/>");
  });

  it("puts all of a value's lines in one run, its properties once, and keeps one blank line of many", () => {
    const blocks: Block[] = [{ kind: "pre", lines: ["first", "", "", "", "second\tcol", "third"] }];
    const doc = unzip(docxFile(blocks, { title: "t", created: NOW.toISOString() })).get("word/document.xml") ?? "";
    const evidence = doc.slice(doc.indexOf('<w:pStyle w:val="Evidence"/>'));
    expect(evidence.match(/<w:r>/g)).toHaveLength(1);
    expect(evidence.match(/<w:rPr>/g)).toHaveLength(1);
    // first, one blank line, second<tab>col, third: three breaks
    expect(evidence).toContain("first</w:t><w:br/><w:br/><w:t>second</w:t><w:tab/><w:t>col</w:t><w:br/>");
    expect(evidence.match(/<w:br\/>/g)).toHaveLength(3);
  });

  it("stays small for text that is mostly line breaks", () => {
    const flood = structuredClone(withFindings);
    flood.findings[0].evidence = ["\n".repeat(19_999)];
    flood.findings[0].description = "a\n".repeat(9_999);
    const size = unzip(renderReportDocx(flood, NOW)).get("word/document.xml")!.length;
    const base = unzip(renderReportDocx(withFindings, NOW)).get("word/document.xml")!.length;
    expect(size - base).toBeLessThan(9_999 * 25); // ~19 bytes a short line; the 19,999 blank ones are one
  });
  it("prints only what the mask left", () => {
    const leaky = structuredClone(withFindings);
    leaky.findings[0].evidence = ["password=hunter2", "Cookie: sid=abc123"];
    leaky.findings[0].triage_note = "retested with token=sk-live-0123456789abcdef";
    const doc = unzip(renderReportDocx(maskAssessment(leaky), NOW)).get("word/document.xml") ?? "";
    expect(doc).not.toContain("hunter2");
    expect(doc).not.toContain("abc123");
    expect(doc).not.toContain("sk-live-0123456789abcdef");
  });
});

describe("the size cap", () => {
  it("is DOCX_MAX_MIB, the number the 413's message names", () => {
    expect(DOCX_MAX_BYTES).toBe(DOCX_MAX_MIB * 1024 * 1024);
    expect(DOCX_TOO_LARGE).toContain(`${DOCX_MAX_MIB} MB`);
  });

  it("refuses a document past the limit, and builds one under it", () => {
    const blocks: Block[] = [{ kind: "para", runs: ["x".repeat(5_000)] }];
    const meta = { title: "t", created: NOW.toISOString() };
    expect(() => docxFile(blocks, meta, 4_000)).toThrow(DocxTooLarge);
    expect(() => docxFile(blocks, meta, 6_000)).not.toThrow();
    // escaping counts: 1,000 ampersands are 5,000 bytes of XML
    expect(() => docxFile([{ kind: "para", runs: ["&".repeat(1_000)] }], meta, 4_000)).toThrow(DocxTooLarge);
  });

  it("refuses a real report whose text passes DOCX_MAX_BYTES", () => {
    const huge = structuredClone(withFindings);
    // 20,000-character lines (the schema's longest string), each & five bytes of XML
    huge.findings[0].evidence = Array.from({ length: Math.ceil(DOCX_MAX_BYTES / 100_000) + 1 }, () => "&".repeat(20_000));
    expect(() => renderReportDocx(huge, NOW)).toThrow(DocxTooLarge);
    const report = combineAssessments([huge], DEFAULT_COMBINE_OPTIONS);
    expect(() => renderCombinedDocx(report, NOW)).toThrow(DocxTooLarge);
    // without the evidence the same run fits
    expect(() => renderCombinedDocx(combineAssessments([huge], { ...DEFAULT_COMBINE_OPTIONS, evidence: false }), NOW)).not.toThrow();
  });

});

describe("the combined report", () => {
  it("has the ten sections and every run", () => {
    const picked = samples.slice(0, 3).map(maskAssessment);
    const doc = unzip(renderCombinedDocx(combineAssessments(picked, DEFAULT_COMBINE_OPTIONS), NOW)).get("word/document.xml") ?? "";
    for (const name of ["Executive summary", "Assessment overview", "Combined findings summary", "Individual assessment sections", "Evidence &amp; technical details", "Risk &amp; remediation priorities", "Limitations", "Appendix &amp; references"]) {
      expect(doc).toContain(name);
    }
    for (const a of picked) expect(doc).toContain(a.uid);
  });

  it("leaves the evidence out when the option is off", () => {
    const picked = [maskAssessment(withFindings)];
    const report = combineAssessments(picked, { ...DEFAULT_COMBINE_OPTIONS, evidence: false });
    const doc = unzip(renderCombinedDocx(report, NOW)).get("word/document.xml") ?? "";
    expect(doc).toContain("Evidence lines were left out by the report&apos;s options.");
    expect(doc).not.toContain('w:val="Evidence"');
  });
});
