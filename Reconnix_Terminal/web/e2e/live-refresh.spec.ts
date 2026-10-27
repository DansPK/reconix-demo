/* The top bar's live-refresh pill. The e2e server reads the saved files once per load
   (RECONIX_LIVE_REFRESH_MS=0: a self-refresh under a test would re-render a view mid-assertion),
   so it shows "Static". A second dashboard (playwright.config.ts, LIVE_PORT) refreshes every
   second: its pill is "Live", re-reads on its own, and pauses on a click. */
import { expect, test } from "./fixtures";

import { LIVE_PORT, PORT } from "../playwright.config";
import { hydrated } from "./support";

/** The router.refresh() call: a Flight request for the page itself, not a link's prefetch. */
const isRefresh = (r: import("@playwright/test").Request) => !!r.headers()["rsc"] && !r.headers()["next-router-prefetch"];
const pill = (page: import("@playwright/test").Page) => page.locator("[data-live-refresh]");

test("the e2e server has live refresh off: a static pill, no polling", async ({ page }) => {
  let refreshes = 0;
  page.on("request", (r) => {
    if (isRefresh(r)) refreshes += 1;
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await hydrated(page);
  await expect(pill(page)).toHaveAttribute("data-live-refresh", "off");
  await expect(pill(page)).toContainText("Static");
  expect(refreshes, "nothing re-reads the files on its own").toBe(0);
});

test.describe("with live refresh on (every second)", () => {
  test.use({ baseURL: `http://127.0.0.1:${LIVE_PORT}` });

  test("the pill is Live, the page re-reads by itself, and a click pauses it", async ({ page }) => {
    await page.goto("/");
    await hydrated(page);
    await expect(pill(page)).toHaveAttribute("data-live-refresh", "on");
    await expect(pill(page)).toHaveAttribute("aria-pressed", "true");
    const stamp = (await pill(page).textContent())!;
    // the time it shows is when the server rendered: a refresh changes it
    await expect.poll(async () => pill(page).textContent(), { timeout: 15_000, message: "the page re-read the saved files" }).not.toBe(stamp);
    await expect(pill(page)).toHaveAttribute("data-live-refresh", "on"); // and client state survived it
    await pill(page).click();
    await expect(pill(page)).toHaveAttribute("data-live-refresh", "paused");
    await expect(pill(page)).toHaveAttribute("aria-pressed", "false");
    await expect(pill(page)).toContainText("Paused");
    // paused: two intervals go by (the one deliberate wait: nothing happening cannot be polled for)
    // and the server is not asked again
    const paused = (await pill(page).textContent())!;
    let asked = 0;
    page.on("request", (r) => {
      if (isRefresh(r)) asked += 1;
    });
    await page.waitForTimeout(2200);
    expect(asked, "no refresh while paused").toBe(0);
    expect(await pill(page).textContent(), "paused: the time stays").toBe(paused);
    await pill(page).click();
    await expect(pill(page)).toHaveAttribute("data-live-refresh", "on");
  });
});
