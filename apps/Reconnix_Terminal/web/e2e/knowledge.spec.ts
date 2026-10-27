/* The Security knowledge page (`?view=knowledge`). The e2e server runs the knowledge CLI's
   stand-in (e2e/knowledge-cli-stub.mjs, the same contract as python -m reconix.knowledge) over
   KNOWLEDGE_DIR, which this spec empties before and after (the same project runs
   e2e/assistant-knowledge.spec.ts, one spec at a time). In order: the assistant's button opens the
   page and "← AI Assistant" goes back; a .md and a .pdf are uploaded and listed as web uploads;
   search, the Grid switch (remembered), Open (the original with its type) and Remove (asked first);
   the dialog refuses a .doc and shows the server's refusal; signed out, the page goes to sign-in
   and the routes answer 401; a phone starts on the grid with nothing sideways; axe on the table,
   the grid and the dialog. */
import { rmSync } from "node:fs";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { KNOWLEDGE_DIR, PORT } from "../playwright.config";
import { axe } from "./axe";
import { sideways } from "./support";

const ORIGIN = `http://127.0.0.1:${PORT}`;

// the real CLI starts a Python with Reconix's imports for every change (seconds each, more on a
// busy machine): waits on its answers allow its own 60 s limit
const CLI = { timeout: 60_000 };
test.describe.configure({ mode: "serial", timeout: 180_000 });
test.beforeAll(() => rmSync(KNOWLEDGE_DIR, { recursive: true, force: true }));
test.afterAll(() => rmSync(KNOWLEDGE_DIR, { recursive: true, force: true }));

/** A one-page PDF holding `text` (the xref offsets computed), small enough to read in a test. */
function miniPdf(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const RUNBOOK = { name: "quokka-runbook.md", mimeType: "text/markdown", buffer: Buffer.from("# Quokka runbook\n\nRotate the zephyrine quokka keys every 30 days.\n") };
const POLICY = { name: "testing-policy.pdf", mimeType: "application/pdf", buffer: miniPdf("Testing windows are agreed in writing.") };

const pane = (page: Page) => page.locator('[data-view-pane="knowledge"]');
const dialog = (page: Page) => page.getByRole("dialog", { name: "Upload a knowledge file" });
const table = (page: Page) => page.getByRole("table", { name: "Knowledge files" });
const grid = (page: Page) => page.getByRole("list", { name: "Knowledge files" });
const row = (page: Page, name: string) => table(page).getByRole("row").filter({ has: page.getByRole("rowheader", { name }) });

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await pane(page).getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel("File").setInputFiles(file);
  await dialog(page).getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog(page)).toBeHidden(CLI);
  await expect(pane(page).getByText(`Added “${file.name}”`)).toBeVisible();
}

test("the assistant's Security knowledge button opens the page, and ← AI Assistant goes back", async ({ page }) => {
  await page.goto("/?view=assistant");
  await page.getByRole("button", { name: "Security knowledge" }).click();
  await expect(page).toHaveURL(/[?&]view=knowledge\b/);
  await expect(pane(page).getByRole("heading", { level: 1, name: "Security knowledge" })).toBeVisible();
  await expect(pane(page).getByText("No knowledge files yet.")).toBeVisible();
  await axe(page, "knowledge (empty)");

  await pane(page).getByRole("button", { name: "AI Assistant" }).click();
  await expect(page).toHaveURL(/[?&]view=assistant\b/);
  await expect(page.getByRole("textbox", { name: /^Ask about/ }).last()).toBeVisible();
});

test("upload a .md and a .pdf: listed as web uploads, newest first", async ({ page }) => {
  await page.goto("/?view=knowledge");
  await upload(page, RUNBOOK);
  await upload(page, POLICY);
  await expect(table(page).getByRole("row")).toHaveCount(3); // the header row and two files
  await expect(row(page, POLICY.name)).toContainText("Web upload · PDF");
  await expect(row(page, RUNBOOK.name)).toContainText(/Web upload · MD · \d+ B/);
  const names = await table(page).getByRole("rowheader").allTextContents();
  expect(names.map((n) => n.trim())).toEqual([POLICY.name, RUNBOOK.name]);
  await expect(pane(page).getByRole("region", { name: "Knowledge files" })).toContainText("2 of 50 files");
  await axe(page, "knowledge table");
});

test("search filters by name, and says when nothing matches", async ({ page }) => {
  await page.goto("/?view=knowledge");
  const search = pane(page).getByRole("searchbox", { name: "Search knowledge files by name" });
  await search.fill("QUOKKA");
  await expect(table(page).getByRole("rowheader")).toHaveText([RUNBOOK.name]);
  await expect(pane(page).getByText("Showing 1 of 2 files")).toBeVisible();
  await search.fill("nothing-like-it");
  await expect(pane(page).getByText("No knowledge file has “nothing-like-it” in its name.")).toBeVisible();
  await pane(page).getByRole("button", { name: "Clear the search" }).click();
  await expect(table(page).getByRole("rowheader")).toHaveCount(2);
});

test("the Grid switch shows cards, and the choice is remembered", async ({ page }) => {
  await page.goto("/?view=knowledge");
  const layout = pane(page).getByRole("group", { name: "Layout" });
  await expect(layout.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  await layout.getByRole("button", { name: "Grid" }).click();
  await expect(grid(page).getByRole("listitem")).toHaveCount(2);
  await expect(grid(page).getByRole("listitem").first()).toContainText(POLICY.name);
  await expect(grid(page).getByRole("listitem").first()).toContainText("Web upload · PDF");
  await expect(table(page)).toHaveCount(0);
  await axe(page, "knowledge grid");
  await page.reload();
  await expect(grid(page)).toBeVisible();
  await expect(pane(page).getByRole("group", { name: "Layout" }).getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
  await pane(page).getByRole("group", { name: "Layout" }).getByRole("button", { name: "Table" }).click();
  await expect(table(page)).toBeVisible();
});

test("Open returns the original with its type: in a new tab for PDF and text", async ({ page }) => {
  await page.goto("/?view=knowledge");
  const pdf = pane(page).getByRole("link", { name: `Open ${POLICY.name}` });
  await expect(pdf).toHaveAttribute("target", "_blank");
  const pdfRes = await page.request.get((await pdf.getAttribute("href"))!);
  expect(pdfRes.status()).toBe(200);
  expect(pdfRes.headers()["content-type"]).toBe("application/pdf");
  expect(pdfRes.headers()["content-disposition"]).toMatch(/^inline; filename="testing-policy\.pdf"/);
  expect(pdfRes.headers()["content-security-policy"]).toContain("sandbox");
  expect(pdfRes.headers()["x-content-type-options"]).toBe("nosniff");
  expect(Buffer.compare(await pdfRes.body(), POLICY.buffer)).toBe(0);

  const md = pane(page).getByRole("link", { name: `Open ${RUNBOOK.name}` });
  const mdRes = await page.request.get((await md.getAttribute("href"))!);
  expect(mdRes.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect(await mdRes.text()).toContain("Rotate the zephyrine quokka keys");

  // the browser opens it in a new tab
  const [tab] = await Promise.all([page.waitForEvent("popup"), md.click()]);
  await tab.waitForLoadState();
  await expect(tab.locator("body")).toContainText("Rotate the zephyrine quokka keys");
  await tab.close();
});

test("Remove asks first (No is the default), then the file is gone", async ({ page }) => {
  await page.goto("/?view=knowledge");
  await pane(page).getByRole("button", { name: `Remove ${RUNBOOK.name}` }).click();
  const question = pane(page).getByRole("group", { name: `Remove ${RUNBOOK.name}?` });
  await expect(question).toContainText("Remove this file?");
  await expect(question.getByRole("button", { name: "No" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(question).toHaveCount(0);
  await expect(pane(page).getByRole("button", { name: `Remove ${RUNBOOK.name}` })).toBeFocused();

  await pane(page).getByRole("button", { name: `Remove ${RUNBOOK.name}` }).click();
  await question.getByRole("button", { name: "Yes, remove" }).click();
  await expect(row(page, RUNBOOK.name)).toHaveCount(0, CLI);
  await expect(pane(page).getByText(`Removed “${RUNBOOK.name}”`)).toBeVisible();
  await expect(table(page).getByRole("rowheader")).toHaveText([POLICY.name]);
});

test("the dialog refuses a .doc before sending, and keeps the server's refusal in view", async ({ page }) => {
  await page.goto("/?view=knowledge");
  await pane(page).getByRole("button", { name: "Upload", exact: true }).click();
  const d = dialog(page);
  await expect(d.getByText("DOCX, PDF, TXT, MD, JSON or YAML, up to 10 MB.")).toBeVisible();
  await expect(d.getByLabel("File")).toHaveAttribute("accept", ".docx,.pdf,.txt,.md,.json,.yaml,.yml");
  await axe(page, "knowledge upload dialog");

  await d.getByLabel("File").setInputFiles({ name: "old-report.doc", mimeType: "application/msword", buffer: Buffer.from("old word") });
  await expect(d.getByRole("alert")).toHaveText("A .doc file can't be read. Save it as .docx first.");
  await expect(d.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();

  // the server's own refusal (a file with no text, refused by the CLI as /add-on refuses it): the
  // dialog stays open and says why
  await d.getByLabel("File").setInputFiles({ name: "blank.md", mimeType: "text/markdown", buffer: Buffer.from("   \n\n  ") });
  await expect(d.getByRole("alert")).toHaveCount(0);
  await d.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(d.getByRole("alert")).toHaveText("That file has no readable text to add.", CLI);
  await expect(d).toBeVisible();
  await axe(page, "knowledge upload dialog with a refusal");

  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();
  await expect(pane(page).getByRole("button", { name: "Upload", exact: true })).toBeFocused();
  await expect(table(page).getByRole("rowheader")).toHaveText([POLICY.name]);
});

test("a phone starts on the grid, and nothing scrolls sideways at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/?view=knowledge");
  await expect(grid(page)).toBeVisible();
  expect(await sideways(page)).toEqual({ page: 0, content: 0 });
  await pane(page).getByRole("group", { name: "Layout" }).getByRole("button", { name: "Table" }).click();
  await expect(table(page)).toBeVisible();
  expect(await sideways(page)).toEqual({ page: 0, content: 0 });
  await pane(page).getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  expect(await sideways(page)).toEqual({ page: 0, content: 0 });
});

test("through the proxy: a file of exactly 10 MB is taken, one byte more is refused (413)", async ({ page }) => {
  await page.goto("/?view=knowledge");
  const post = (name: string, size: number) =>
    page.request.post("/api/knowledge", { headers: { Origin: ORIGIN }, multipart: { file: { name, mimeType: "text/plain", buffer: Buffer.alloc(size, 97) } } });
  const ten = await post("ten-mb.txt", 10 * 1024 * 1024);
  expect(ten.status()).toBe(201);
  expect((await post("over.txt", 10 * 1024 * 1024 + 1)).status()).toBe(413);
  expect((await post("far-over.txt", 12 * 1024 * 1024)).status()).toBe(413);
  const { source } = await ten.json();
  expect((await page.request.delete(`/api/knowledge/${source.id}`, { headers: { Origin: ORIGIN } })).status()).toBe(200);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the page goes to sign-in and the routes answer 401", async ({ page }) => {
    await page.goto("/?view=knowledge");
    await expect(page).toHaveURL(/\/login$/);

    expect((await page.request.get("/api/knowledge")).status()).toBe(401);
    const post = await page.request.post("/api/knowledge", { headers: { Origin: ORIGIN }, multipart: { file: RUNBOOK } });
    expect(post.status()).toBe(401);
  });
});
