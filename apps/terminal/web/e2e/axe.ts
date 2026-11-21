/* One axe-core pass (WCAG 2.2 A/AA rules) of the page as it stands, and the opener that waits
   for a dashboard view or the assistant's composer: shared by e2e/a11y.spec.ts and
   e2e/a11y-assistant.spec.ts (the serial one: it writes to the assistant's conversation folder). */
import { AxeBuilder } from "@axe-core/playwright";
import { type Page, type TestInfo } from "@playwright/test";

import { AXE_MOTION } from "../playwright.config";
import { expect } from "./fixtures";

import { hydrated } from "./support";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/* Known violations by page and axe rule (none today). Each entry is expected to be found, and the
   test fails with "remove it from KNOWN" once it is gone, so a stale entry can't hide a new one. */
const KNOWN: Record<string, string[]> = {};

/* Motion for the axe passes: reduced (everything on screen at once, nothing mid-animation),
   except in the axe-motion project (playwright.config.ts), which runs at 1366x768 with the OS's
   own setting, as most people have it. */
export const AXE_MOTION_OR_REDUCED = {
  reducedMotion: async ({}, provide: (motion: "reduce" | "no-preference") => Promise<void>, info: TestInfo) =>
    provide(info.project.name === AXE_MOTION ? "no-preference" : "reduce"),
};

/**
 * Freeze the hero globe through the app's own pause path, so axe gets the main thread.
 *
 * The Overview's WebGL globe keeps drawing in the axe-motion project (it only freezes itself
 * under `prefers-reduced-motion`, globe.tsx), and on a software-WebGL runner that rasterises on
 * the CPU it starves `analyze()`: the three Overview-bearing axe tests took 1.3-1.6 min each,
 * past this project's 30 s budget, and the assessment switcher never finished at all — so the
 * gate QAL-002 added could not pass on the very view QAL-002 was about.
 *
 * `document.hidden` is read by nothing in the app but globe.tsx, so turning it on and firing
 * `visibilitychange` reaches exactly `controls.pause("hidden")` — the same hold the app uses when
 * the tab goes away. It cancels the animation frame and leaves the last frame on the canvas, so
 * the page axe scans looks the same and the canvas stays in the scan (nothing is excluded, and
 * its own roles and names are still checked). Lifted again afterwards, so a later step in the
 * same test sees a live globe.
 *
 * Under reduced motion this is a no-op in effect: the globe already drew one still frame and runs
 * no loop, so it is applied in every project and every axe pass is deterministic.
 */
async function withGlobeFrozen<T>(page: Page, run: () => Promise<T>): Promise<T> {
  const setHidden = (hidden: boolean) =>
    page.evaluate((on) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => on });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (on ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

  await setHidden(true);
  /* The globe reports its own state: "paused" once the hold lands, "still" under reduced motion
     (one frame, no loop). Wait for either, briefly and without failing: a page with no globe, or
     a runner with no WebGL at all, never sets it and has no loop to stop either. */
  await page
    .waitForFunction(
      () => {
        const c = document.querySelector("canvas.dash-globe-canvas");
        return !c || (c as HTMLCanvasElement).dataset.globe !== "running";
      },
      undefined,
      { timeout: 5000 },
    )
    .catch(() => {});
  try {
    return await run();
  } finally {
    await setHidden(false).catch(() => {}); // the page may already be gone
  }
}

/** Wait until every animation that ends has ended (an entrance fade, a slide): with motion on
    (the axe-motion project), axe would otherwise read a label mid fade-in, at a colour it never
    rests at. Looping animations (the breathing globe and icons) never end and are not waited for,
    so the page is still checked as it moves. */
async function settled(page: Page) {
  await page
    .waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
      undefined,
      { timeout: 5000 },
    )
    .catch(() => {});
}

export async function axe(page: Page, name: string) {
  await settled(page);
  const { violations } = await withGlobeFrozen(page, () => new AxeBuilder({ page }).withTags(WCAG).analyze());
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
  const ready = /^\/assistant(\/|\?|$)/.test(url) ? page.getByRole("textbox", { name: /^Ask about/ }).last() : page.locator("main > :not([hidden])").first();
  await expect(ready).toBeVisible();
  await hydrated(page);
}
