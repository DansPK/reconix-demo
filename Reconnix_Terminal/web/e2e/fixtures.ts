/* `test` and `expect` for every spec: the same as Playwright's, except that `page.goto` of a
   dashboard address ("/" with any query) returns once `html[data-hydrated]` is set. A click before
   hydration can be replayed or lost, and under three workers that was the main source of flakes. */
import { expect, test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    page.goto = (async (url, options) => {
      const res = await goto(url, options);
      if (res?.ok() && new URL(page.url()).pathname === "/") await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
      return res;
    }) as typeof page.goto;
    await provide(page);
  },
});

export { expect };
