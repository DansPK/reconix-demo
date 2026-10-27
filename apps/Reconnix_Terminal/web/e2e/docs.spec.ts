/* The documentation (docs/WEB_DOCS_INLINE_PLAN.md): each group is one page that shows all of its
   pages in place; the docs sidebar lists the groups (and, below xl, the pages of the group shown
   as anchors); nothing in the docs content or the docs top bar leads to another page; the search
   looks through the group shown and jumps within the page; code blocks carry a Copy button; every
   old address lands on its part; the rail has no Configuration; and on a phone the list folds
   behind the "Docs menu" button with nothing overflowing sideways. */
import { expect, test } from "./fixtures";

import { PORT } from "../playwright.config";
import { DOCS_REDIRECTS } from "../src/lib/docs-redirects";
import { DOCS_NAV, DOCS_ROUTES } from "../src/lib/docs-nav";

const ORIGIN = `http://127.0.0.1:${PORT}`;

/* The group titles of src/lib/docs-nav.ts, in order. */
const GROUPS = ["Getting started", "Terminal guide", "AI models", "Commands", "Security assessment guide", "Reports", "Troubleshooting", "Guardrails"];

type Page = import("@playwright/test").Page;
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Documentation", exact: true });
const searchBox = (page: Page) => page.getByRole("combobox", { name: "Search this section" });
const part = (page: Page, slug: string) => page.locator(`[data-docs-part="${slug}"]`);

/** A marker on `window` that survives in-page jumps and client navigations, not a page load. */
const mark = (page: Page) => page.evaluate(() => ((window as unknown as { kept: number }).kept = 7));
const marked = (page: Page) => page.evaluate(() => (window as unknown as { kept?: number }).kept);

test("the docs open in the dashboard's frame, with Documentation marked and no Configuration in the rail", async ({ page }) => {
  await page.goto("/docs/commands");
  const views = page.getByRole("navigation", { name: "Views" });
  await expect(views.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/");
  await expect(views.getByRole("link", { name: "Findings" })).toHaveAttribute("href", "/?view=findings");
  // the dashboard's views, without the removed Scope and Terminal views
  expect(await views.getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("data-view")))).toEqual([
    "overview",
    "assistant",
    "assessments",
    "findings",
    "reports",
  ]);
  await expect(views.getByRole("link", { name: "Scope" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Documentation", exact: true })).toHaveAttribute("aria-current", "page");
  // the rail's Settings item ("Configuration") is gone, on the docs and on the dashboard
  await expect(page.getByRole("link", { name: "Configuration", exact: true })).toHaveCount(0);
  await expect(page.locator(".dash-sidebar").getByText("Configuration")).toHaveCount(0);
  await expect(page.locator(".dash-frame .dash-content h1")).toHaveText("Commands");
  await views.getByRole("link", { name: "Findings" }).click();
  await page.waitForURL((url) => url.pathname === "/" && url.searchParams.get("view") === "findings");
  await expect(page.locator('nav[aria-label="Views"] button[aria-label="Findings"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".dash-sidebar").getByRole("link", { name: "Configuration" })).toHaveCount(0);
  await expect(page.locator(".dash-sidebar").getByText("Configuration")).toHaveCount(0);
  await expect(page.locator(".dash-sidebar").getByRole("link", { name: "Documentation", exact: true })).toBeVisible();
});

test("the sidebar lists every group, and choosing one shows that group's page", async ({ page }) => {
  await page.goto("/docs/terminal-guide");
  const nav = sidebar(page);
  expect(await nav.locator("[data-docs-groups] > li > a").allTextContents()).toEqual(GROUPS);
  await expect(nav.getByRole("link", { name: "Terminal guide", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("button")).toHaveCount(0); // no Expand / Collapse
  await mark(page);
  await nav.getByRole("link", { name: "Commands", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/commands$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Commands");
  await expect(nav.getByRole("link", { name: "Commands", exact: true })).toHaveAttribute("aria-current", "page");
  expect(await marked(page), "a client navigation, not a page load").toBe(7);
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).not.toHaveCount(0);
});

test("a group page shows its pages' text in place, as titled parts", async ({ page }) => {
  // /docs is Getting started itself: no landing cards, no redirect
  for (const route of ["/docs", "/docs/getting-started"]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Getting started");
    const content = page.locator("[data-docs-content]");
    expect(await content.getByRole("heading", { level: 2 }).allTextContents()).toEqual(["Introduction", "Requirements", "Installation", "Launching", "First steps"]);
    await expect(part(page, "introduction").getByRole("heading", { level: 3, name: "What Reconix does" })).toBeAttached();
    await expect(part(page, "introduction")).toContainText("keyboard-first terminal application");
    await expect(part(page, "launching").locator("pre").first()).toContainText("python -m reconix");
    await expect(page.getByText("Start here")).toHaveCount(0);
  }
  // the Commands page: every command, each with its facts and sections
  await page.goto("/docs/commands");
  const titles = await page.locator("[data-docs-content]").getByRole("heading", { level: 2 }).allTextContents();
  expect(titles).toEqual(DOCS_NAV.find((g) => g.id === "commands")!.pages.map((p) => p.title));
  const model = part(page, "model");
  for (const h of ["Purpose", "When to use it", "Syntax", "Example", "What happens", "Common errors"]) {
    await expect(model.getByRole("heading", { level: 3, name: h, exact: true })).toHaveAttribute("id", `model-${h.toLowerCase().replace(/ /g, "-")}`);
  }
  await expect(model.locator("dl")).toContainText("/models"); // the alias
  await expect(model.locator("pre").first()).toContainText("/model [<provider>/<model>]");
  // the error table's meaning column keeps room to read (a long key never squeezes it)
  const widths = await part(page, "add-on").locator("table.docs-table td").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(5);
  for (const w of widths) expect(w).toBeGreaterThanOrEqual(220);
});

test("nothing in the docs content or the docs top bar leads to another page", async ({ page }) => {
  for (const route of DOCS_ROUTES) {
    await page.goto(route);
    const off = await page.evaluate(() => {
      const here = location.pathname;
      const groups = new Set(document.querySelectorAll("[data-docs-groups] > li > a"));
      return [...document.querySelectorAll<HTMLAnchorElement>(".dash-content a[href], header.dash-topbar a[href]")]
        .filter((a) => {
          const url = new URL(a.getAttribute("href")!, location.href);
          return (url.origin !== location.origin || url.pathname !== here) && !groups.has(a);
        })
        .map((a) => `${a.textContent?.trim()} → ${a.getAttribute("href")}`);
    });
    expect(off, `${route} links off the page`).toEqual([]);
    // the top bar says where you are and holds no control; no card, chip or Previous / Next
    await expect(page.locator("header.dash-topbar").locator("a, button")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Previous and next page" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
  }
});

test("every code block has a Copy button that copies its text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  await page.goto("/docs/getting-started");
  await expect(page.locator("html[data-hydrated]")).toHaveCount(1); // hydrated: the buttons are live
  await expect(page.getByRole("button", { name: "Copy code" })).toHaveCount(await page.locator("pre").count());
  await part(page, "launching").getByRole("button", { name: "Copy code" }).first().click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible(); // the label follows the state
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("python -m reconix");
});

test("the search looks through the group shown and jumps within the page", async ({ page }) => {
  await page.goto("/docs/commands");
  await expect(page.locator("html[data-hydrated]")).toHaveCount(1);
  await mark(page);
  const box = searchBox(page);
  await expect(box).toHaveAttribute("placeholder", "Search this section…");
  await box.fill("/model");
  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(results.getByRole("option").first()).toContainText("/model");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/docs\/commands#model$/);
  await expect(page.locator("h2#model")).toBeInViewport();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Commands");
  expect(await marked(page), "the same page, never another").toBe(7);
  // an alias finds its command
  await box.fill("/agent");
  await expect(results.getByRole("option").first()).toContainText("/assess");
  // another group's sections are not searched here
  await box.fill("double check");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("option")).toHaveCount(0);

  // on the assessment guide, a section heading is a hit too, and the jump lands on that section
  await page.goto("/docs/assessment-guide");
  await expect(page.locator("html[data-hydrated]")).toHaveCount(1);
  await mark(page);
  await searchBox(page).fill("double check");
  await expect(results.getByRole("option").first()).toContainText("Approval gates");
  await results.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/docs\/assessment-guide#approval-gates-high-risk-the-double-check$/);
  await expect(page.locator("#approval-gates-high-risk-the-double-check")).toBeInViewport();
  expect(await marked(page)).toBe(7);
});

test("every docs route answers 200 and has one h1", async ({ page }) => {
  expect(DOCS_ROUTES).toEqual(["/docs", ...DOCS_NAV.map((g) => `/docs/${g.id}`)]);
  const broken: string[] = [];
  for (const route of DOCS_ROUTES) {
    const res = await page.request.get(route);
    if (res.status() !== 200) {
      broken.push(`${route}: ${res.status()}`);
      continue;
    }
    // the page, not just the route: one h1 in the served HTML
    const h1s = (await res.text()).match(/<h1[\s>]/g)?.length ?? 0;
    if (h1s !== 1) broken.push(`${route}: ${h1s} h1 elements`);
  }
  expect(broken).toEqual([]);
});

test("a search with no match opens nothing, and Enter stays on the page", async ({ page }) => {
  await page.goto("/docs");
  const box = searchBox(page);
  await box.fill("zzz-no-such-topic");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("option")).toHaveCount(0);
  await box.press("Enter");
  await expect(page).toHaveURL(/\/docs$/);
});

test("the search results move with ArrowDown and ArrowUp, and Escape closes them", async ({ page }) => {
  await page.goto("/docs/commands");
  const box = searchBox(page);
  await box.fill("model");
  const options = page.getByRole("listbox", { name: "Search results" }).getByRole("option");
  expect(await options.count()).toBeGreaterThan(1);
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await box.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "false");
  await box.press("ArrowUp");
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await box.press("ArrowDown");
  const second = (await options.nth(1).locator("span").first().textContent())!;
  await box.press("Escape");
  await expect(box).toHaveAttribute("aria-expanded", "false");
  await expect(options).toHaveCount(0);
  // typing again opens it; the arrows and Enter jump to the part that was highlighted
  await box.fill("model");
  await box.press("ArrowDown");
  await box.press("Enter");
  await expect(page.locator("[data-docs-content]").getByRole("heading", { level: 2, name: second, exact: true })).toBeInViewport();
});

test("the box names the active result, keeps it in range when the hits shrink, jumps with Enter, and an option jumps on click", async ({ page }) => {
  await page.goto("/docs/commands");
  const box = searchBox(page);
  const options = page.getByRole("listbox", { name: "Search results" }).getByRole("option");
  const activeId = async () => (await box.getAttribute("aria-activedescendant"))!;
  await box.fill("model");
  const many = await options.count();
  expect(many).toBeGreaterThan(2);
  expect(await activeId()).toBe(await options.nth(0).getAttribute("id"));
  for (let i = 0; i < many - 1; i++) await box.press("ArrowDown");
  expect(await activeId()).toBe(await options.nth(many - 1).getAttribute("id")); // the last one
  await box.press("ArrowDown"); // and no further
  expect(await activeId()).toBe(await options.nth(many - 1).getAttribute("id"));
  await box.press("ArrowUp");
  expect(await activeId()).toBe(await options.nth(many - 2).getAttribute("id"));
  // fewer hits: the active one is clamped to one that exists, and it is the one marked
  await box.fill("/model");
  const few = await options.count();
  expect(few).toBeLessThan(many);
  const markedOption = page.getByRole("listbox", { name: "Search results" }).getByRole("option", { selected: true });
  await expect(markedOption).toHaveCount(1);
  expect(await activeId()).toBe(await markedOption.getAttribute("id"));
  expect(await page.locator(`[id="${await activeId()}"]`).count()).toBe(1); // it points at an element
  await box.press("Escape");
  await expect(box).not.toHaveAttribute("aria-activedescendant", /./);
  await expect(options).toHaveCount(0);
  await box.fill("/model");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/docs\/commands#model$/);
  await box.fill("export");
  await expect(options.first()).toBeVisible();
  const chosen = (await options.first().locator("span").first().textContent())!;
  await options.first().click();
  await expect(page.locator("[data-docs-content]").getByRole("heading", { level: 2, name: chosen, exact: true })).toBeInViewport();
  await expect(page).toHaveURL(/\/docs\/commands#/);
});

test("every old address lands on its part of a group page", async ({ page }) => {
  // each page's own address (one page per address, before): 308 to its anchor
  for (const g of DOCS_NAV) {
    for (const p of g.pages) {
      const res = await page.request.get(`/docs/${g.id}/${p.slug}`, { maxRedirects: 0 });
      expect(res.status(), p.href).toBe(308);
      expect(res.headers().location, p.href).toBe(p.href);
    }
  }
  // the v2 addresses: straight to the new address, in one hop
  for (const r of DOCS_REDIRECTS) {
    const res = await page.request.get(r.source, { maxRedirects: 0 });
    expect(res.status(), r.source).toBe(308);
    expect(res.headers().location, r.source).toBe(r.destination);
  }
  // and in the browser, the part is on screen
  for (const [source, url, heading] of [
    ["/docs/commands/add-on", /\/docs\/commands#add-on$/, "add-on"],
    ["/docs/getting-started/configuration", /\/docs\/ai-models#configuration$/, "configuration"],
    ["/docs/reference/findings", /\/docs\/reports#understanding-findings$/, "understanding-findings"],
  ] as const) {
    const res = await page.goto(source);
    expect(res!.status()).toBe(200);
    await expect(page).toHaveURL(url);
    await expect(page.locator(`h2#${heading}`)).toBeInViewport();
  }
});

test.describe("below xl", () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test("the sidebar lists the pages of the group shown as anchors on its page", async ({ page }) => {
    await page.goto("/docs/terminal-guide");
    await expect(page.locator("html[data-hydrated]")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "On this page" })).toBeHidden();
    const pages = sidebar(page).getByRole("list", { name: "Terminal guide pages" });
    await expect(pages.getByRole("link")).toHaveText(["The screens", "Keys", "The command bar", "The prompt"]);
    await expect(pages.getByRole("link", { name: "Keys" })).toHaveAttribute("href", "#keys");
    await mark(page);
    await pages.getByRole("link", { name: "Keys" }).click();
    await expect(page).toHaveURL(/\/docs\/terminal-guide#keys$/);
    await expect(page.locator("h2#keys")).toBeInViewport();
    await expect(pages.getByRole("link", { name: "Keys" })).toHaveAttribute("aria-current", "location");
    expect(await marked(page)).toBe(7);
    // only the group shown lists its pages
    await expect(sidebar(page).getByRole("list", { name: "Commands pages" })).toHaveCount(0);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the list folds behind the Docs menu button and nothing overflows sideways", async ({ page }) => {
    await page.goto("/docs/commands");
    await expect(page.locator("html[data-hydrated]")).toHaveCount(1);
    const button = page.getByRole("button", { name: "Docs menu" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar(page)).toBeHidden();
    await expect(searchBox(page)).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar(page)).toBeVisible();
    await sidebar(page).getByRole("link", { name: "/finding", exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/commands#finding$/);
    await expect(sidebar(page)).toBeHidden(); // closed again after choosing a page
    await expect(page.locator("h2#finding")).toBeInViewport();
    // a group opens its page, and the menu closes
    await button.click();
    await sidebar(page).getByRole("link", { name: "Terminal guide", exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/terminal-guide$/);
    await expect(sidebar(page)).toBeHidden();
    for (const url of ["/docs/commands", "/docs/terminal-guide", "/docs/ai-models", "/docs"]) {
      await page.goto(url);
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth);
      expect(overflow, `${url} overflows sideways`).toBeLessThanOrEqual(0);
    }
    // the tables stack: every meaning cell is as wide as the table, never squeezed by a long key
    await page.goto("/docs/commands");
    const widths = await part(page, "add-on").locator("table.docs-table td").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(300);
  });

  test("a code block that scrolls sideways is a tab stop named Code, and one that fits is not", async ({ page }) => {
    // /provider's syntax line is the longest of the commands: wider than a phone
    await page.goto("/docs/commands#provider");
    await expect(page.locator('.docs-code pre[tabindex="0"]').first()).toBeAttached(); // hydrated and measured
    const blocks = await page.locator(".docs-code pre").evaluateAll((els) =>
      els.map((el) => ({
        scrolls: el.scrollWidth > el.clientWidth + 1, // ScrollRegion's own tolerance
        stop: el.getAttribute("tabindex") === "0" && el.getAttribute("role") === "region" && el.getAttribute("aria-label") === "Code",
      })),
    );
    expect(blocks.some((b) => b.scrolls), "a block that scrolls at phone width").toBe(true);
    for (const b of blocks) expect(b.stop, "a tab stop exactly when it scrolls").toBe(b.scrolls);
    const stop = part(page, "provider").locator('.docs-code pre[tabindex="0"]').first();
    await stop.focus();
    await expect(stop).toBeFocused();
    await expect(stop).toHaveCSS("outline-style", "solid"); // the focus mark (.ui-scroll-region)
  });
});
