/* The Findings view (docs/WEB_REDESIGN_V3_PLAN.md, E2): ten rows a page with Previous / Next,
   a deep link that opens on its finding's page, filters that go back to the first page,
   Previous / Next finding across a page end, the notice for a finding that is hidden or unknown,
   the list pane that scrolls on its own on the fixed frame while the detail keeps its header,
   with its scrollbars hidden (the detail's and the page's kept), and the phone's list → detail → Back (a history entry). The every-run list of the sample data
   is the one with more than one page. */
import { type Page } from "@playwright/test";

import { unzip } from "../tests/unzip";
import { expect, test } from "./fixtures";

import { PER_PAGE } from "../src/lib/paging";
import { counted, hydrated, sample, signIn } from "./support";

const list = (page: Page) => page.getByRole("list", { name: "Findings", exact: true });
const rows = (page: Page) => list(page).getByRole("listitem");
const selected = (page: Page) => list(page).locator('button[aria-current="true"]');
const pager = (page: Page) => page.getByRole("navigation", { name: "Finding pages" });
const detail = (page: Page) => page.getByRole("article", { name: /^Finding / });
const row = (page: Page, i: number) => rows(page).nth(i).locator("button");
/** A row's finding ID and severity (the row's data hooks). */
const rowId = async (page: Page, i: number) => (await row(page, i).getAttribute("data-finding-id"))!;
const rowSeverity = async (page: Page, i: number) => (await row(page, i).getAttribute("data-severity"))!;
const notice = (page: Page) => page.locator(".dash-findings-notice");
const param = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);
/** Open an address and wait for the page to settle: a click before hydration is replayed, but the
    address change it makes can then slip past the router (the view would not follow it). */
async function go(page: Page, url: string) {
  await page.goto(url);
  await hydrated(page);
}

// what the list holds and counts: every finding but the false positives (shown only on request)
const TOTAL = sample().reduce((n, a) => n + counted(a).length, 0);
const PAGES = Math.ceil(TOTAL / PER_PAGE);
test.beforeAll(() => expect(PAGES, "the sample data needs more than one page of findings").toBeGreaterThan(1));

test("ten findings a page, with Previous and Next under the list", async ({ page }) => {
  await go(page, "/?view=findings");
  await expect(rows(page)).toHaveCount(PER_PAGE);
  await expect(pager(page)).toContainText(`Page 1 of ${PAGES} · ${TOTAL} results`);
  await expect(pager(page).getByRole("button", { name: "Previous page" })).toBeDisabled();
  await expect(selected(page)).toHaveCount(1);

  await pager(page).getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows(page)).toHaveCount(Math.min(PER_PAGE, TOTAL - PER_PAGE));
  await expect(pager(page)).toContainText(`Page 2 of ${PAGES}`);
  // the new page's first row is selected: the detail never shows a row that is not listed
  await expect(selected(page)).toHaveCount(1);
  const first = await rows(page).first().locator("button").getAttribute("aria-current");
  expect(first).toBe("true");

  await pager(page).getByRole("button", { name: "Previous page" }).click();
  await expect(page).not.toHaveURL(/page=/); // the first page is the plain address
  await expect(rows(page)).toHaveCount(PER_PAGE);
});

test("a deep link opens the page that holds its finding, and the selection stays while it is on the page", async ({ page }) => {
  await go(page, "/?view=findings&page=2");
  await rows(page).nth(1).locator("button").click(); // the second row of page 2
  const key = param(page, "finding")!;
  expect(key).toContain("~"); // every run's list: keyed by run
  await expect(selected(page)).toHaveCount(1);

  // the link alone, and with the wrong page: both land on page 2 with the row selected
  for (const url of [`/?view=findings&finding=${encodeURIComponent(key)}`, `/?view=findings&page=1&finding=${encodeURIComponent(key)}`]) {
    await go(page, url);
    await expect(pager(page)).toContainText(`Page 2 of ${PAGES}`);
    await expect(selected(page)).toHaveCount(1);
    await expect(detail(page)).toContainText(key.split("~")[1]);
  }

  // paging away drops the selection for that page's first row; paging back does not restore it
  await pager(page).getByRole("button", { name: "Previous page" }).click();
  await expect(page).not.toHaveURL(/finding=/);
  await expect(selected(page)).toHaveCount(1);
});

test("a filter goes back to the first page; Previous and Next finding cross the page end", async ({ page }) => {
  await go(page, "/?view=findings&page=2");
  await expect(pager(page)).toContainText("Page 2 of");
  const sev = await rowSeverity(page, 0);
  await page.getByRole("group", { name: "Severity" }).getByRole("button", { name: new RegExp(`^${sev.toLowerCase()}`) }).click();
  await expect(page).toHaveURL(new RegExp(`sev=${sev}`));
  await expect(page).not.toHaveURL(/page=/);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows(page)).toHaveCount(PER_PAGE);

  // the last row of page 1 → Next finding → the first row of page 2 (and back)
  await rows(page).last().locator("button").click();
  const last = param(page, "finding")!;
  await detail(page).getByRole("button", { name: "Next finding" }).click();
  await expect(pager(page)).toContainText(`Page 2 of ${PAGES}`);
  expect(param(page, "finding")).not.toBe(last);
  await expect(detail(page)).toContainText(`${PER_PAGE + 1} of ${TOTAL}`);
  await expect(selected(page)).toHaveCount(1);
  await detail(page).getByRole("button", { name: "Previous finding" }).click();
  await expect(pager(page)).toContainText(`Page 1 of ${PAGES}`);
  expect(param(page, "finding")).toBe(last);
  await expect(detail(page)).toContainText(`${PER_PAGE} of ${TOTAL}`);
  // the ends are disabled, not dead
  await go(page, "/?view=findings");
  await expect(detail(page).getByRole("button", { name: "Previous finding" })).toBeDisabled();
});

test("a finding the address names but the list lacks falls back to the first row, with a way out", async ({ page }) => {
  await signIn(page);
  // unknown: nothing by that name in any run
  await go(page, "/?view=findings&finding=no-such-finding");
  await expect(notice(page)).toContainText("No finding no-such-finding");
  await expect(selected(page)).toHaveCount(1);
  await expect(detail(page)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page).not.toHaveURL(/finding=/);

  // hidden by a filter: Show it clears the filters and keeps it selected
  const a = sample().find((x) => new Set(x.findings.map((f) => f.severity)).size > 1)!;
  await go(page, `/?uid=${a.uid}&view=findings`);
  const fid = await rowId(page, 0);
  const sev = await rowSeverity(page, 0);
  const other = a.findings.find((x) => x.severity !== sev)!.severity;
  await go(page, `/?uid=${a.uid}&view=findings&sev=${other}&finding=${fid}`);
  await expect(notice(page)).toContainText(`${fid} is hidden by the filters`);
  await page.getByRole("button", { name: "Show it" }).click();
  await expect(page).not.toHaveURL(/sev=/);
  await expect(page).toHaveURL(new RegExp(`finding=${fid}`));
  await expect(selected(page)).toContainText(fid);
  await expect(notice(page)).toHaveCount(0);

  // a value that is no key is never repeated
  await go(page, `/?uid=${a.uid}&view=findings&finding=${encodeURIComponent("<b>x</b> y")}`);
  await expect(notice(page)).toHaveText(/This link names a finding that isn't here\./);
  await expect(notice(page)).not.toContainText("<b>");
});

// 20261001-083000-2265_RCX-DEMO-001 completed with nothing found; MOST is the run with the most
// findings the page lists (...-8c51_RCX-DEMO-002, twelve; an Info finding would not count)
const NO_FINDINGS = "20261001-083000-2265_RCX-DEMO-001";
const MOST = [...sample()].sort((a, b) => counted(b).length - counted(a).length)[0];

test("a run with no findings says so: no list, no filters, no pager", async ({ page }) => {
  const run = sample().find((a) => a.uid === NO_FINDINGS)!;
  expect(run.findings).toHaveLength(0);
  expect(run.status).toBe("Completed");
  await go(page, `/?uid=${NO_FINDINGS}&view=findings`);
  await expect(page.getByRole("heading", { name: "Findings", level: 1 })).toBeVisible();
  const view = page.locator("main > :not([hidden])"); // the Report view (hidden) says it too
  await expect(view.getByText("No findings in this assessment yet.")).toBeVisible();
  await expect(view.getByText("Findings appear here once this assessment's run records some.")).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search findings" })).toHaveCount(0);
  await expect(pager(page)).toHaveCount(0);
  await expect(detail(page)).toHaveCount(0);
});

test("one run with more than ten findings pages at ten, and its last page holds the rest", async ({ page }) => {
  const run = MOST;
  test.skip(counted(run).length <= PER_PAGE, "no sample run lists more than ten findings (Info ones are not listed)");
  await go(page, `/?uid=${run.uid}&view=findings`);
  await expect(rows(page)).toHaveCount(PER_PAGE);
  await expect(pager(page)).toContainText(`Page 1 of 2 · ${counted(run).length} results`);
  await pager(page).getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows(page)).toHaveCount(counted(run).length - PER_PAGE);
  await expect(pager(page).getByRole("button", { name: "Next page" })).toBeDisabled();
  await expect(selected(page)).toHaveCount(1);
  await expect(detail(page)).toContainText(`${PER_PAGE + 1} of ${counted(run).length}`);
});

test("a run that fits one page shows no pager", async ({ page }) => {
  const one = sample().find((a) => counted(a).length > 1 && counted(a).length <= PER_PAGE)!;
  await go(page, `/?uid=${one.uid}&view=findings`);
  await expect(rows(page)).toHaveCount(counted(one).length);
  await expect(pager(page)).toHaveCount(0);
});

test("a critical finding shows its badge first, there is no Info level, and titles stay text", async ({ page }) => {
  const uid = "20260929-112000-8c51_RCX-DEMO-001";
  await go(page, `/?uid=${uid}&view=findings`);
  await expect(rows(page).first().locator("button")).toHaveAttribute("data-severity", "CRITICAL");
  const severity = page.getByRole("group", { name: "Severity" });
  await expect(severity.getByRole("button", { name: /^critical/ })).toBeVisible();
  // an informational finding an older file holds is listed nowhere, and has no chip
  await expect(severity.getByRole("button", { name: /^info/ })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(Math.min(PER_PAGE, counted(sample().find((a) => a.uid === uid)!).length));
  await expect(list(page).locator('[data-severity="INFO"]')).toHaveCount(0);
  // the title with markup in it is shown as the characters it is
  const markup = rows(page).filter({ hasText: "<b>Status page</b> leaks build details" });
  await expect(markup).toHaveCount(1);
  await expect(page.locator("b", { hasText: "Status page" })).toHaveCount(0);
  // the markup in a title is escaped in the report too
  const doc = unzip(await (await page.request.get(`/api/assessments/${uid}/export?format=docx`)).body()).get("word/document.xml") ?? "";
  expect(doc).toContain("&lt;b&gt;Status page&lt;/b&gt; leaks build details");
  expect(doc).not.toContain("<b>Status page</b>");
  expect(doc).not.toMatch(/>Info</);
});

test("a false positive is left out until Show lists it as closed, and its analyst note is in the report", async ({ page }) => {
  // the sample data's false positive with a note, if it holds one (an Info one is left out)
  const run = sample().find((a) => a.findings.some((f) => f.status === "false-positive" && f.triage_note));
  test.skip(!run, "the sample data holds no false positive with a note (an Info one is not listed)");
  const fp = run!.findings.find((f) => f.status === "false-positive" && f.triage_note)!;
  const n = counted(run!).length;
  await go(page, `/?uid=${run!.uid}&view=findings`);
  // left out: the list, the headline and the summary count what the Overview counts
  await expect(rows(page)).toHaveCount(Math.min(PER_PAGE, n));
  await expect(rows(page).filter({ hasText: fp.title })).toHaveCount(0);
  await expect(page.getByText(`Showing ${n} of ${n} findings`)).toBeVisible();
  // Show lists it (closed), beside the total rather than in it
  const chips = page.getByRole("group", { name: "False positives" });
  await chips.getByRole("button", { name: /^Show/ }).click();
  await expect(page).toHaveURL(/fp=1/);
  await expect(page.getByText(`Showing ${n + 1} of ${n} findings + 1 false positive`)).toBeVisible();
  await rows(page).filter({ hasText: fp.title }).locator("button").click();
  await expect(detail(page)).toContainText("False positive");
  // Clear filters hides it again
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/fp=/);
  await expect(rows(page).filter({ hasText: fp.title })).toHaveCount(0);
  // a link naming it says why it isn't listed, and Show it lists and selects it
  await go(page, `/?uid=${run!.uid}&view=findings&finding=${fp.id}`);
  await expect(notice(page)).toContainText(`${fp.id} is marked as a false positive, and false positives are hidden.`);
  await page.getByRole("button", { name: "Show it" }).click();
  await expect(page).toHaveURL(/fp=1/);
  await expect(selected(page)).toContainText(fp.id);
  await expect(notice(page)).toHaveCount(0);
  const doc = unzip(await (await page.request.get(`/api/assessments/${run!.uid}/export?format=docx`)).body()).get("word/document.xml") ?? "";
  expect(doc).toContain("Analyst note");
  expect(doc).toContain(fp.triage_note!.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
});

/* The sample run whose target held a login (scripts/make_sample_data.py): the store masked it
   when it saved the run, and the dashboard and its export mask the saved copy once more. */
const MASKED_RUN = "20260929-112000-8c51_RCX-DEMO-001";

test("a login in a target is masked in the finding's detail and in the Word export", async ({ page }) => {
  await go(page, `/?uid=${MASKED_RUN}&view=findings&finding=IMP-001`);
  await expect(detail(page)).toContainText("••••@portal.example.com");
  await expect(detail(page)).not.toContainText("hunter2");
  const res = await page.request.get(`/api/assessments/${MASKED_RUN}/export?format=docx`);
  expect(res.status()).toBe(200);
  const doc = unzip(await res.body()).get("word/document.xml") ?? "";
  expect(doc).toContain("••••@portal.example.com");
  expect(doc).not.toContain("hunter2");
});

test.describe("on the fixed frame (1366×768)", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("the list pane scrolls on its own, the page does not, and the detail keeps its header", async ({ page }) => {
    await go(page, "/?view=findings");
    await expect(rows(page)).toHaveCount(PER_PAGE);
    const main = page.locator("main.dash-content");
    const state = () =>
      page.evaluate(() => {
        const ul = document.querySelector<HTMLElement>('ul[aria-label="Findings"]')!;
        const main = document.querySelector<HTMLElement>("main.dash-content")!;
        return { list: ul.scrollTop, listRange: ul.scrollHeight - ul.clientHeight, main: main.scrollTop, mainRange: main.scrollHeight - main.clientHeight, win: scrollY };
      });
    const before = await state();
    expect(before.listRange, "ten rows do not fit the frame: the list pane must scroll").toBeGreaterThan(100);
    expect(before.mainRange, "the content area must not scroll because of the list").toBeLessThanOrEqual(1);

    const box = (await list(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await state()).list).toBeGreaterThan(100);
    const after = await state();
    expect(after.main).toBe(0);
    expect(after.win).toBe(0);
    expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
    // the keys scroll the list once a row has focus, and the page still stays put
    await rows(page).first().locator("button").click();
    await page.keyboard.press("Home");
    await expect.poll(async () => (await state()).list).toBe(0);
    await page.keyboard.press("PageDown");
    await expect.poll(async () => (await state()).list).toBeGreaterThan(100);
    expect((await state()).main).toBe(0);
    // the pager stays in reach under the scrolled list
    const pagerBox = (await pager(page).boundingBox())!;
    expect(pagerBox.y + pagerBox.height).toBeLessThanOrEqual(768);

    // the detail: its header (ID, severity, CVSS, title) stays in view when its body scrolls.
    // The finding: the first on the page whose body is taller than its pane.
    const body = page.locator(".dash-finding-body");
    const bodyScroll = () => body.evaluate((el) => ({ top: el.scrollTop, range: el.scrollHeight - el.clientHeight }));
    let tall = false;
    for (let i = 0; i < PER_PAGE && !tall; i++) {
      await row(page, i).click();
      await expect(selected(page)).toHaveAttribute("data-finding-key", (await row(page, i).getAttribute("data-finding-key"))!);
      tall = (await bodyScroll()).range > 20;
    }
    expect(tall, "a finding whose detail is taller than the pane").toBe(true);
    const head = detail(page).locator("header").first();
    const headBefore = (await head.boundingBox())!;
    expect(headBefore.y).toBeGreaterThanOrEqual(0);
    const bodyBox = (await body.boundingBox())!;
    await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(async () => (await bodyScroll()).top, { message: "the body scrolls inside the detail" }).toBeGreaterThan(0);
    const headAfter = (await head.boundingBox())!;
    expect(Math.round(headAfter.y)).toBe(Math.round(headBefore.y));
    expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test("the list pane hides its scrollbars, down the side and along the bottom, and still scrolls", async ({ page }) => {
    await go(page, "/?view=findings");
    await expect(rows(page)).toHaveCount(PER_PAGE);
    const bars = () =>
      page.evaluate(() => {
        const of = (el: HTMLElement) => ({
          width: getComputedStyle(el).scrollbarWidth,
          webkit: getComputedStyle(el, "::-webkit-scrollbar").display,
          side: el.offsetWidth - el.clientWidth, // what a vertical scrollbar takes
          bottom: el.offsetHeight - el.clientHeight, // what a horizontal one takes
        });
        const q = (s: string) => document.querySelector<HTMLElement>(s)!;
        return {
          pane: of(q(".dash-findings .ui-split-list")),
          rows: of(q('ul[aria-label="Findings"]')),
          detail: of(q(".dash-findings .ui-split-detail")),
          body: of(q(".dash-finding-body")),
          main: of(q("main.dash-content")),
        };
      });
    const b = await bars();
    for (const [name, el] of [["the list pane", b.pane], ["the rows", b.rows]] as const) {
      expect(el, `${name}: no scrollbar drawn, none takes room`).toEqual({ width: "none", webkit: "none", side: 0, bottom: 0 });
    }
    // only the list: the detail pane, its body and the page keep their scrollbars
    for (const [name, el] of [["the detail pane", b.detail], ["the detail's body", b.body], ["the content area", b.main]] as const) {
      expect(el.width, `${name} keeps its scrollbar`).not.toBe("none");
      expect(el.webkit, `${name} keeps its scrollbar`).not.toBe("none");
    }

    // still scrolled by the wheel and the keys, with the rows still tab stops
    const top = () => list(page).evaluate((el) => el.scrollTop);
    const box = (await list(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(top).toBeGreaterThan(100);
    await row(page, 0).focus();
    await page.keyboard.press("Home");
    await expect.poll(top).toBe(0);
    await page.keyboard.press("End");
    await expect.poll(top).toBeGreaterThan(100);
    for (let i = 0; i < PER_PAGE; i++) expect(await row(page, i).evaluate((el) => el.tabIndex)).toBe(0);
  });
});

test.describe("on a phone (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the list first; a row opens the detail with Back, and the browser's Back returns to the list", async ({ page }) => {
    await go(page, "/?view=findings");
    await expect(list(page)).toBeVisible();
    await expect(detail(page)).toBeHidden();
    const back = page.getByRole("button", { name: "Back to the findings" });

    await rows(page).nth(2).locator("button").tap();
    await expect(detail(page)).toBeVisible();
    await expect(back).toBeVisible();
    await expect(list(page)).toBeHidden();
    await expect(page).toHaveURL(/finding=/);
    await expect(page.getByRole("searchbox", { name: "Search findings" })).toBeHidden(); // the filters belong to the list

    await page.goBack();
    await expect(page).not.toHaveURL(/finding=/);
    await expect(list(page)).toBeVisible();
    await expect(detail(page)).toBeHidden();

    await rows(page).nth(1).locator("button").tap();
    await expect(detail(page)).toBeVisible();
    await back.tap();
    await expect(list(page)).toBeVisible();
    await expect(page).not.toHaveURL(/finding=/);

    // a link straight to a finding: Back has nothing behind it and still returns to the list
    await rows(page).first().locator("button").tap();
    const direct = page.url();
    await go(page, direct);
    await expect(detail(page)).toBeVisible();
    await back.tap();
    await expect(list(page)).toBeVisible();

    // paging by touch
    await pager(page).getByRole("button", { name: "Next page" }).tap();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page)).toHaveCount(Math.min(PER_PAGE, TOTAL - PER_PAGE));
    await expect(list(page)).toBeVisible();
  });

  test("the detail takes focus; Back returns to the opened row, highlighted and focused; Forward keeps a Back", async ({ page }) => {
    await go(page, "/?view=findings");
    const back = page.getByRole("button", { name: "Back to the findings" });
    const focusedKey = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-finding-key], article")?.getAttribute("data-finding-key") ?? document.activeElement?.tagName);
    const eighth = (await row(page, 7).getAttribute("data-finding-key"))!;

    // row 8 (well down the list): the detail takes focus
    await row(page, 7).tap();
    await expect(detail(page)).toBeVisible();
    await expect.poll(focusedKey).toBe("ARTICLE");
    await expect(detail(page)).toContainText(`8 of ${TOTAL}`);
    // Back: row 8 is highlighted and focused again (and so in view)
    await back.tap();
    await expect(list(page)).toBeVisible();
    await expect(selected(page)).toHaveAttribute("data-finding-key", eighth);
    await expect.poll(focusedKey).toBe(eighth);
    await expect.poll(async () => {
      const box = (await row(page, 7).boundingBox())!;
      return box.y >= 0 && box.y + box.height <= 844;
    }, { message: "row 8 is in view" }).toBe(true);

    // Back then Forward: the pane's Back still goes back (Forward reaches the detail again)
    await row(page, 2).tap();
    await expect(detail(page)).toBeVisible();
    await page.goBack();
    await expect(list(page)).toBeVisible();
    await page.goForward();
    await expect(detail(page)).toBeVisible();
    await back.tap();
    await expect(list(page)).toBeVisible();
    await expect(page).not.toHaveURL(/finding=/);
    await page.goForward();
    await expect(detail(page)).toBeVisible(); // the entry was left behind, not replaced
    await expect(page).toHaveURL(/finding=/);
  });

  test("the detail's evidence scrolls sideways inside a tab stop named Evidence", async ({ page }) => {
    await go(page, "/?view=findings");
    await row(page, 2).tap();
    await expect(detail(page)).toBeVisible();
    const evidence = detail(page).getByRole("region", { name: "Evidence" });
    await expect(evidence).toHaveAttribute("tabindex", "0");
    expect(await evidence.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth)).toBe(0); // the page itself does not
  });
});
