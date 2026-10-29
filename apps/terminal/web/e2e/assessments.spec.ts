/* The Assessments view (`/?view=assessments`) on the sample data: every saved run ten a page,
   the pager, the status and template chips, the search, a row opening that run's Overview, the
   filters kept in the address, no sideways overflow on a phone, and an axe check. */
import { AxeBuilder } from "@axe-core/playwright";
import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { counted, hydrated, newest, sample } from "./support";

const PER_PAGE = 10;
const all = sample();
const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
test.beforeAll(() => expect(all.length, "the sample data needs more than one page of runs").toBeGreaterThan(PER_PAGE));
const results = `${all.length} ${all.length === 1 ? "result" : "results"}`;

/** The saved file's template name (support.ts types only what the other specs read). */
const templateOf = (a: ReturnType<typeof sample>[number]) => (a as unknown as { template: { name: string } }).template.name;

const rows = (page: Page) => page.getByRole("list", { name: "Saved assessments" }).getByRole("listitem");
const pager = (page: Page) => page.getByRole("navigation", { name: "Assessment pages" });
const chip = (page: Page, group: string, name: string | RegExp) => page.getByRole("group", { name: group }).getByRole("button", { name });

async function open(page: Page, query = "") {
  await page.goto(`/?view=assessments${query}`);
  await expect(page.getByRole("heading", { name: "Assessments" })).toBeVisible();
  // hydrated before any click: a click before the router has hooked history.replaceState would
  // change the address without re-rendering the view
  await hydrated(page);
}

test("lists every saved run newest first, at most ten a page, with the pager", async ({ page }) => {
  await open(page);
  // the Report view (hidden) carries the same tag: look only in the open view
  await expect(page.locator("main > :not([hidden])").getByText(`All ${all.length} ${all.length === 1 ? "run" : "runs"}`)).toBeVisible();
  await expect(rows(page)).toHaveCount(Math.min(all.length, PER_PAGE));
  await expect(rows(page).first()).toContainText(newest().label);
  await expect(pager(page)).toContainText(`Page 1 of ${pages} · ${results}`);
  await expect(pager(page).getByRole("button", { name: "Previous page" })).toBeDisabled();
  await pager(page).getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  await expect(pager(page)).toContainText(`Page 2 of ${pages}`);
  await expect(rows(page)).toHaveCount(Math.min(all.length - PER_PAGE, PER_PAGE));
  await pager(page).getByRole("button", { name: "Previous page" }).click();
  await expect(page).not.toHaveURL(/page=/);
});

test("a filter that fits one page shows no pager at all", async ({ page }) => {
  await open(page, "&status=Stopped");
  const stopped = all.filter((x) => x.status === "Stopped").length;
  expect(stopped).toBeGreaterThan(0);
  expect(stopped).toBeLessThanOrEqual(PER_PAGE);
  await expect(rows(page)).toHaveCount(stopped);
  await expect(pager(page)).toHaveCount(0); // nothing to turn: not a disabled pair of buttons
});

test("each row shows the run's status, findings count, worst severity and plan steps", async ({ page }) => {
  await open(page);
  const a = newest();
  const row = rows(page).first();
  await expect(row).toContainText(a.label);
  await expect(row).toContainText(a.target);
  await expect(row.locator(".asm-findings")).toContainText(String(counted(a).length));
  await expect(row.locator(".asm-plan")).toHaveText(/^Plan\d+\/\d+$/); // the cell's label, then done/total
  expect(all.some((x) => x.status === "Awaiting input"), "the sample data has a waiting run").toBe(true);
  // the tooltip is the run's gate line ("secret_validation · risk HIGH · awaiting approval")
  const w = rows(page).filter({ hasText: "Waiting for you" }).first();
  await expect(w.locator(".asm-status")).toHaveAttribute("title", /awaiting|approval|sign-in|code/i);
});

test("the status chips count the runs and narrow them, in the address", async ({ page }) => {
  await open(page);
  const done = all.filter((x) => x.status === "Completed").length;
  const completed = chip(page, "Status", /^Completed/);
  await expect(completed).toContainText(String(done));
  await completed.click();
  await expect(page).toHaveURL(/status=Completed/);
  await expect(rows(page)).toHaveCount(Math.min(done, PER_PAGE));
  for (const r of await rows(page).all()) await expect(r.locator(".asm-status")).toContainText("Completed");
  await expect(page.getByText(`Showing ${done} of ${all.length} runs`)).toBeVisible();
  // a second status joins the first (multi-select)
  const stopped = all.filter((x) => x.status === "Stopped").length;
  expect(stopped, "the sample data has stopped runs").toBeGreaterThan(0);
  await chip(page, "Status", /^Stopped/).click();
  await expect(page).toHaveURL(/status=Completed(%2C|,)Stopped/);
  await expect(rows(page)).toHaveCount(Math.min(done + stopped, PER_PAGE));
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(rows(page)).toHaveCount(Math.min(all.length, PER_PAGE));
});

test("the template chips and the search narrow the runs together, and a stale page resets", async ({ page }) => {
  await open(page, "&page=9");
  const name = newest().label; // every sample run of this ID
  const tpl = templateOf(newest());
  const ofTemplate = all.filter((x) => templateOf(x) === tpl);
  await chip(page, "Template", new RegExp(`^${tpl}`)).click();
  await expect(page).toHaveURL(new RegExp(`template=${encodeURIComponent(tpl).replace(/%20/g, "(%20|\\+)")}`));
  await expect(page).not.toHaveURL(/page=/); // changing a filter resets the page
  await expect(rows(page)).toHaveCount(Math.min(ofTemplate.length, PER_PAGE));
  await page.getByRole("searchbox", { name: "Search saved assessments" }).fill(name);
  await expect(page).toHaveURL(new RegExp(`q=${name}`));
  const both = ofTemplate.filter((x) => x.label === name);
  await expect(rows(page)).toHaveCount(Math.min(both.length, PER_PAGE));
  await page.getByRole("searchbox", { name: "Search saved assessments" }).fill("no-such-run-zzz");
  await expect(page.getByRole("status")).toContainText("No saved run matches these filters.");
  await page.getByRole("button", { name: "Clear filters" }).click(); // the filter summary's, the one Clear
  await expect(page).not.toHaveURL(/[?&](q|status|template)=/);
  await expect(rows(page)).toHaveCount(Math.min(all.length, PER_PAGE));
});

test("a row opens that run's Overview: its uid in the address, no view", async ({ page }) => {
  await open(page, "&status=Completed");
  const a = [...all].filter((x) => x.status === "Completed").sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
  await rows(page).first().getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`uid=${a.uid}`));
  await expect(page).not.toHaveURL(/view=/);
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose an assessment" })).toContainText(a.label);
  // the switcher now starts with that run's name, a link back to this same Overview
  await page.getByRole("button", { name: "Choose an assessment" }).click();
  await expect(page.getByRole("link", { name: /^Open the overview of / })).toHaveAttribute("href", `/?uid=${a.uid}`);
});

/** How far the page and the content area scroll sideways (both must be 0). */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const root = document.scrollingElement!;
    const main = document.querySelector("main")!;
    return { page: root.scrollWidth - root.clientWidth, content: main.scrollWidth - main.clientWidth };
  });

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the list reads as cards and nothing overflows sideways", async ({ page }) => {
    await open(page);
    await expect(rows(page)).toHaveCount(Math.min(all.length, PER_PAGE));
    expect(await sideways(page)).toEqual({ page: 0, content: 0 });
    // the cells' labels show on a card (there is no header row)
    await expect(rows(page).first().locator(".asm-k", { hasText: "Findings" })).toBeVisible();
    await expect(page.locator(".asm-head")).toBeHidden();
  });
});

test.describe("on a 1366×768 desktop", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  test("the runs are rows under a header, one below the other, and nothing overflows sideways", async ({ page }) => {
    await open(page);
    await expect(page.locator(".asm-head")).toBeVisible();
    expect(await sideways(page)).toEqual({ page: 0, content: 0 });
    const boxes = await rows(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.top]));
    expect(new Set(boxes.map(([left]) => left)).size, "every row starts at the same left edge").toBe(1);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i][1]).toBeGreaterThan(boxes[i - 1][1]);
  });
});

test.describe("axe", () => {
  test.use({ reducedMotion: "reduce" });
  for (const [name, query] of [
    ["the list", ""],
    ["a filtered list", "&status=Completed&q=example"],
    ["no match", "&q=no-such-run-zzz"],
  ]) {
    test(`${name} has no violations`, async ({ page }) => {
      await open(page, query);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
    });
  }
});
