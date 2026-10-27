/* One axe-core pass (WCAG 2.2 A/AA rules) of the page as it stands, and the opener that waits
   for a dashboard view or the assistant's composer: shared by e2e/a11y.spec.ts and
   e2e/a11y-assistant.spec.ts (the serial one: it writes to the assistant's conversation folder). */
import { AxeBuilder } from "@axe-core/playwright";
import { type Page } from "@playwright/test";

import { expect } from "./fixtures";

import { hydrated } from "./support";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/* Known violations by page and axe rule (none today). Each entry is expected to be found, and the
   test fails with "remove it from KNOWN" once it is gone, so a stale entry can't hide a new one. */
const KNOWN: Record<string, string[]> = {};

export async function axe(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const known = KNOWN[name] ?? [];
  const found = violations
    .filter((v) => !known.includes(v.id))
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(found, `${name}: axe violations`).toEqual([]);
  const ids = violations.map((v) => v.id);
  for (const rule of known) expect(ids, `${name}: ${rule} is fixed: remove it from KNOWN`).toContain(rule);
}

export async function show(page: Page, url: string) {
  await page.goto(url);
  // a dashboard view, or the assistant's composer (the views are all hidden behind it)
  const ready = url.includes("view=assistant") ? page.getByRole("textbox", { name: /^Ask about/ }).last() : page.locator("main > :not([hidden])").first();
  await expect(ready).toBeVisible();
  await hydrated(page);
}
