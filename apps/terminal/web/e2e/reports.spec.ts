/* The Report view from the Core API (against the stand-in, e2e/core-api-stub.mjs): `/reports`
   with nothing picked opens the first assessment's report; one assessment's report shows its
   summary strip and its findings, and the header's Download chips (PDF, JSON, DOCX) save the file.
   A signed-off version downloads the Core API's file through the dashboard; a run whose review
   is pending (or with no report) exports its saved run's own file instead; a refused download
   says what the API said and saves nothing; an unknown id says so without a picker; and the
   assessment is shared with the Findings view (`/reports/<id>` -> `/findings/<id>`). */
import { type Page } from "@playwright/test";

import { apiId } from "./core-api-ids.mjs";
import { expect, test } from "./fixtures";
import { hydrated, newest, sample, signIn } from "./support";

/** The runs with one report version (the stand-in gives the newest twelve: core-api-stub.mjs LONG). */
const runs = () => sample().filter((a) => a.uid !== newest().uid);
const shown = (a: ReturnType<typeof sample>[number]) => a.findings.filter((f) => f.status !== "false-positive" && f.severity.toUpperCase() !== "INFO");
const picker = (page: Page) => page.locator('[data-view-pane="reports"]').getByRole("combobox", { name: "Assessment" });
const downloads = (page: Page) => page.getByRole("navigation", { name: "Download the report" });

async function openReport(page: Page, uid: string | null) {
  await signIn(page);
  await page.goto(uid ? `/reports/${apiId(uid)}` : "/reports");
  await hydrated(page);
}

/** Click a format's Download chip in the header. */
async function exportAs(page: Page, format: "PDF" | "DOCX" | "JSON") {
  await downloads(page).getByRole("button", { name: format, exact: true }).click();
}

test("with no assessment picked, Reports opens the first Core API assessment's report", async ({ page }) => {
  await openReport(page, null);
  await expect(page).toHaveURL(new RegExp(`/reports/${apiId(newest().uid)}$`));
  await expect(page.getByRole("heading", { name: "Report", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose an assessment" })).toContainText(newest().label);
});

test("a signed-off report shows its summary and findings, and exports the Core API's file", async ({ page }) => {
  const a = runs().find((x) => x.status === "Completed" && shown(x).length > 0)!;
  await openReport(page, a.uid);
  const strip = page.getByRole("group", { name: "Report summary" });
  await expect(strip).toContainText("Findings");
  await expect(strip.locator('section[aria-label="Findings"] [data-countup]').first()).toHaveText(String(shown(a).length));
  await expect(page.getByRole("table", { name: "Assessment findings" }).locator("tbody tr")).toHaveCount(shown(a).length);
  const code = a.assessment_id || a.uid;
  await expect(downloads(page).getByRole("button")).toHaveCount(3);
  const saved = page.waitForEvent("download");
  const asked = page.waitForRequest((r) => r.url().includes("/api/core-reports/") && r.url().endsWith("format=PDF"));
  await exportAs(page, "PDF");
  await asked;
  expect((await saved).suggestedFilename()).toBe(`${code}-v1.pdf`); // the signed-off version's file
  const toasts = page.getByRole("region", { name: "Notifications" });
  await expect(toasts).toContainText(`Saved ${code}-v1.pdf.`); // a toast, not a line under the chips
  await expect(downloads(page).locator("..").getByRole("status")).toHaveCount(0);
});

test("a report whose review is pending exports the saved run's own file, not the unsigned one", async ({ page }) => {
  const a = runs().find((x) => x.status !== "Completed" && x.status !== "Stopped")!;
  await openReport(page, a.uid);
  let unsigned = 0;
  page.on("request", (r) => (r.url().includes("/api/core-reports/") && r.url().includes("/download") ? (unsigned += 1) : undefined));
  const saved = page.waitForEvent("download");
  await exportAs(page, "JSON");
  expect((await saved).suggestedFilename()).toBe(`${a.uid}.json`);
  expect(unsigned, "the unsigned version's file is never asked for").toBe(0);
});

test("an assessment with no report yet can still export its saved run", async ({ page }) => {
  const a = runs().find((x) => x.status === "Stopped")!;
  await openReport(page, a.uid);
  await expect(page.getByRole("heading", { name: "Report", level: 1 })).toBeVisible();
  const saved = page.waitForEvent("download");
  await exportAs(page, "JSON");
  expect((await saved).suggestedFilename()).toBe(`${a.uid}.json`);
});

test("a download the API refuses says what it said, and saves nothing", async ({ page }) => {
  const a = runs().find((x) => x.status === "Completed")!;
  await openReport(page, a.uid);
  await page.route("**/api/core-reports/*/download?format=DOCX", (route) =>
    route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "REPORT_FILE_CHANGED", message: "The DOCX file changed after the sign-off." }) }),
  );
  let saved = 0;
  page.on("download", () => (saved += 1));
  await exportAs(page, "DOCX");
  await expect(page.getByRole("alert").filter({ hasText: "sign-off" })).toHaveText("The DOCX file changed after the sign-off. (REPORT_FILE_CHANGED)");
  expect(saved).toBe(0);
});

test("an assessment id the Core API doesn't know shows the not-found note without a picker", async ({ page }) => {
  await signIn(page);
  await page.goto("/reports/99999999-9999-4999-8999-999999999999");
  await expect(page.locator('[data-view-pane="reports"]').getByText("The Core API has no assessment with that id. Pick another one.")).toBeVisible();
  await expect(picker(page)).toHaveCount(0);
});

test("the assessment of a report is shared with the Findings view", async ({ page }) => {
  const a = runs().find((x) => x.status === "Completed" && shown(x).length > 0)!;
  await openReport(page, a.uid);
  await page.click('nav[aria-label="Views"] button[aria-label^="Findings"]');
  await expect(page).toHaveURL(new RegExp(`/findings/${apiId(a.uid)}$`));
  await expect(page.locator('[data-view-pane="findings"] ul.dash-findings-rows > li')).toHaveCount(shown(a).length);
});
