/* The combined report's Generate buttons and status line (components/dashboard/report-file.tsx),
   rendered to markup: one button per file (PDF and DOCX) whose busy label is its own, focusable
   while it can't act (aria-disabled plus the reason as its description), and a status line that
   offers the Word document on a 501, says why on a 413 (nothing to retry), and offers Retry on a
   failure. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COMBINED_FILES, EXPORT_FILES, FileStatus, type FileState, GenerateButton } from "@/components/dashboard/report-file";
import type { CombinedFile } from "@/lib/report/combined/options";
import { DOCX_MEDIA, DOCX_TOO_LARGE, NO_PRINTER } from "@/lib/report/formats";

const noop = () => undefined;
const button = (format: CombinedFile, state: FileState, blocked = false) =>
  renderToStaticMarkup(createElement(GenerateButton, { format, state, blocked, describedBy: "why", onGenerate: noop }));
const status = (state: FileState) => renderToStaticMarkup(createElement(FileStatus, { state, onRetry: noop }));
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("the files", () => {
  it("are the PDF and the Word document, each with what it accepts", () => {
    expect(Object.keys(COMBINED_FILES)).toEqual(["pdf", "docx"]);
    expect(COMBINED_FILES.pdf.accept).toBe("application/pdf");
    expect(COMBINED_FILES.docx.accept).toBe(DOCX_MEDIA);
    expect(COMBINED_FILES.pdf.timeoutMs).toBeGreaterThan(90_000); // the printer's own limit is 90 s
  });
});

describe("GenerateButton", () => {
  it("names its format, and only the one in flight says Generating", () => {
    const busy: FileState = { kind: "generating", format: "pdf" };
    expect(text(button("pdf", { kind: "idle" }))).toContain("Generate PDF");
    expect(text(button("docx", { kind: "idle" }))).toContain("Generate DOCX");
    expect(text(button("pdf", busy))).toContain("Generating PDF…");
    expect(text(button("docx", busy))).toContain("Generate DOCX");
  });

  it("stays focusable while it can't act, with the reason as its description", () => {
    const blocked = button("docx", { kind: "idle" }, true);
    expect(blocked).toContain('aria-disabled="true"');
    expect(blocked).toContain('aria-describedby="why"');
    expect(blocked).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(button("docx", { kind: "idle" })).not.toContain('aria-disabled="');
  });
});

describe("FileStatus", () => {
  it("is in the page while idle, out of sight", () => {
    expect(status({ kind: "idle" })).toMatch(/^<p role="status" class="rep-status sr-only" data-file="idle">/);
  });

  it("offers the Word document when no browser can print the PDF", () => {
    const html = status({ kind: "unsupported", format: "pdf", message: NO_PRINTER, docx: "/api/reports/combined?uids=a&format=docx" });
    expect(html).toContain('data-format="pdf"');
    expect(html).toContain('href="/api/reports/combined?uids=a&amp;format=docx"');
    expect(text(html)).toContain("Download DOCX");
    expect(html).toContain("is-error");
  });

  it("says why a Word document is refused (413), with nothing to retry", () => {
    const html = status({ kind: "refused", format: "docx", message: DOCX_TOO_LARGE });
    expect(text(html)).toBe(DOCX_TOO_LARGE);
    expect(html).not.toContain("Retry");
    expect(html).toContain("is-error");
  });

  it("names the format that failed and offers Retry", () => {
    const html = status({ kind: "failed", format: "docx", message: "the dashboard could not be reached" });
    expect(text(html)).toContain("The DOCX could not be generated: the dashboard could not be reached.");
    expect(text(html)).toContain("Retry");
  });

  it("names the run whose file failed, where several runs offer files (the runs table)", () => {
    const html = status({ kind: "failed", format: "pdf", message: "the printer took too long", of: "RCX-001 (Web URL, 5 Oct 14:03)" });
    expect(text(html)).toContain("The PDF of RCX-001 (Web URL, 5 Oct 14:03) could not be generated: the printer took too long.");
  });

  it("covers one run's JSON too", () => {
    expect(EXPORT_FILES.json.accept).toBe("application/json");
    expect(text(status({ kind: "failed", format: "json", message: "x" }))).toContain("The JSON could not be generated: x.");
    expect(COMBINED_FILES.pdf).toBe(EXPORT_FILES.pdf);
  });

  it("says what is happening and what was saved", () => {
    expect(text(status({ kind: "generating", format: "docx" }))).toBe(COMBINED_FILES.docx.doing);
    expect(text(status({ kind: "done", format: "docx", name: "combined-2-runs-2026-10-21.docx" }))).toBe("Downloaded combined-2-runs-2026-10-21.docx.");
  });
});
