/* The Security knowledge page (`/knowledge`). The documents are the Core API's knowledge add-ons
   (src/lib/api/knowledge.ts), here its stand-in's (e2e/core-api-stub.mjs, the routes of
   services/api api/knowledge_add_ons.py), which this spec empties before and after (the same
   project runs e2e/assistant-knowledge.spec.ts, one spec at a time). In order: the assistant's
   button opens the page and "← AI Assistant" goes back; a .md and a .pdf are uploaded, listed
   newest first and wait, not ingested, until Ingest puts them in; search by name; a document
   picked shows what it talks about and its passages (no Open: the API keeps no copy of the file);
   Remove asks first (Keep is the default), then the file is gone; the dialog refuses a .doc and
   shows the server's refusal; a phone has nothing sideways; through the proxy, 10 MB is taken
   and a byte more refused; signed out, the page goes to sign-in and the routes answer 401; axe
   on the empty page, the list with the graph, and the dialog. */
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { CORE_API_PORT, PORT } from "../playwright.config";
import { axe } from "./axe";
import { hydrated, sideways } from "./support";

const ORIGIN = `http://127.0.0.1:${PORT}`;
const CORE_API = `http://127.0.0.1:${CORE_API_PORT}/api/v1`;

test.describe.configure({ mode: "serial" });

/** Remove every add-on on the Core API (DELETE /knowledge-add-ons), as a person's own session would. */
async function clearKnowledge() {
  const session = await (await fetch(`${CORE_API}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"interface":"web"}' })).json();
  const res = await fetch(`${CORE_API}/knowledge-add-ons`, { method: "DELETE", headers: { Authorization: `Bearer ${session.token}` } });
  expect(res.status).toBe(200);
}
test.beforeAll(clearKnowledge);
test.afterAll(clearKnowledge);

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

const RUNBOOK = {
  name: "quokka-runbook.md",
  mimeType: "text/markdown",
  buffer: Buffer.from("# Quokka runbook\n\nRotate the zephyrine quokka keys every 30 days. A leaked key is CWE-798.\n"),
};
const POLICY = { name: "testing-policy.pdf", mimeType: "application/pdf", buffer: miniPdf("Testing windows are agreed in writing.") };

const pane = (page: Page) => page.locator('[data-view-pane="knowledge"]');
const dialog = (page: Page) => page.getByRole("dialog", { name: "Upload a knowledge file" });
const docs = (page: Page) => pane(page).getByRole("list", { name: "Ingested documents" });
const doc = (page: Page, name: string) => docs(page).getByRole("listitem").filter({ hasText: name });
/** A document's own button (picks it in the graph), not its Remove. */
const pickButton = (page: Page, name: string) => doc(page, name).getByRole("button", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `) });
/** Open the page and wait until it is interactive (the fixture waits only for "/"): a key press
    before hydration is lost. */
async function openKnowledge(page: Page) {
  await page.goto("/knowledge");
  await hydrated(page);
}
const notifications = (page: Page) => page.getByRole("region", { name: "Notifications" });

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await pane(page).getByRole("button", { name: "Upload", exact: true }).click(); // the header's (the empty page has a second)
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel("File").setInputFiles(file);
  await dialog(page).getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  // a web upload waits for Ingest (lib/api/knowledge.ts sends ingest_now=false)
  await expect(notifications(page)).toContainText(`Added “${file.name}” (1 passage), not ingested yet: press Ingest to let the AI Assistant search it.`);
}

test("the assistant's Security knowledge button opens the page, and ← AI Assistant goes back", async ({ page }) => {
  await page.goto("/assistant");
  await page.getByRole("button", { name: "Security knowledge" }).click();
  await expect(page).toHaveURL(/\/knowledge(\?|$)/);
  await expect(pane(page).getByRole("heading", { level: 1, name: "Security knowledge" })).toBeVisible();
  await expect(pane(page).getByText("No knowledge yet", { exact: true })).toBeVisible();
  await axe(page, "knowledge (empty)");

  await pane(page).getByRole("button", { name: "AI Assistant" }).click();
  await expect(page).toHaveURL(/\/assistant(\/[^/?]+)?(\?|$)/);
  await expect(page.getByRole("textbox", { name: /^Ask about/ }).last()).toBeVisible();
});

test("upload a .md and a .pdf: listed newest first, waiting until Ingest puts them in", async ({ page }) => {
  await openKnowledge(page);
  await upload(page, RUNBOOK);
  await upload(page, POLICY);
  await expect(docs(page).getByRole("listitem")).toHaveCount(2);
  const names = await docs(page).getByRole("listitem").locator(".kn-doc-name").allTextContents();
  expect(names).toEqual([POLICY.name, RUNBOOK.name]);
  await expect(doc(page, RUNBOOK.name)).toContainText(`1 passage · 1 links · ${RUNBOOK.buffer.length} B`);
  await expect(doc(page, RUNBOOK.name)).toContainText("Not ingested");
  await expect(pane(page).getByText("2 not ingested")).toBeVisible();

  // Ingest puts only the waiting documents into the knowledge search (POST /knowledge/reingest?scope=NEW)
  await pane(page).getByRole("button", { name: "Ingest 2 new" }).click();
  await expect(pane(page).getByRole("status").filter({ hasText: "Ingested 2 documents · the AI Assistant can search them now" })).toBeVisible();
  await expect(docs(page).getByText("Not ingested")).toHaveCount(0);
  await expect(pane(page).getByRole("button", { name: /^Ingest \d+ new$/ })).toHaveCount(0);
  await axe(page, "knowledge list and graph");
});

test("search filters by name, and says when nothing matches", async ({ page }) => {
  await openKnowledge(page);
  const search = pane(page).getByRole("searchbox", { name: "Search documents by name" });
  await search.fill("QUOKKA");
  await expect(docs(page).getByRole("listitem")).toHaveCount(1);
  await expect(docs(page).getByRole("listitem")).toContainText(RUNBOOK.name);
  await search.fill("nothing-like-it");
  await expect(pane(page).getByText("No document has “nothing-like-it” in its name.")).toBeVisible();
  await search.fill("");
  await expect(docs(page).getByRole("listitem")).toHaveCount(2);
});

// Open was removed: the Core API keeps no copy of the file, only its masked passages, so a
// picked document shows what it talks about and its passages instead
test("a picked document shows what it talks about and its passages; there is no Open", async ({ page }) => {
  await openKnowledge(page);
  await expect(pane(page).getByRole("link", { name: /^Open / })).toHaveCount(0);
  const pick = pickButton(page, RUNBOOK.name);
  await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  const details = pane(page).getByRole("complementary", { name: "Document details" });
  await expect(details).toContainText(RUNBOOK.name);
  await expect(details).toContainText("The AI Assistant searches it.");
  await expect(details.getByRole("button", { name: "CWE-798" })).toBeVisible(); // Overview: the CWE it names
  await details.getByRole("tab", { name: "Content" }).click();
  await expect(details.getByRole("tab", { name: "Content" })).toHaveAttribute("aria-selected", "true");
  await expect(details).toContainText("Part 1");
  await expect(details).toContainText("Rotate the zephyrine quokka keys every 30 days.");
  await axe(page, "knowledge document details");

  await details.getByRole("button", { name: "Close the details" }).click();
  await expect(details).toHaveCount(0);
  await expect(pick).toHaveAttribute("aria-pressed", "false");
});

test("Remove asks first (Keep is the default), then the file is gone", async ({ page }) => {
  await openKnowledge(page);
  const remove = pane(page).getByRole("button", { name: `Remove ${RUNBOOK.name}` });
  await remove.click();
  const question = pane(page).getByRole("group", { name: `Remove ${RUNBOOK.name}?` });
  await expect(question).toContainText("The AI Assistant stops using it.");
  await expect(question.getByRole("button", { name: "Keep" })).toBeFocused();
  await page.keyboard.press("Enter"); // Keep, by keyboard
  await expect(question).toHaveCount(0);
  await expect(doc(page, RUNBOOK.name)).toHaveCount(1);
  // where the focus goes after Keep: the last test of this file (it fails today, see there)

  await remove.click();
  await question.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(doc(page, RUNBOOK.name)).toHaveCount(0);
  await expect(notifications(page)).toContainText(`Removed “${RUNBOOK.name}”. The AI Assistant no longer uses it.`);
  await expect(docs(page).getByRole("listitem")).toHaveCount(1);
  await expect(docs(page).getByRole("listitem")).toContainText(POLICY.name);
});

test("the dialog refuses a .doc before sending, and keeps the server's refusal in view", async ({ page }) => {
  await openKnowledge(page);
  const upload = pane(page).getByRole("button", { name: "Upload", exact: true });
  await upload.click();
  const d = dialog(page);
  await expect(d).toContainText("no copy of the file itself is kept.");
  await expect(d.getByText("DOCX, PDF, TXT, MD, JSON or YAML, up to 10 MB.")).toBeVisible();
  await expect(d.getByLabel("File")).toHaveAttribute("accept", ".docx,.pdf,.txt,.md,.json,.yaml,.yml");
  await axe(page, "knowledge upload dialog");

  await d.getByLabel("File").setInputFiles({ name: "old-report.doc", mimeType: "application/msword", buffer: Buffer.from("old word") });
  await expect(d.getByRole("alert")).toHaveText("A .doc file can't be read. Save it as .docx first.");
  await expect(d.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();

  // the Core API's own refusal (422 FILE_HAS_NO_TEXT, services/knowledge_add_ons.py): the dialog
  // stays open and says why in its words
  await d.getByLabel("File").setInputFiles({ name: "blank.md", mimeType: "text/markdown", buffer: Buffer.from("   \n\n  ") });
  await expect(d.getByRole("alert")).toHaveCount(0);
  await d.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(d.getByRole("alert")).toHaveText("That file has no readable text to add.");
  await expect(d).toBeVisible();
  await axe(page, "knowledge upload dialog with a refusal");

  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();
  await expect(upload).toBeFocused();
  await expect(docs(page).getByRole("listitem")).toHaveCount(1);
});

test("nothing scrolls sideways at 360 px: the list, a picked document and the dialog", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openKnowledge(page);
  await expect(docs(page)).toBeVisible();
  expect(await sideways(page)).toEqual({ page: 0, content: 0 });
  await pickButton(page, POLICY.name).click();
  await expect(pane(page).getByRole("complementary", { name: "Document details" })).toBeVisible();
  expect(await sideways(page)).toEqual({ page: 0, content: 0 });
  await pane(page).getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  expect(await sideways(page)).toEqual({ page: 0, content: 0 });
});

test("through the proxy: a file of exactly 10 MB is taken, one byte more is refused (413)", async ({ page }) => {
  await openKnowledge(page);
  const post = (name: string, size: number) =>
    page.request.post("/api/knowledge", { headers: { Origin: ORIGIN }, multipart: { file: { name, mimeType: "text/plain", buffer: Buffer.alloc(size, 97) } } });
  const ten = await post("ten-mb.txt", 10 * 1024 * 1024);
  expect(ten.status()).toBe(201);
  expect((await post("over.txt", 10 * 1024 * 1024 + 1)).status()).toBe(413);
  expect((await post("far-over.txt", 12 * 1024 * 1024)).status()).toBe(413);
  const { source } = await ten.json();
  expect(source).toMatchObject({ name: "ten-mb.txt", kind: "txt", bytes: 10 * 1024 * 1024, original: false });
  expect((await page.request.delete(`/api/knowledge/${source.id}`, { headers: { Origin: ORIGIN } })).status()).toBe(200);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the page goes to sign-in and the routes answer 401", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page).toHaveURL(/\/login$/);

    expect((await page.request.get("/api/knowledge")).status()).toBe(401);
    expect((await page.request.get("/api/knowledge/graph")).status()).toBe(401);
    const post = await page.request.post("/api/knowledge", { headers: { Origin: ORIGIN }, multipart: { file: RUNBOOK } });
    expect(post.status()).toBe(401);
  });
});

// last, so its failure stops nothing else in this serial file: Keep unmounts the question and
// the focus falls to <body> (components/knowledge/doc-list.tsx moves it nowhere), so a keyboard
// user starts over from the top of the page. The Remove button that asked is where it belongs.
test("Keep gives the focus back to the Remove button that asked", async ({ page }) => {
  await openKnowledge(page);
  const remove = pane(page).getByRole("button", { name: `Remove ${POLICY.name}` });
  await remove.focus();
  await page.keyboard.press("Enter");
  const question = pane(page).getByRole("group", { name: `Remove ${POLICY.name}?` });
  await expect(question.getByRole("button", { name: "Keep" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(question).toHaveCount(0);
  await expect(remove).toBeFocused();
});
