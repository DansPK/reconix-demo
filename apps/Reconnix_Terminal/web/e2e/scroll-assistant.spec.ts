/* The AI Assistant's scrolling (docs/WEB_REDESIGN_V2_PLAN.md §6): its conversation scrolls on
   its own with the composer in view, keeps a reader who scrolled up, and offers the way back
   down. These send questions (the stand-in model answers), so they write to the assistant's
   conversation folder: the serial-assistant project (playwright.config.ts) runs them alone. */
import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { clickMoving, frames, sideways, sizeLabel as label } from "./support";

// the "way back down" runs with motion on (the project's default is reduced, for speed)
test.use({ reducedMotion: "no-preference" });

// ---- the assistant: its own scroller, the composer in view ----------------------------------

/** A question tall enough to need scrolling; the stand-in model echoes it in its answer. */
const tall = (n: number) => `Q${n}: ` + Array.from({ length: 30 }, (_, i) => `line ${i} of a long question about findings and scope`).join("\n");

async function ask(page: Page, n: number) {
  const composer = page.getByRole("textbox", { name: /^Ask about/ }).last();
  await composer.fill(tall(n));
  // Enter is ignored while the previous reply is still closing: press until it is taken
  await expect(async () => {
    if (await composer.inputValue()) await composer.press("Enter");
    expect(await composer.inputValue()).toBe("");
  }).toPass({ timeout: 15_000 });
  const log = page.getByRole("log", { name: "Conversation" });
  // the question, then the answer that repeats it
  await expect.poll(async () => ((await log.innerText()).match(new RegExp(`Q${n}: line 0`, "g")) ?? []).length, { timeout: 15_000 }).toBe(2);
  await expect(log).not.toHaveAttribute("aria-busy", "true");
}

const logState = (page: Page) =>
  page.getByRole("log", { name: "Conversation" }).evaluate((el) => ({ top: el.scrollTop, range: el.scrollHeight - el.clientHeight }));

for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test.describe(`the assistant at ${label(size)}`, () => {
    test.use({ viewport: size, reducedMotion: "reduce" });

    test("the conversation scrolls with the wheel, keeps a reader who scrolled up, and the composer stays in view", async ({ page }) => {
      await page.goto("/?view=assistant");
      const composer = page.getByRole("textbox", { name: /^Ask about/ }).last();
      await expect(composer).toBeVisible();
      await ask(page, 1);
      await ask(page, 2);

      const log = page.getByRole("log", { name: "Conversation" });
      await expect.poll(async () => (await logState(page)).range).toBeGreaterThan(400);

      // (following new answers on its own is the "way back down" test below and the unit tests)
      const box = (await log.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 5000);
      await expect.poll(async () => { const s = await logState(page); return s.range - s.top; }).toBeLessThanOrEqual(1);

      const inView = async () => {
        const b = (await composer.boundingBox())!;
        return b.y >= 0 && b.y + b.height <= size.height;
      };
      expect(await inView()).toBe(true);
      expect(await page.evaluate(() => scrollY)).toBe(0); // the page itself did not have to move

      await page.mouse.wheel(0, -600);
      await expect.poll(async () => { const s = await logState(page); return s.range - s.top; }).toBeGreaterThan(300);
      const reading = (await logState(page)).top;

      // more arrives while the reader is up the page: they stay where they are
      await log.evaluate((el) => {
        const more = document.createElement("p");
        more.style.height = "400px";
        more.textContent = "more content";
        el.appendChild(more);
      });
      await frames(page, 4); // the new content is laid out and the stick-to-bottom has had its say
      expect(Math.abs((await logState(page)).top - reading)).toBeLessThanOrEqual(1);

      await page.mouse.wheel(0, 5000);
      await expect.poll(async () => { const s = await logState(page); return s.range - s.top; }).toBeLessThanOrEqual(1);
      expect(await inView()).toBe(true);
      expect(await sideways(page)).toMatchObject({ page: 0 });
    });
  });
}

/* The conversation's way back down: useStickToBottom with the assistant's view. */
test.describe("the assistant's way back down", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("New messages appears after scrolling up, follows nothing until clicked, then glides back and follows again", async ({ page }) => {
    await page.goto("/?view=assistant");
    await ask(page, 1);
    await ask(page, 2);
    const log = page.getByRole("log", { name: "Conversation" });
    const box = (await log.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    const back = page.getByRole("button", { name: "New messages" });
    await expect(back).toBeVisible();
    await clickMoving(page, back); // the panel breathes, so it is never "stable"
    await expect.poll(async () => { const s = await logState(page); return s.range - s.top; }).toBeLessThanOrEqual(1);
    await expect(back).toBeHidden();
    await log.evaluate((el) => {
      const more = document.createElement("p");
      more.style.height = "400px";
      el.appendChild(more);
    });
    await expect.poll(async () => { const s = await logState(page); return s.range - s.top; }).toBeLessThanOrEqual(1); // followed
  });
});
