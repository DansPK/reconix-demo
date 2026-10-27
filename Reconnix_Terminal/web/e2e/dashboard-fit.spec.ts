/* The Overview fits the fixed desktop frame (docs/WEB_REDESIGN_V3_PLAN.md, workstream E1): at the
   standard desktop sizes from the smallest fixed frame (1280×760) up, the content area has nothing
   to scroll and every card sits whole inside the viewport, for every run and for one run. Sizes
   below 1280×760 are not the fixed frame (the window scrolls by design: scroll.spec.ts).
   Motion is reduced so the intro's enter transforms (cards slide up 24 px) don't count as
   overflow while they play; the layout they land on is what is measured. */
import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { newest, sample } from "./support";

const SIZES = [
  { width: 1280, height: 760 }, // the smallest fixed frame
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const label = (s: { width: number; height: number }) => `${s.width}×${s.height}`;
test.beforeAll(() => expect(sample().length, "the every-run mode needs at least eight runs").toBeGreaterThanOrEqual(8));
const MODES = [
  { name: "every run", view: "overview" },
  { name: "one run", view: `overview&uid=${newest().uid}` },
  { name: "the run with every severity", view: "overview&uid=20260929-112000-8c51_RCX-DEMO-001" }, // critical to low, one a false positive
  { name: "the heaviest run", view: "overview&uid=20261005-140300-9f76_RCX-DEMO-001" },
  { name: "the run with twelve findings", view: "overview&uid=20260929-112000-8c51_RCX-DEMO-002" },
  { name: "a run with nothing found", view: "overview&uid=20261001-083000-2265_RCX-DEMO-001" },
  { name: "a run stopped before its scope", view: "overview&uid=20261001-083000-2265_RCX-DEMO-003" },
];

/** The content area's hidden height (0 when nothing scrolls) and the cards outside the viewport. */
function fit(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const outside = Array.from(document.querySelectorAll<HTMLElement>(".dash-overview .dash-card"))
      .map((card) => ({ card, box: card.getBoundingClientRect() }))
      .filter(({ box }) => box.top < -0.5 || box.bottom > innerHeight + 0.5 || box.left < -0.5 || box.right > innerWidth + 0.5)
      .map(({ card, box }) => `${card.getAttribute("aria-label") ?? card.querySelector("h2")?.textContent} (${Math.round(box.top)}–${Math.round(box.bottom)})`);
    return { scroller: getComputedStyle(main).overflowY, overflow: main.scrollHeight - main.clientHeight, outside };
  });
}

/** Wait until the open view stops changing (the intro, fonts and the globe settle). */
async function settled(page: Page) {
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await fit(page));
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [300], timeout: 20_000 },
    )
    .toBe(true);
}

for (const size of SIZES) {
  test.describe(`at ${label(size)}`, () => {
    test.use({ viewport: size, reducedMotion: "reduce" });

    for (const mode of MODES) {
      test(`the Overview for ${mode.name} fits the content area, every card inside the viewport`, async ({ page }) => {
        await page.goto(`/?view=${mode.view}`);
        await expect(page.locator(".dash-overview")).toBeVisible();
        await settled(page);
        const state = await fit(page);
        expect(state.scroller, "the fixed frame: the content area is the scroller").toBe("auto");
        expect(state.overflow, `${mode.name} at ${label(size)}: the content area scrolls`).toBe(0);
        expect(state.outside, `${mode.name} at ${label(size)}: cards outside the viewport`).toEqual([]);
      });
    }
  });
}

// one size with the intro playing: the layout it lands on still fits (every card has arrived)
test.describe("at 1440×900 with motion on", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });

  for (const mode of MODES.slice(0, 2)) {
    test(`the Overview for ${mode.name} fits once the intro has settled`, async ({ page }) => {
      await page.goto(`/?view=${mode.view}`);
      await expect(page.locator(".dash-overview")).toBeVisible();
      // the intro's last frames: the frame scales in (transform) and a card still settles by a few px
      // while it does; the layout is the one measured once the frame holds no transform
      await page.waitForFunction(() => getComputedStyle(document.querySelector(".dash-frame")!).transform === "none", undefined, { timeout: 20_000 });
      await settled(page);
      const state = await fit(page);
      expect(state.overflow, `${mode.name}: the content area scrolls`).toBe(0);
      expect(state.outside, `${mode.name}: cards outside the viewport`).toEqual([]);
    });
  }
});
