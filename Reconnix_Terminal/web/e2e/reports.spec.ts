/* Combining saved runs into one report, in the Report view's all-runs mode: pick runs (the
   sixth is disabled with a reason, Clear empties the selection, the selection survives a
   search), Preview report frames the combined HTML with every chosen run in it, Generate PDF
   downloads one real PDF and Generate DOCX one Word document (both only after the preview), the
   failure paths (a 500 on the preview offers Retry, a 501 on the PDF offers the Word document, a
   413 on the DOCX says why), every run's row offers PDF, JSON and DOCX, and the panel works at
   phone size. Also the cards above it: Findings by Severity lists the top 3 CVSS findings (one
   run and every run), and the Targets card shows 7 targets a page (`?tpage=`) beside it, the
   same height as it on every page, with the pager in one place. */
import { readFileSync } from "node:fs";

import { type Locator, type Page } from "@playwright/test";

import { unzip } from "../tests/unzip";
import { expect, test } from "./fixtures";

import { combinedHref } from "../src/lib/report/combined/options";
import { DOCX_TOO_LARGE } from "../src/lib/report/formats";
import { counted, hydrated, sample } from "./support";

const COMBINE_MAX = 5;
const pick = (page: Page) => page.getByRole("checkbox", { name: /^Combine / });
/** Tick the n-th run through its visible box (the input itself is 1px, for screen readers). */
const tick = (page: Page, n: number) => boxLabel(page).nth(n).click();
const boxLabel = (page: Page) => page.locator("label").filter({ has: page.getByRole("checkbox", { name: /^Combine / }) });
/** The run's own row (its report link names its uid), and its box's label. */
const tickRun = (page: Page, uid: string) =>
  page.locator("tr").filter({ has: page.locator(`a[href*="uid=${uid}"]`) }).locator("label").filter({ has: page.getByRole("checkbox", { name: /^Combine / }) }).click();
const preview = (page: Page) => page.getByRole("button", { name: /^(Preview report|Loading preview…)$/ });
const generate = (page: Page) => page.getByRole("button", { name: /^(Generate PDF|Generating PDF…)$/ });
const generateDocx = (page: Page) => page.getByRole("button", { name: /^(Generate DOCX|Generating DOCX…)$/ });
const fileStatus = (page: Page) => page.getByRole("region", { name: "Combine runs" }).locator("[data-file]");
const frame = (page: Page) => page.frameLocator('iframe[title="Combined report preview"]');

async function openReports(page: Page) {
  await page.goto("/?view=reports");
  await expect(page.getByRole("heading", { name: "Combine runs" })).toBeVisible();
  await hydrated(page);
}

test("two runs preview as one combined report and generate one PDF", async ({ page }) => {
  test.setTimeout(120_000); // the PDF is printed by a headless browser on this machine
  await openReports(page);
  const all = sample();
  expect(all.length).toBeGreaterThanOrEqual(2);
  const count = page.getByText(new RegExp(`^\\d+ of ${COMBINE_MAX} selected$`));
  await expect(count).toHaveText(`0 of ${COMBINE_MAX} selected`);
  await expect(preview(page)).toBeDisabled();
  await expect(generate(page)).toBeDisabled();
  await expect(generateDocx(page)).toBeDisabled();
  await expect(page.getByText("Pick at least one run.")).toBeVisible();

  // the two newest runs (the table is newest first)
  await tick(page, 0);
  await tick(page, 1);
  await expect(pick(page).nth(0)).toBeChecked();
  await expect(pick(page).nth(1)).toBeChecked();
  await expect(count).toHaveText(`2 of ${COMBINE_MAX} selected`);
  await expect(generate(page)).toBeDisabled();
  await expect(generateDocx(page)).toBeDisabled();
  await expect(page.getByText("Preview the report first.")).toBeVisible();
  await expect(generateDocx(page)).toHaveAccessibleDescription("Preview the report first.");
  const chosen = [...all].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.uid.localeCompare(a.uid)).slice(0, 2);

  await preview(page).click();
  const previewCard = page.getByRole("region", { name: "Preview" });
  await expect(previewCard).toBeVisible();
  const doc = frame(page);
  await expect(doc.getByRole("heading", { name: "Combined security assessment report" })).toBeVisible({ timeout: 20_000 });
  for (const a of chosen) await expect(doc.locator("body")).toContainText(a.uid);
  await expect(doc.getByRole("heading", { name: "Executive summary" })).toBeVisible();
  await expect(doc.getByRole("heading", { name: "Risk & remediation priorities" })).toBeVisible();
  await expect(doc.locator("script")).toHaveCount(0);

  // the same HTML the PDF prints: what the frame shows is what the route serves (fully sandboxed, no src)
  const iframe = page.locator('iframe[title="Combined report preview"]');
  await expect(iframe).toHaveAttribute("sandbox", "");
  expect(await iframe.getAttribute("src")).toBeNull();
  const res = await page.request.get(combinedHref(chosen.map((a) => a.uid).sort(), "preview", { evidence: true, low: true, appendix: true }));
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("no-store");
  const served = await res.text();
  expect(served).toContain("Combined security assessment report");
  expect(await iframe.getAttribute("srcdoc")).toBe(served);

  await expect(generate(page)).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), generate(page).click()]);
  expect(download.suggestedFilename()).toMatch(/^combined-2-runs-\d{4}-\d{2}-\d{2}\.pdf$/);
  const file = readFileSync((await download.path())!);
  expect(file.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByRole("status").filter({ hasText: /^Downloaded combined-2-runs-/ })).toBeVisible();
  await expect(generate(page)).toHaveText("Generate PDF");

  // the same selection as a Word document: one .docx with both runs in it
  await expect(generateDocx(page)).toBeEnabled();
  const [word] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), generateDocx(page).click()]);
  expect(word.suggestedFilename()).toMatch(/^combined-2-runs-\d{4}-\d{2}-\d{2}\.docx$/);
  const xml = unzip(readFileSync((await word.path())!)).get("word/document.xml") ?? "";
  for (const a of chosen) expect(xml).toContain(a.uid);
  await expect(fileStatus(page)).toHaveAttribute("data-format", "docx");
  await expect(fileStatus(page)).toHaveText(/^Downloaded combined-2-runs-\d{4}-\d{2}-\d{2}\.docx\.$/);
  await expect(generateDocx(page)).toHaveText("Generate DOCX");

  // a changed option makes the preview stale: the PDF waits for a new preview
  await page.locator("label").filter({ has: page.getByRole("checkbox", { name: "Include the appendix" }) }).click();
  await expect(page.getByRole("checkbox", { name: "Include the appendix" })).not.toBeChecked();
  await expect(generate(page)).toBeDisabled();
  await expect(generateDocx(page)).toBeDisabled();
  await expect(page.getByText("The selection or the options changed since this preview. Preview again before generating the PDF or the DOCX.")).toBeVisible();
});

test("a failed preview offers Retry, and a PDF without a printer offers the Word document", async ({ page }) => {
  await openReports(page);
  let previews = 0;
  await page.route("**/api/reports/combined?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("format") === "pdf") {
      await route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ detail: "No browser to print with (stub).", docx: `/api/reports/combined?${url.searchParams}`.replace("format=pdf", "format=docx") }) });
      return;
    }
    previews += 1;
    if (previews === 1) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Stubbed failure." }) });
    else await route.continue();
  });
  await tick(page, 0);
  await preview(page).click();
  const alert = page.getByRole("alert").filter({ hasText: "The preview could not be loaded" });
  await expect(alert).toContainText("The preview could not be loaded: Stubbed failure.");
  await expect(generate(page)).toBeDisabled();
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(frame(page).getByRole("heading", { name: "Combined security assessment report" })).toBeVisible({ timeout: 20_000 });
  await expect(generate(page)).toBeEnabled();
  await generate(page).click();
  const status = fileStatus(page);
  await expect(status).toContainText("No browser to print with (stub).");
  const docx = status.getByRole("link", { name: "Download DOCX" });
  await expect(docx).toBeVisible();
  expect(await docx.getAttribute("href")).toContain("format=docx");
  await expect(generate(page)).toBeEnabled(); // not stuck on "Generating PDF…"
});

test("a Word document too large to build (413) says why, with no Retry", async ({ page }) => {
  await openReports(page);
  await page.route("**/api/reports/combined?*format=docx*", (route) =>
    route.fulfill({ status: 413, contentType: "application/json", body: JSON.stringify({ detail: DOCX_TOO_LARGE }) }),
  );
  await tickRun(page, SHARED[0]);
  await preview(page).click();
  await expect(frame(page).getByRole("heading", { name: "Combined security assessment report" })).toBeVisible({ timeout: 20_000 });
  await generateDocx(page).click();
  await expect(fileStatus(page)).toHaveAttribute("data-file", "refused");
  await expect(fileStatus(page)).toHaveText(DOCX_TOO_LARGE);
  await expect(fileStatus(page).getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(generateDocx(page)).toHaveText("Generate DOCX");
  await expect(generateDocx(page)).toBeEnabled();
});

test("every run's row downloads its report as PDF, JSON and DOCX", async ({ page }) => {
  await openReports(page);
  const run = sample().find((a) => a.uid === SHARED[0])!;
  const row = page.locator("tr").filter({ has: page.locator(`a[href*="uid=${run.uid}"]`) });
  const buttons = row.getByRole("button", { name: /^Download the / });
  await expect(buttons).toHaveText(["PDF", "JSON", "DOCX"]);
  // each is fetched, then saved under the run's name
  const saved = page.waitForEvent("download");
  await buttons.nth(1).click();
  expect((await saved).suggestedFilename()).toBe(`${run.uid}.json`);
  const status = page.getByRole("region", { name: "Runs", exact: true }).locator("[data-file]");
  await expect(status).toHaveText(`Downloaded ${run.uid}.json.`);
});

test("a run's PDF that can't be printed (501) offers its Word document; a failure (500) offers Retry", async ({ page }) => {
  await openReports(page);
  const run = sample().find((a) => a.uid === SHARED[0])!;
  let calls = 0;
  await page.route(`**/api/assessments/${run.uid}/export?format=pdf`, (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ detail: "No browser to print with (stub)." }) })
      : route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Stubbed print failure" }) });
  });
  const row = page.locator("tr").filter({ has: page.locator(`a[href*="uid=${run.uid}"]`) });
  const status = page.getByRole("region", { name: "Runs", exact: true }).locator("[data-file]");
  await row.getByRole("button", { name: /^Download the PDF report of / }).click();
  await expect(status).toHaveAttribute("data-file", "unsupported");
  await expect(status).toContainText("No browser to print with (stub).");
  await expect(status.getByRole("link", { name: "Download DOCX" })).toHaveAttribute("href", `/api/assessments/${run.uid}/export?format=docx`);
  await row.getByRole("button", { name: /^Download the PDF report of / }).click();
  await expect(status).toHaveAttribute("data-file", "failed");
  await expect(status).toContainText(`The PDF of ${run.label} (`);
  await expect(status).toContainText("could not be generated: Stubbed print failure.");
  await status.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => calls).toBe(3);
});

test("the sixth run is disabled with a reason, and Clear empties the selection", async ({ page }) => {
  await openReports(page);
  const boxes = pick(page);
  const total = await boxes.count(); // the first page: ten runs
  expect(total, `the sample data needs more than ${COMBINE_MAX} runs on a page`).toBeGreaterThan(COMBINE_MAX);
  for (let i = 0; i < COMBINE_MAX; i += 1) await tick(page, i);
  await expect(page.getByText(`${COMBINE_MAX} of ${COMBINE_MAX} selected`)).toBeVisible();
  const sixth = boxes.nth(COMBINE_MAX);
  await expect(sixth).toBeDisabled();
  await expect(sixth).toHaveAccessibleDescription(`${COMBINE_MAX} already selected`);
  // unticking one frees the sixth
  await tick(page, 0);
  await expect(boxes.nth(0)).not.toBeChecked();
  await expect(sixth).toBeEnabled();
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByText(`0 of ${COMBINE_MAX} selected`)).toBeVisible();
  for (let i = 0; i < total; i += 1) await expect(boxes.nth(i)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Clear selection" })).toBeDisabled();
});

test("the selection survives a search of the table, by keyboard", async ({ page }) => {
  await openReports(page);
  expect(sample().length, "the search field appears from seven runs").toBeGreaterThanOrEqual(7);
  const first = pick(page).first();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toBeChecked();
  const search = page.getByRole("searchbox", { name: "Search saved assessments" });
  await search.fill("no-such-run-zzz");
  await expect(page.getByText("No saved assessment matches.")).toBeVisible();
  await expect(page.getByText(`1 of ${COMBINE_MAX} selected`)).toBeVisible();
  await search.fill("");
  await expect(pick(page).first()).toBeChecked();
});

// the two runs that saw the same Broken object-level authorization on api.example.com
const SHARED = ["20260930-160500-8a01_RCX-DEMO-001", "20261003-101500-3ceb_RCX-DEMO-002"];
const STOPPED_EARLY = "20261001-083000-2265_RCX-DEMO-003"; // stopped before its scope was approved: no manifest
/** Click an option's visible label (its input is 1px, for screen readers) and expect it off. */
const turnOff = async (page: Page, name: string) => {
  const box = page.getByRole("checkbox", { name });
  await page.locator("label").filter({ has: box }).click();
  await expect(box).not.toBeChecked();
};

test("a finding two runs share counts once, with an occurrence in each run", async ({ page }) => {
  await openReports(page);
  for (const uid of SHARED) await tickRun(page, uid);
  await expect(page.getByText(`2 of ${COMBINE_MAX} selected`)).toBeVisible();
  await preview(page).click();
  const doc = frame(page);
  await expect(doc.getByRole("heading", { name: "Combined security assessment report" })).toBeVisible({ timeout: 20_000 });
  const text = await doc.locator("body").innerText();
  const [, unique, occurrences] = text.match(/Unique findings\s*(\d+) \((\d+) occurrences?\)/i)!.map(Number);
  expect(occurrences, "a shared finding is one unique finding with two occurrences").toBeGreaterThan(unique);
  // 3 + 4 findings recorded; the BOLA finding is in both
  expect(occurrences).toBe(7);
  expect(unique).toBe(6);
  await expect(doc.getByText("2 occurrences").first()).toBeVisible();
  await expect(doc.locator("pre.evidence").first()).toBeVisible();
  await expect(doc.getByText("No rate limiting on login").first()).toBeVisible(); // LOW is in by default
});

test("with evidence and LOW off the preview drops the evidence blocks and the LOW findings", async ({ page }) => {
  await openReports(page);
  for (const uid of SHARED) await tickRun(page, uid);
  await turnOff(page, "Include masked evidence");
  await turnOff(page, "Include LOW findings");
  await preview(page).click();
  const doc = frame(page);
  await expect(doc.getByRole("heading", { name: "Combined security assessment report" })).toBeVisible({ timeout: 20_000 });
  await expect(doc.locator("pre.evidence")).toHaveCount(0);
  await expect(doc.locator("#evidence").getByText("Evidence lines were left out by the report's options.")).toBeVisible();
  await expect(doc.getByText("Broken object-level authorization").first()).toBeVisible(); // MEDIUM stays
  await expect(doc.getByText("No rate limiting on login")).toHaveCount(0); // LOW: gone
  await expect(doc.getByText("HSTS header missing")).toHaveCount(0);
});

test("a run with no saved scope is listed under Limitations as not recorded", async ({ page }) => {
  await openReports(page);
  await tickRun(page, SHARED[0]);
  await page.getByRole("searchbox", { name: "Search saved assessments" }).fill("portal.example.net");
  await tickRun(page, STOPPED_EARLY);
  await preview(page).click();
  const doc = frame(page);
  await expect(doc.getByRole("heading", { name: "Limitations" })).toBeVisible({ timeout: 20_000 });
  await expect(doc.getByText("has no Scope Manifest saved: the boundary of its testing is not recorded.")).toBeVisible();
});

test("a PDF the server fails on (500) shows why, offers Retry, and the button leaves Generating", async ({ page }) => {
  await openReports(page);
  await page.route("**/api/reports/combined?*format=pdf*", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Stubbed print failure." }) }),
  );
  await tickRun(page, SHARED[0]);
  await preview(page).click();
  await expect(frame(page).getByRole("heading", { name: "Combined security assessment report" })).toBeVisible({ timeout: 20_000 });
  await generate(page).click();
  const status = fileStatus(page);
  await expect(status).toHaveAttribute("data-file", "failed");
  await expect(status).toHaveAttribute("data-format", "pdf");
  await expect(status).toContainText("The PDF could not be generated");
  await expect(status.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(generate(page)).toHaveText("Generate PDF"); // not stuck on "Generating PDF…"
  await expect(generate(page)).toBeEnabled();
});

test("a PDF request that is cut off shows the dashboard could not be reached", async ({ page }) => {
  await openReports(page);
  await page.route("**/api/reports/combined?*format=pdf*", (route) => route.abort("failed"));
  await tickRun(page, SHARED[0]);
  await preview(page).click();
  await expect(frame(page).getByRole("heading", { name: "Combined security assessment report" })).toBeVisible({ timeout: 20_000 });
  await generate(page).click();
  await expect(fileStatus(page)).toHaveAttribute("data-file", "failed");
  await expect(fileStatus(page)).toContainText("the dashboard could not be reached");
  await expect(generate(page)).toHaveText("Generate PDF");
});

// ---- Findings by Severity's top 3 and the Targets card (7 a page) --------------------------

const reportPane = (page: Page) => page.locator('[data-view-pane="reports"]');
const severityCard = (page: Page) => reportPane(page).getByRole("region", { name: "Findings by Severity" });
const topRows = (card: Locator) => card.locator(".dash-top-finding");
const targetsCard = (page: Page) => reportPane(page).getByRole("region", { name: "Targets" });
const targetRows = (page: Page) => targetsCard(page).getByRole("list", { name: "Targets" }).getByRole("listitem");
const targetPager = (page: Page) => targetsCard(page).getByRole("navigation", { name: "Target pages" });
/** The targets a page lists, by the name each row's link gives. */
const targetNames = (page: Page) =>
  targetsCard(page)
    .getByRole("link", { name: /^Open the newest report for / })
    .evaluateAll((links) => links.map((a) => /^Open the newest report for (.+) \(/.exec(a.getAttribute("aria-label") ?? "")?.[1] ?? ""));
/** Findings the top list can hold: scored, counted, not fixed (derive.ts findingsSlice). */
const scored = (a: ReturnType<typeof sample>[number]) => counted(a).filter((f) => f.cvss_score > 0 && f.status !== "fixed");
const TOP = 3;
const PER_TARGETS_PAGE = 7;
const TARGETS = new Set(sample().map((a) => a.target || "—")).size;
const TARGET_PAGES = Math.ceil(TARGETS / PER_TARGETS_PAGE);

test("the Report's Findings by Severity lists the top 3 CVSS findings; the Overview keeps more", async ({ page }) => {
  const all = sample();
  const scoredAll = all.flatMap(scored).length;
  expect(scoredAll, "the sample data scores more than three findings").toBeGreaterThan(TOP);
  await page.goto("/?view=reports");
  await hydrated(page);
  // every run: the three highest scores, worst first
  const card = severityCard(page);
  await expect(card).toBeVisible();
  await expect(topRows(card)).toHaveCount(TOP);
  for (let i = 0; i < TOP; i++) await expect(topRows(card).nth(i)).toBeVisible();
  const scores = (await topRows(card).locator("[title^='CVSS']").allTextContents()).map(Number);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  expect(scores[0]).toBe(Math.max(...all.flatMap(scored).map((f) => f.cvss_score)));
  // the Overview's card (the same data, its pane hidden here) still lists more than three
  const overview = page.locator('[data-view-pane="overview"] section[aria-labelledby="findings-card"]');
  expect(await topRows(overview).count()).toBeGreaterThan(TOP);

  // one run: at most three too, and fewer when the run scores fewer
  const most = [...all].sort((a, b) => scored(b).length - scored(a).length)[0];
  const fewest = all.filter((a) => scored(a).length > 0).sort((a, b) => scored(a).length - scored(b).length)[0];
  for (const a of [most, fewest]) {
    await page.goto(`/?uid=${a.uid}&view=reports`);
    await hydrated(page);
    await expect(topRows(severityCard(page))).toHaveCount(Math.min(TOP, scored(a).length));
  }
});

/** The two cards side by side, the targets list and its pager (bounding boxes). */
async function targetBoxes(page: Page) {
  const box = async (l: Locator) => (await l.boundingBox())!;
  return {
    severity: await box(severityCard(page)),
    targets: await box(targetsCard(page)),
    list: await box(targetsCard(page).getByRole("list", { name: "Targets" })),
    pager: await box(targetPager(page)),
  };
}

/** Nothing inside the two cards is cut off: neither a card nor its body scrolls or clips. */
const unclipped = (page: Page) =>
  reportPane(page).evaluate((pane) =>
    ["report-severity", "report-targets"].flatMap((id) => {
      const card = pane.querySelector(`#${id}`)!.closest("section")!;
      return [card, card.lastElementChild as HTMLElement].map((el) => el.scrollHeight - el.clientHeight);
    }),
  );

for (const size of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
]) {
  test.describe(`the Targets card at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test("shows 7 targets a page beside Findings by Severity, the same height on every page, the pager in one place", async ({ page }) => {
      expect(TARGETS, "the sample data has more than a page of targets").toBeGreaterThan(PER_TARGETS_PAGE);
      await page.goto("/?view=reports");
      await hydrated(page);
      await expect(targetRows(page)).toHaveCount(PER_TARGETS_PAGE);
      await expect(targetsCard(page)).toContainText(`${TARGETS} targets`);
      await expect(targetPager(page)).toContainText(`Page 1 of ${TARGET_PAGES} · ${TARGETS} results`);
      await expect(targetPager(page).getByRole("button", { name: "Previous page" })).toBeDisabled();
      const first = await targetBoxes(page);
      const firstNames = await targetNames(page);
      // side by side in one row, the same height (both stretch; neither clips)
      expect(Math.abs(first.targets.y - first.severity.y)).toBeLessThanOrEqual(1);
      expect(first.targets.x).toBeGreaterThan(first.severity.x + first.severity.width - 1);
      expect(Math.abs(first.targets.height - first.severity.height)).toBeLessThanOrEqual(1);
      expect(await unclipped(page)).toEqual([0, 0, 0, 0]);
      // the pager sits inside the card, under the list
      expect(first.pager.y).toBeGreaterThanOrEqual(first.list.y + first.list.height - 1);
      expect(first.pager.y + first.pager.height).toBeLessThanOrEqual(first.targets.y + first.targets.height);

      // the next page: the rest, in the same card height, the pager where it was
      await targetPager(page).getByRole("button", { name: "Next page" }).click();
      await expect(page).toHaveURL(/[?&]tpage=2(&|$)/);
      await expect(targetPager(page)).toContainText(`Page 2 of ${TARGET_PAGES} · ${TARGETS} results`);
      const rest = Math.min(PER_TARGETS_PAGE, TARGETS - PER_TARGETS_PAGE);
      await expect(targetRows(page)).toHaveCount(rest);
      const second = await targetBoxes(page);
      const secondNames = await targetNames(page);
      expect(secondNames.filter((n) => firstNames.includes(n)), "no target on both pages").toEqual([]);
      for (const key of ["targets", "severity", "list", "pager"] as const) {
        expect(Math.abs(second[key].height - first[key].height), `${key}: the same height on page 2`).toBeLessThanOrEqual(1);
        expect(Math.abs(second[key].y - first[key].y), `${key}: in the same place on page 2`).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(second.targets.height - second.severity.height)).toBeLessThanOrEqual(1);
      expect(await unclipped(page)).toEqual([0, 0, 0, 0]);
      if (TARGET_PAGES === 2) {
        expect(new Set([...firstNames, ...secondNames]).size).toBe(TARGETS); // every target, once
        await expect(targetPager(page).getByRole("button", { name: "Next page" })).toBeDisabled();
      }

      // the page is in the address: a reload lands on it; Previous goes back to the plain address
      await page.reload();
      await hydrated(page);
      await expect(targetRows(page)).toHaveCount(rest);
      await targetPager(page).getByRole("button", { name: "Previous page" }).click();
      await expect(targetRows(page)).toHaveCount(PER_TARGETS_PAGE);
      expect(new URL(page.url()).searchParams.has("tpage")).toBe(false);
      // and the runs table's own pager is untouched by the targets' page
      await expect(page.getByRole("navigation", { name: "Saved assessment pages" })).toContainText("Page 1 of");
    });
  });
}

test("an out-of-range or unknown tpage lands on a page that exists", async ({ page }) => {
  await page.goto("/?view=reports&tpage=99");
  await hydrated(page);
  await expect(targetPager(page)).toContainText(`Page ${TARGET_PAGES} of ${TARGET_PAGES}`);
  await page.goto("/?view=reports&tpage=zzz");
  await hydrated(page);
  await expect(targetPager(page)).toContainText(`Page 1 of ${TARGET_PAGES}`);
  await expect(targetRows(page)).toHaveCount(PER_TARGETS_PAGE);
});

test.describe("at phone size", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the panel stacks and the preview scrolls inside its frame", async ({ page }) => {
    await openReports(page);
    await boxLabel(page).first().tap(); // the visible box; the input itself is 1px
    await expect(pick(page).first()).toBeChecked();
    await preview(page).tap();
    const iframe = page.locator('iframe[title="Combined report preview"]');
    await expect(iframe).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".rep-preview-card")).toBeFocused(); // the preview takes focus when it appears
    await expect(frame(page).getByRole("heading", { name: "Combined security assessment report" })).toBeVisible();
    const box = (await iframe.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(320);
    expect(box.height).toBeLessThanOrEqual(600);
    // no sideways page scroll
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("Findings by Severity and Targets stack, nothing clipped, 7 targets a page", async ({ page }) => {
    await page.goto("/?view=reports&tpage=2");
    await hydrated(page);
    await expect(targetRows(page)).toHaveCount(Math.min(PER_TARGETS_PAGE, TARGETS - PER_TARGETS_PAGE));
    let boxes = await targetBoxes(page);
    expect(boxes.targets.y, "stacked under Findings by Severity").toBeGreaterThanOrEqual(boxes.severity.y + boxes.severity.height);
    expect(boxes.pager.y + boxes.pager.height).toBeLessThanOrEqual(boxes.targets.y + boxes.targets.height);
    expect(await unclipped(page)).toEqual([0, 0, 0, 0]);
    await targetPager(page).getByRole("button", { name: "Previous page" }).tap();
    await expect(targetRows(page)).toHaveCount(PER_TARGETS_PAGE);
    boxes = await targetBoxes(page);
    expect(boxes.targets.width).toBeLessThanOrEqual(390);
    expect(await unclipped(page)).toEqual([0, 0, 0, 0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
