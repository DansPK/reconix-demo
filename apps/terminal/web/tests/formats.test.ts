/* The export format registry and the renderers the downloads, the assistant and the route share:
   PDF (printed by a headless Chrome), JSON and DOCX. */
import { describe, expect, it } from "vitest";

import { EXPORT_FORMATS, NO_PRINTER, downloadHref, exportFileName, isExportFormat } from "@/lib/report/formats";
import { renderFile } from "@/lib/report/render";

import { sampleAssessments } from "./fixtures";
import { unzip } from "./unzip";

const assessment = sampleAssessments().find((a) => a.findings.length > 0)!;

describe("export formats", () => {
  it("lists PDF, JSON and DOCX, each with its own extension and media type", () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(["pdf", "json", "docx"]);
    expect(new Set(EXPORT_FORMATS.map((f) => f.ext)).size).toBe(3);
    expect(new Set(EXPORT_FORMATS.map((f) => f.media)).size).toBe(3);
  });

  it("accepts only known ids", () => {
    expect(isExportFormat("docx")).toBe(true);
    for (const bad of ["exe", "", "PDF", "../pdf", "html", "csv", "sarif", "markdown"]) expect(isExportFormat(bad)).toBe(false);
  });

  it("builds the file name and the download link from the uid", () => {
    expect(exportFileName("20261005-140300-9f76_RCX-001", "docx")).toBe("20261005-140300-9f76_RCX-001.docx");
    expect(downloadHref("u1", "json")).toBe("/api/assessments/u1/export?format=json");
    expect(downloadHref("a b/c", "docx")).toBe("/api/assessments/a%20b%2Fc/export?format=docx");
  });

  it("points at the Word document when no browser can print", () => {
    expect(NO_PRINTER).toContain("DOCX");
    expect(NO_PRINTER).not.toContain("HTML");
  });
});

describe("renderFile", () => {
  it("renders the JSON and the Word document from one assessment", () => {
    const json = JSON.parse(renderFile("json", assessment) as string);
    expect(json.uid).toBe(assessment.uid);
    expect(json.findings).toHaveLength(assessment.findings.length);
    const docx = renderFile("docx", assessment) as Uint8Array;
    expect(String.fromCharCode(docx[0], docx[1])).toBe("PK");
    expect(unzip(docx).get("word/document.xml")).toContain("Security Assessment Report");
  });
});
