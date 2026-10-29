/* The globe dashboard on the sample data: every view, Findings by Severity's four rows, the
   Duration card, the assessment switcher, the report downloads and the docs; the frame has no
   Terminal item, no logo and no bell. */
import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { PER_PAGE } from "../src/lib/paging";
import { NO_PRINTER } from "../src/lib/report/formats";
import { counted, hydrated, newest, sample, signIn, toolSteps } from "./support";

const view = (name: string) => `nav[aria-label="Views"] button[aria-label^="${name}"]`;

/** The Findings view's rows, and the selected one. */
const findingRows = (page: Page) => page.getByRole("list", { name: "Findings", exact: true }).getByRole("listitem");
const selectedFinding = (page: Page) => page.getByRole("list", { name: "Findings", exact: true }).locator('button[aria-current="true"]');

/** A summary-strip card (Findings, Assessment progress, Tool execution, Duration). */
const card = (page: Page, label: string) => page.locator(`[data-motion="top"] section[aria-label="${label}"]`);
const stat = (page: Page, label: string) => card(page, label).locator("[data-countup]").first();

/** Findings by Severity's rows in the open view, and the four it always lists, in order. */
const severityRows = (page: Page) => page.getByRole("list", { name: "Findings per severity" }).getByRole("listitem");
const FOUR_LEVELS = [/^Critical/, /^High/, /^Medium/, /^Low/];

/** The open switcher panel's text outside its list and its title link (none is left). */
const panelExtras = (page: Page) =>
  page.locator('[role="dialog"]').evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("ul, a").forEach((n) => n.remove());
    return copy.textContent!.trim();
  });

test("the overview totals every saved file by default", async ({ page }) => {
  await signIn(page);
  const all = sample();
  const done = all.filter((a) => a.status === "Completed").length;
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose an assessment" })).toContainText(`All (${all.length})`);
  await expect(stat(page, "Findings")).toHaveText(String(all.reduce((n, a) => n + counted(a).length, 0)));
  await expect(stat(page, "Tool execution")).toHaveText(String(all.reduce((n, a) => n + toolSteps(a), 0)));
  await expect(card(page, "Assessment progress")).toContainText(`${done} of ${all.length} runs completed`);
  // exactly the four summary cards (Policy checks, Blocked by policy and Assessments were removed)
  const cards = page.locator('[data-motion="top"] > section');
  await expect(cards).toHaveCount(4);
  expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Findings", "Assessment progress", "Tool execution", "Duration"]);
  await page.click(view("Findings"));
  // the Findings view counts what the Overview counts (false positives left out, listed on request)
  const total = all.reduce((n, a) => n + counted(a).length, 0);
  await expect(findingRows(page)).toHaveCount(Math.min(PER_PAGE, total)); // ten a page
  await expect(page.getByText(new RegExp(`^${total} findings across ${all.length} assessments`))).toBeVisible();
  await expect(page.getByText(`Showing ${total} of ${total} findings`)).toBeVisible();
  // Reports sums up every run too (no run picker): a row per run
  await page.click(view("Reports"));
  // every run is a row, ten to a page
  expect(all.length).toBeGreaterThan(PER_PAGE);
  await expect(page.getByRole("table", { name: "Saved assessments" }).getByRole("link", { name: /^Open the report of/ })).toHaveCount(PER_PAGE);
  await expect(page.getByRole("navigation", { name: "Saved assessment pages" })).toContainText(`${all.length} results`);
  await expect(page.getByRole("group", { name: "Report summary" }).locator("section")).toHaveCount(4);
});

test("Findings by Severity lists Critical, High, Medium and Low, even at 0, and never Info", async ({ page }) => {
  await signIn(page);
  const all = sample(); // an older file's informational findings already left out, as the page does
  const found = all.flatMap(counted);
  // every run: the four rows; the card and the summary strip count the same findings
  await expect(severityRows(page)).toHaveText(FOUR_LEVELS);
  await expect(page.getByRole("region", { name: "Findings by Severity" })).toContainText(`${found.length} findings`);
  await expect(stat(page, "Findings")).toHaveText(String(found.length));
  // one run with no critical finding still lists Critical first, at 0
  const a = all.find((x) => counted(x).length > 0 && !counted(x).some((f) => f.severity === "CRITICAL"))!;
  await page.goto(`/?uid=${a.uid}`);
  await expect(severityRows(page)).toHaveText(FOUR_LEVELS);
  await expect(severityRows(page).first().locator("[data-countup]")).toHaveText("0");
  // its Report shows the same card
  await page.click(view("Reports"));
  await expect(severityRows(page)).toHaveText(FOUR_LEVELS);
});

test("the Duration card has no line under its value, for one run or every run", async ({ page }) => {
  await signIn(page);
  const duration = card(page, "Duration");
  await expect(duration.locator("[data-countup], .dash-stat-value").first()).toBeVisible();
  await expect(duration.locator(".dash-stat-note")).toHaveCount(0);
  await expect(duration).not.toContainText(/in total|longest|of the .*limit|no time limit/);
  await page.goto(`/?uid=${newest().uid}`);
  await expect(duration.locator(".dash-stat-value")).toBeVisible();
  await expect(duration.getByRole("meter", { name: "Time used of the limit" })).toBeVisible();
  await expect(duration.locator(".dash-stat-note")).toHaveCount(0);
  await expect(duration).not.toContainText(/in total|longest|of the .*limit|no time limit/);
});

test("every run's Report opens a run in the same view", async ({ page }) => {
  await signIn(page);
  const a = newest();
  await page.goto("/?view=reports");
  await hydrated(page);
  await page.getByRole("link", { name: new RegExp(`^Open the report of ${a.label}`) }).first().click();
  await expect(page).toHaveURL(new RegExp(`uid=${a.uid}`));
  await expect(page).toHaveURL(/view=reports/);
  // one run's report: no policy tiles, and every finding listed
  const tiles = page.getByRole("group", { name: "Report summary" }).locator("section");
  expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Findings", "Plan steps", "Requests sent", "Masked evidence"]);
  await expect(page.getByRole("table", { name: "Findings in this report" }).locator("tbody tr")).toHaveCount(a.findings.length);
});

test("one run's overview counts what its file holds", async ({ page }) => {
  await signIn(page);
  const a = newest();
  await page.goto(`/?uid=${a.uid}`);
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  await expect(stat(page, "Findings")).toHaveText(String(counted(a).length));
  await expect(stat(page, "Tool execution")).toHaveText(String(toolSteps(a)));
  await expect(card(page, "Tool execution")).toContainText(`${a.run.requests} ${a.run.requests === 1 ? "request" : "requests"} sent`);
  await expect(page.getByRole("button", { name: "Choose an assessment" })).toContainText(a.label);
  // every activity line sits in a lane, and every plan step has a row
  const lanes = page.getByRole("group", { name: /^Activity timeline from/ });
  await expect(lanes.locator("[data-mark]").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Plan steps" }).getByRole("listitem")).not.toHaveCount(0);
});

test("the overview's groups carry the transition's motion hooks", async ({ page }) => {
  await signIn(page);
  for (const name of ["top", "hero", "right", "bottom"]) await expect(page.locator(`[data-motion="${name}"]`)).toHaveCount(1);
  expect(await page.locator('[data-motion="fade"]').count()).toBeGreaterThanOrEqual(1); // hero text that only fades
  await expect(page.locator('[data-motion="hero"] [data-motion="fade"]').first()).toBeVisible();
  await expect(page.locator('[data-motion="hero"] canvas')).toHaveCount(1); // the globe stays in the hero
  await expect(page.locator('[data-motion="hero"] .dash-askbar')).toHaveCount(1);
});

test("an activity mark shows a tooltip and expands to its events, by mouse and keyboard", async ({ page }) => {
  await signIn(page);
  const a = newest();
  await page.goto(`/?uid=${a.uid}`);
  const lanes = page.getByRole("group", { name: /^Activity timeline from/ });
  const first = lanes.locator("[data-mark]").first();
  await first.hover();
  await expect(page.locator(".dash-tooltip")).toBeVisible();
  await first.click();
  const details = page.getByRole("dialog", { name: /events?$/ });
  await expect(details).toBeVisible();
  await expect(details.locator("time").first()).toContainText(/\d{4} · \d{2}:\d{2}:\d{2}/);
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await expect(first).toBeFocused(); // focus returns to the mark
  // one tab stop: the arrows move between marks, Enter opens one
  await page.keyboard.press("ArrowRight");
  await expect(first).not.toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /events?$/ })).toBeVisible();
  await page.getByRole("button", { name: "Close the details" }).click();
  await expect(page.getByRole("dialog", { name: /events?$/ })).toHaveCount(0);
});

test("with every run shown, a day lists its runs and a run row opens that run", async ({ page }) => {
  await signIn(page);
  const all = sample();
  const days = page.getByRole("group", { name: /^Assessments started per/ });
  await expect(days.locator("[data-mark]").first()).toBeVisible();
  await days.locator("[data-mark]").last().click();
  const dialog = page.getByRole("dialog", { name: /runs?$/ });
  await expect(dialog.getByRole("link").first()).toBeVisible();
  await page.keyboard.press("Escape");
  // a legend entry's meaning is reachable by keyboard, and Esc closes it
  const entry = page.getByRole("list", { name: /run status/ }).getByRole("button").first();
  await entry.focus();
  await expect(page.locator(".dash-tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dash-tooltip")).toHaveCount(0);
  const rows = page.getByRole("list", { name: /^The \d+ newest runs?/ }).getByRole("link");
  expect(all.length, "the sample data has at least eight runs").toBeGreaterThanOrEqual(8);
  await expect(rows).toHaveCount(8);
  const target = [...all].sort((x, y) => y.created_at.localeCompare(x.created_at))[1];
  await rows.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`uid=${target.uid}`));
  await expect(page.getByRole("button", { name: "Choose an assessment" })).toContainText(target.label);
});

test("the views switch in the page and keep their place in the address", async ({ page }) => {
  await signIn(page);
  for (const [name, param] of [["Findings", "findings"], ["Reports", "reports"], ["Assessments", "assessments"]]) {
    await page.click(view(name));
    await expect(page).toHaveURL(new RegExp(`view=${param}`));
    await expect(page.locator(view(name))).toHaveAttribute("data-active", "true");
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Assessments", level: 1 })).toBeVisible();
});

test("the switcher opens another assessment and keeps the view", async ({ page }) => {
  await signIn(page);
  await page.click(view("Findings"));
  const other = sample().find((a) => a.uid !== newest().uid && counted(a).length > 1)!;
  await page.getByRole("button", { name: "Choose an assessment" }).click();
  await page.locator(`[role="dialog"] a[href*="uid=${other.uid}"]`).click();
  await expect(page).toHaveURL(new RegExp(`uid=${other.uid}`));
  await expect(page).toHaveURL(/view=findings/);
  await expect(findingRows(page)).toHaveCount(other.findings.length);
});

test("the switcher is just the list, and the open run's name opens its Overview", async ({ page }) => {
  await signIn(page);
  const all = sample();
  const trigger = page.getByRole("button", { name: "Choose an assessment" });
  const panel = page.locator('[role="dialog"]');
  const title = panel.getByRole("link", { name: /^Open the overview of / });
  // (the rows' own status badges may say "Completed": the old rows are checked by their words)
  const gone = /^(Status|Started|Duration|Operator|Waiting on you|Every saved assessment)$|Saved assessments ·|saved assessments?$| of \d+ shown$/;
  // every run: no title, no every-run counts, no folder or count line
  await trigger.click();
  await expect(panel.locator("li a")).toHaveCount(all.length + 1); // "All assessments", then every run
  await expect(title).toHaveCount(0);
  await expect(panel.getByText(gone)).toHaveCount(0);
  expect(await panelExtras(page)).toBe("");
  await page.keyboard.press("Escape");

  // one run: its name first, a link to its Overview (the open view and filters are not carried)
  const a = all.find((x) => counted(x).length > 1)!;
  await page.goto(`/?uid=${a.uid}&view=findings&sev=HIGH`);
  await hydrated(page);
  await trigger.click();
  await expect(title).toHaveCount(1);
  await expect(title).toHaveAttribute("href", `/?uid=${a.uid}`);
  await expect(panel.locator("li a")).toHaveCount(all.length + 1);
  await expect(panel.getByText(gone)).toHaveCount(0);
  expect(await panelExtras(page)).toBe("");
  await title.click();
  await page.waitForURL((url) => url.pathname === "/" && url.search === `?uid=${a.uid}`);
  await expect(panel).toHaveCount(0); // the link closes the panel
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  await expect(trigger).toContainText(a.label);
});

test("a waiting run shows its pending approval", async ({ page }) => {
  await signIn(page);
  const waiting = sample().find((a) => a.status === "Awaiting input")!;
  await page.goto(`/?uid=${waiting.uid}`);
  await expect(card(page, "Assessment progress").getByText("Waiting for you")).toBeVisible();
  await expect(page.getByRole("region", { name: "Execution Timeline" }).getByText("Waiting for approval").first()).toBeVisible();
});

test("the report links every export format and each one downloads the newest run", async ({ page }) => {
  test.setTimeout(90_000); // the PDF is printed by a headless browser on this machine
  const run = newest();
  await page.goto(`/?uid=${run.uid}`);
  await page.click(view("Reports"));
  const buttons = page.getByRole("navigation", { name: "Download the report" }).getByRole("button");
  await expect(buttons).toHaveText(["PDF", "JSON", "DOCX"]);
  const media = { pdf: "application/pdf", json: "application/json", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  for (const [i, format] of (["pdf", "json", "docx"] as const).entries()) {
    // the button fetches the file, then saves it under the run's name
    const saved = page.waitForEvent("download", { timeout: 60_000 });
    await buttons.nth(i).click();
    expect((await saved).suggestedFilename(), format).toBe(`${run.uid}.${format}`);
    const href = `/api/assessments/${run.uid}/export?format=${format}`;
    const res = await page.request.get(href);
    expect(res.status(), format).toBe(200);
    expect(res.headers()["content-type"], format).toContain(media[format]);
    // every format is a download, and no export may be framed
    expect(res.headers()["content-disposition"], format).toMatch(/^attachment; /);
    expect(res.headers()["content-security-policy"], format).toContain("frame-ancestors 'none'");
    const body = await res.body();
    expect(body.length, `${format} is not empty`).toBeGreaterThan(100);
    if (format === "json") expect((JSON.parse(body.toString()) as { uid: string }).uid).toBe(run.uid);
  }
});

test("the top bar's docs search lists matching pages, and says when none matches", async ({ page }) => {
  await signIn(page);
  const search = page.getByRole("combobox", { name: "Search docs" });
  await search.fill("terminal");
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
  await search.fill("zzqx-no-such-page");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "No docs page matches" })).toHaveText("No docs page matches “zzqx-no-such-page”.");
});

test("one run's PDF that fails shows why and offers Retry, and one that can't be printed offers the DOCX", async ({ page }) => {
  const run = newest();
  let calls = 0;
  await page.route(`**/api/assessments/${run.uid}/export?format=pdf`, (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Stubbed print failure" }) })
      : route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ detail: NO_PRINTER }) });
  });
  await page.goto(`/?uid=${run.uid}&view=reports`);
  await hydrated(page);
  const pane = page.locator('[data-view-pane="reports"]');
  const status = pane.locator("[data-file]");
  await expect(status).toHaveAttribute("data-file", "idle");
  await page.getByRole("navigation", { name: "Download the report" }).getByRole("button", { name: "PDF" }).click();
  await expect(status).toHaveAttribute("data-file", "failed");
  await expect(status).toContainText("The PDF could not be generated: Stubbed print failure.");
  await status.getByRole("button", { name: "Retry" }).click();
  await expect(status).toHaveAttribute("data-file", "unsupported");
  await expect(status).toContainText(NO_PRINTER);
  await expect(status.getByRole("link", { name: "Download DOCX" })).toHaveAttribute("href", `/api/assessments/${run.uid}/export?format=docx`);
  expect(calls).toBe(2);
});

test("a card opens its documentation", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Open Findings by Severity documentation" }).click();
  // the card links the part of the Reports page that explains it, and the page opens there
  await expect(page).toHaveURL(/\/docs\/reports#understanding-findings$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
  await expect(page.locator("h2#understanding-findings")).toBeInViewport();
  expect((await page.request.get(page.url())).status()).toBe(200);
});

test("the removed Audit log and Scope addresses open the Overview", async ({ page }) => {
  for (const [param, label] of [["audit", "Audit log"], ["scope", "Scope"]]) {
    await page.goto(`/?view=${param}`);
    await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
    await expect(page.locator('nav[aria-label="Views"] button[aria-label="Overview"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator(`nav[aria-label="Views"] [aria-label="${label}"]`)).toHaveCount(0);
  }
  await expect(page.locator('[data-view-pane="scope"]')).toHaveCount(0);
});

test("an unknown assessment opens every run, and an unknown page is a 404", async ({ page }) => {
  await page.goto("/?uid=20200101-000000-dead_NOPE-1");
  await expect(page.getByRole("button", { name: "Choose an assessment" })).toContainText(`All (${sample().length})`);
  const res = await page.goto("/no-such-page");
  expect(res!.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Open the dashboard" })).toBeVisible();
});

test("findings filter by severity, validation and search, and clear in one click", async ({ page }) => {
  await signIn(page);
  const a = sample().find((x) => x.findings.length >= 3)!;
  await page.goto(`/?uid=${a.uid}&view=findings`);
  const rows = findingRows(page);
  await expect(rows).toHaveCount(a.findings.length);
  const sev = a.findings[0].severity;
  await page.getByRole("group", { name: "Severity" }).getByRole("button", { name: new RegExp(`^${sev.toLowerCase()}`) }).click();
  await expect(page).toHaveURL(new RegExp(`sev=${sev}`));
  await expect(rows).toHaveCount(a.findings.filter((f) => f.severity === sev).length);
  await page.getByRole("searchbox", { name: "Search findings" }).fill("no-such-finding-zzz");
  await expect(page.getByText("No finding matches these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows).toHaveCount(a.findings.length);
  await page.getByRole("group", { name: "Validation" }).getByRole("button", { name: /^Confirmed/ }).click();
  await expect(rows).toHaveCount(a.findings.filter((f) => f.validation === "CONFIRMED" && f.status !== "false-positive").length);
});

test("the overview drills into filtered views", async ({ page }) => {
  await signIn(page);
  const a = sample().find((x) => x.findings.some((f) => f.severity === "MEDIUM") && x.verdicts.some((v) => !v.allowed))!;
  await page.goto(`/?uid=${a.uid}`);
  const medium = a.findings.filter((f) => f.severity === "MEDIUM").length;
  await page.getByRole("button", { name: `Show the ${medium} medium ${medium === 1 ? "finding" : "findings"}` }).click();
  await expect(page).toHaveURL(/view=findings/);
  await expect(page).toHaveURL(/sev=MEDIUM/);
  await expect(findingRows(page)).toHaveCount(medium);

  // the summary strip's Findings card opens every finding, a top finding opens itself
  await page.click(view("Overview"));
  await page.getByRole("button", { name: "Open all findings" }).click();
  await expect(page).toHaveURL(/view=findings/);
  await expect(page).not.toHaveURL(/sev=/);
  await expect(findingRows(page)).toHaveCount(a.findings.length);
  await page.click(view("Overview"));
  await page.getByRole("button", { name: /^Open F-\d+/ }).first().click();
  await expect(page).toHaveURL(/finding=F-\d+/);
  await expect(selectedFinding(page)).toHaveCount(1);
});

test("the sidebar has no Terminal item and no logo, and the top bar no bell", async ({ page }) => {
  await signIn(page);
  for (const url of ["/", `/?uid=${sample().find((x) => x.status === "Awaiting input")!.uid}`, "/docs"]) {
    await page.goto(url);
    const rail = page.locator("aside.dash-sidebar");
    await expect(rail.getByRole("button", { name: "Overview" }).or(rail.getByRole("link", { name: "Overview" }))).toBeVisible();
    await expect(rail.locator('[data-view="terminal"]')).toHaveCount(0);
    await expect(rail.getByText("Terminal", { exact: true })).toHaveCount(0);
    // the views come first: no logo link above them
    await expect(rail.locator(":scope > a")).toHaveCount(0);
    await expect(rail.getByRole("link", { name: "Reconix local assessment viewer" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /waiting on you|Nothing waits on you/ })).toHaveCount(0);
  }
});

test("the switcher searches every saved run", async ({ page }) => {
  await signIn(page);
  const other = sample().find((x) => x.status !== "Awaiting input")!;
  await page.goto(`/?uid=${other.uid}`);
  await page.getByRole("button", { name: "Choose an assessment" }).click();
  const list = page.locator('[role="dialog"] li a');
  await expect(list).toHaveCount(sample().length + 1); // "All assessments", then every run
});
