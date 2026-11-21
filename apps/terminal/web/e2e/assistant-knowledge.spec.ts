/* The AI Assistant with knowledge add-ons. The answers now come from the Core API's chat, which
   searches the add-ons itself and returns what the answer cites as `sources` (SourceRef, on the
   DONE event and on the saved message); the page shows them as "Sources: …" under the answer
   (components/assistant/sources-used.tsx). This spec adds two files the way the TUI's /add-on
   does (POST /knowledge-add-ons, interface cli, ingested at once) to the Core API's stand-in
   (e2e/core-api-stub.mjs, which cites an add-on whose passage shares a rare word with the
   question) and removes every add-on after, so the other assistant specs (same project, one at
   a time) see no knowledge. A question that matches the runbook cites it, by name and part, and
   not the unrelated handbook; an unrelated question cites nothing; a reload shows the saved
   sources again; the conversation passes axe; and the source opens the document in Security
   knowledge. */
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { CORE_API_PORT, PORT } from "../playwright.config";
import { axe } from "./axe";
import { signIn } from "./support";

const ORIGIN = `http://127.0.0.1:${PORT}`;
const CORE_API = `http://127.0.0.1:${CORE_API_PORT}/api/v1`;
const composer = (page: Page) => page.getByRole("textbox", { name: /^Ask about/ }).last();
const log = (page: Page) => page.getByRole("log", { name: "Conversation" });
const ask = async (page: Page, question: string) => {
  await expect(log(page)).toHaveAttribute("aria-busy", "false"); // the last answer has ended
  await composer(page).fill(question);
  await composer(page).press("Enter");
};

const RUNBOOK = { name: "quokka-runbook.md", text: "# Quokka runbook\n\nRotate the zephyrine quokka keys every 30 days and record it in the vault log.\n\nEscalations go to the on-call lead.\n" };
// a second document, so the citation has to pick the runbook
const HANDBOOK = { name: "handbook.txt", text: Array.from({ length: 20 }, (_, i) => `Handbook section ${i}: lunch hours and parking rules.`).join("\n\n") };

/** A session on the Core API, as the TUI opens one. */
async function coreToken(): Promise<string> {
  const res = await fetch(`${CORE_API}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"interface":"cli"}' });
  return (await res.json()).token;
}

test.beforeAll(async () => {
  const token = await coreToken();
  expect((await fetch(`${CORE_API}/knowledge-add-ons`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  for (const file of [RUNBOOK, HANDBOOK]) {
    const form = new FormData();
    form.append("file", new Blob([file.text]), file.name);
    form.append("interface", "cli");
    const res = await fetch(`${CORE_API}/knowledge-add-ons`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    expect(res.status).toBe(201);
    expect((await res.json()).ingest_status).toBe("INGESTED");
  }
});
test.afterAll(async () => {
  const token = await coreToken();
  expect((await fetch(`${CORE_API}/knowledge-add-ons`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
});

test("an answer names the knowledge it cites, and the saved conversation keeps it", async ({ page }) => {
  await signIn(page);
  expect((await page.request.delete("/api/assistant/conversations", { headers: { Origin: ORIGIN } })).status()).toBe(200);
  await page.goto("/assistant");

  await ask(page, "How often do we rotate the zephyrine quokka keys?");
  await expect(log(page)).toContainText("You asked: How often do we rotate the zephyrine quokka keys?");
  const sources = log(page).locator(".ai-sources");
  await expect(sources).toHaveCount(1);
  await expect(sources).toHaveText(`Sources:${RUNBOOK.name} (Part 1)`);
  await expect(sources.getByRole("button", { name: `${RUNBOOK.name} (Part 1)` })).toHaveAttribute("title", `Open ${RUNBOOK.name} (Part 1) in Security knowledge`);
  await expect(log(page)).not.toContainText(HANDBOOK.name);

  await ask(page, "What waits on my approval?");
  await expect(log(page)).toContainText("You asked: What waits on my approval?");
  await expect(log(page)).toHaveAttribute("aria-busy", "false");
  await expect(log(page).getByText("Sources:", { exact: true })).toHaveCount(1); // only the first answer

  await page.reload();
  await expect(log(page)).toContainText("You asked: What waits on my approval?");
  await expect(log(page).getByText("Sources:", { exact: true })).toHaveCount(1);
  await expect(log(page).getByRole("button", { name: `${RUNBOOK.name} (Part 1)` })).toBeVisible();
  await axe(page, "assistant with sources");

  // the source opens the document in Security knowledge, at the part it cites
  await log(page).getByRole("button", { name: `${RUNBOOK.name} (Part 1)` }).click();
  await expect(page).toHaveURL(/\/knowledge\?(.*&)?doc=[0-9a-f-]{36}&part=1/);
  const details = page.getByRole("complementary", { name: "Document details" });
  await expect(details).toContainText(RUNBOOK.name);
  await expect(details.getByRole("tab", { name: "Content" })).toHaveAttribute("aria-selected", "true");
  await expect(details).toContainText("Rotate the zephyrine quokka keys every 30 days");
});
