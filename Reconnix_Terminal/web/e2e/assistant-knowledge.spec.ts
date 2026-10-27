/* The AI Assistant with knowledge the TUI's /add-on wrote. The e2e server reads
   RECONIX_KNOWLEDGE_DIR (playwright.config.ts KNOWLEDGE_DIR); this spec writes that folder the way
   the TUI does before its test and removes it after, so the other assistant specs (same project,
   one at a time) see no knowledge. A question that matches a file's passage is answered with
   "Knowledge used: <file>" under the answer (the stand-in model says how many passages it got),
   an unrelated one has no such line, a reload shows the saved names again, and the conversation
   with the line passes axe. */
import { rmSync } from "node:fs";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { KNOWLEDGE_DIR, PORT } from "../playwright.config";
import { writeKnowledge } from "../tests/knowledge-fixtures";
import { axe } from "./axe";
import { signIn } from "./support";

const ORIGIN = `http://127.0.0.1:${PORT}`;
const composer = (page: Page) => page.getByRole("textbox", { name: /^Ask about/ }).last();
const log = (page: Page) => page.getByRole("log", { name: "Conversation" });
const ask = async (page: Page, question: string) => {
  await expect(log(page)).toHaveAttribute("aria-busy", "false"); // the last answer has ended
  await composer(page).fill(question);
  await composer(page).press("Enter");
};

const RUNBOOK = {
  name: "quokka-runbook.md",
  chunks: ["Rotate the zephyrine quokka keys every 30 days and record it in the vault log.", "Escalations go to the on-call lead."],
};
// a corpus around it, so the runbook's words are rare enough for BM25's threshold
const HANDBOOK = { name: "handbook.pdf", chunks: Array.from({ length: 20 }, (_, i) => `Handbook section ${i}: lunch hours and parking rules.`) };

test.beforeAll(() => {
  rmSync(KNOWLEDGE_DIR, { recursive: true, force: true });
  writeKnowledge(KNOWLEDGE_DIR, [RUNBOOK, HANDBOOK]);
});
test.afterAll(() => {
  rmSync(KNOWLEDGE_DIR, { recursive: true, force: true });
});

test("an answer names the /add-on files it used, and the saved conversation keeps them", async ({ page }) => {
  await signIn(page);
  expect((await page.request.delete("/api/assistant/conversations", { headers: { Origin: ORIGIN } })).status()).toBe(200);
  await page.goto("/?view=assistant");

  await ask(page, "How often do we rotate the zephyrine quokka keys?");
  await expect(log(page)).toContainText("You asked: How often do we rotate the zephyrine quokka keys? Knowledge passages: 1.");
  const used = log(page).getByText("Knowledge used: quokka-runbook.md", { exact: true });
  await expect(used).toBeVisible();
  await expect(log(page)).not.toContainText("handbook.pdf");

  await ask(page, "What waits on my approval?");
  await expect(log(page)).toContainText("You asked: What waits on my approval?");
  await expect(log(page)).toHaveAttribute("aria-busy", "false");
  await expect(log(page).getByText(/^Knowledge used:/)).toHaveCount(1); // only the first answer

  await page.reload();
  await expect(log(page)).toContainText("You asked: What waits on my approval?");
  await expect(log(page).getByText("Knowledge used: quokka-runbook.md", { exact: true })).toHaveCount(1);
  await axe(page, "assistant with knowledge used");
});
