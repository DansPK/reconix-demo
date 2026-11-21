/* Accessibility (docs/WEB_REDESIGN_V2_PLAN.md §6.5): an axe-core check (WCAG 2.2 A/AA rules) of
   the Overview, Findings and Reports (one run and every run), the Assessments view, the Assessment
   switcher and the AI Assistant; the keyboard's path through the
   frame with a visible focus mark at every stop; where focus goes when the assistant opens and
   closes; and the contrast of the meaning colours on the cards and in their badges. The assistant
   states that write a conversation are in e2e/a11y-assistant.spec.ts (run on their own). */
import { readFileSync } from "node:fs";
import path from "node:path";

import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { axe, AXE_MOTION_OR_REDUCED, show } from "./axe";
import { newest, sample } from "./support";

const RUN = newest().uid;
/** A run whose stand-in report is signed off, so its files are offered (e2e/core-api-stub.mjs). */
const REPORTED = sample().find((a) => a.status === "Completed")!.uid;
test.describe("axe", () => {
  test.use(AXE_MOTION_OR_REDUCED);

  const PAGES: [string, string][] = [
    ["overview", "/"],
    ["one run's overview", `/assessments/${RUN}`],
    ["findings", "/findings"],
    ["one finding", `/findings/${RUN}?finding=F-001`],
    ["reports", `/reports/${REPORTED}`],
    ["every run's report", "/reports"],
    ["assessments", "/assessments"],
    ["assistant", "/assistant"],
  ];
  for (const [name, url] of PAGES) {
    test(`the ${name} has no violations`, async ({ page }) => {
      await show(page, url);
      await axe(page, name);
    });
  }

  // the panel opened, with a run open
  test("the assessment switcher has no violations", async ({ page }) => {
    await show(page, `/assessments/${RUN}`);
    await page.getByRole("button", { name: "Choose an assessment" }).click();
    await expect(page.locator('[role="dialog"] a[aria-current="true"]')).toBeVisible();
    await axe(page, "the assessment switcher");
  });

});

/* More states, each one axe pass: the docs, the search open, the Report view with a refused
   download, a Findings list with no match and a finding's detail on a phone, the
   sign-in page, a 404, and the phone widths. */

test.describe("axe, more states", () => {
  test.use(AXE_MOTION_OR_REDUCED);

  test("the docs index has no violations", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await axe(page, "docs index");
  });

  test("the Commands page, every command in place, has no violations", async ({ page }) => {
    await page.goto("/docs/commands#model");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Commands");
    await expect(page.locator("h2#model")).toBeInViewport();
    await axe(page, "commands page");
  });

  test("the docs search, open with results, has no violations", async ({ page }) => {
    await page.goto("/docs/commands");
    await page.getByRole("combobox", { name: "Search this section" }).fill("model");
    await expect(page.getByRole("listbox", { name: "Search results" }).getByRole("option").first()).toBeVisible();
    await axe(page, "docs search open");
  });

  test("the Reports view with a refused download (an alert) has no violations", async ({ page }) => {
    await show(page, `/reports/${REPORTED}`);
    await page.route("**/api/core-reports/*/download?format=PDF", (route) =>
      route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "REPORT_FILE_CHANGED", message: "Stubbed refusal." }) }),
    );
    // the PDF chip asks for the signed-off version's file
    await page.getByRole("navigation", { name: "Download the report" }).getByRole("button", { name: "PDF", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Stubbed refusal." })).toBeVisible();
    await axe(page, "reports error alert");
  });

  test("a Findings list with no match has no violations", async ({ page }) => {
    await show(page, "/findings?q=no-such-finding-zzz");
    await expect(page.getByText("No finding matches these filters.")).toBeVisible();
    await axe(page, "findings no match");
  });

  test("a run with no findings (the empty Findings view) has no violations", async ({ page }) => {
    await show(page, `/findings/${"20261001-083000-2265_RCX-001"}`);
    await expect(page.locator("main > :not([hidden])").getByText("No findings in this assessment yet.")).toBeVisible();
    await axe(page, "findings empty");
  });


  test("a 404 has no violations", async ({ page }) => {
    const res = await page.goto("/no-such-page");
    expect(res!.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Open the dashboard" })).toBeVisible();
    await axe(page, "404");
  });

  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test("the sign-in page has no violations", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByText("Open your sign-in link")).toBeVisible();
      await axe(page, "login");
    });
  });

  test.describe("on a phone (390×844)", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    for (const [name, url] of [
      ["overview", "/"],
      ["findings list", "/findings"],
      ["assessments", "/assessments"],
      ["reports", "/reports"],
    ] as const) {
      test(`the ${name} has no violations`, async ({ page }) => {
        await show(page, url);
        await axe(page, `phone ${name}`);
      });
    }

    test("a finding's detail has no violations", async ({ page }) => {
      await show(page, "/findings");
      await page.getByRole("list", { name: "Findings", exact: true }).getByRole("listitem").nth(2).locator("button").tap();
      await expect(page.getByRole("article", { name: /^Finding / })).toBeVisible();
      await axe(page, "phone finding detail");
    });

    test("the docs menu, open, has no violations", async ({ page }) => {
      await page.goto("/docs/commands#provider"); // a part with a code block that scrolls sideways
      await page.getByRole("button", { name: "Docs menu" }).click();
      await expect(page.getByRole("navigation", { name: "Documentation", exact: true })).toBeVisible();
      await axe(page, "phone docs menu");
    });
  });
});

// ---- the keyboard -----------------------------------------------------------------------------

type Stop = { name: string; region: string; marked: boolean; seen: boolean };

/** Tab from the top of the page; for each stop: where it is, and whether focusing it visibly
    changes it or one of its three nearest ancestors (an outline, a ring, a border, a fill). */
async function tabStops(page: Page, count: number): Promise<Stop[]> {
  // no transitions or loops: a computed style must be the state's own, not a frame on the way there
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: Stop[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const chain = [el, el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement].filter(
        (n): n is HTMLElement => !!n,
      );
      const look = () =>
        chain
          .map((n) => {
            const s = getComputedStyle(n);
            return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join(";");
          })
          .join("|");
      const focused = look();
      el.blur();
      const blurred = look();
      el.focus(); // the last input was a key, so this still counts as :focus-visible
      const r = el.getBoundingClientRect();
      const region = el.closest("aside")
        ? "sidebar"
        : el.closest(".dash-topbar")
          ? "top bar"
          : el.closest("main")
            ? "content"
            : el.closest(".dash-assistant-stage")
              ? "assistant"
              : "elsewhere";
      return {
        name: el.getAttribute("aria-label") || el.textContent!.trim().slice(0, 40) || el.tagName,
        region,
        marked: focused !== blurred,
        seen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
      };
    });
    if (!stop) break;
    stops.push(stop);
  }
  return stops;
}

test.describe("the keyboard", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

  for (const [name, url] of [
    ["overview", "/"],
    ["findings", "/findings"],
    ["reports", `/reports/${REPORTED}`],
    ["every run's report", "/reports"],
    ["assessments", "/assessments"],
  ]) {
    test(`Tab walks the ${name} sidebar → top bar → view, each stop visibly marked`, async ({ page }) => {
      await show(page, url);
      const stops = await tabStops(page, 30);
      const order = ["sidebar", "top bar", "content"];
      const regions = stops.map((s) => order.indexOf(s.region));
      expect(regions.every((r) => r >= 0), `stops outside the frame: ${JSON.stringify(stops.filter((s) => !order.includes(s.region)))}`).toBe(true);
      expect(regions, "the order goes back on itself").toEqual([...regions].sort((a, b) => a - b));
      // no logo link first: the rail starts with its views
      expect(stops.filter((s) => s.region === "sidebar").map((s) => s.name).slice(0, 2)).toEqual(["Overview", "AI Assistant"]);
      expect(stops.some((s) => s.region === "content"), "Tab reaches the view").toBe(true);
      expect(stops.filter((s) => !s.marked).map((s) => s.name), "stops with no visible focus").toEqual([]);
      expect(stops.filter((s) => !s.seen).map((s) => s.name), "stops off screen").toEqual([]);
    });
  }
});

test.describe("focus and the assistant", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("opening puts focus in the composer, Back returns it to the sidebar, and Tab never lands under the assistant", async ({ page }) => {
    await show(page, "/");
    const ai = page.locator('nav[aria-label="Views"] button[aria-label="AI Assistant"]');
    await ai.focus();
    await page.keyboard.press("Enter");
    const composer = page.getByRole("textbox", { name: /^Ask about/ }).last();
    await expect(composer).toBeFocused({ timeout: 5000 }); // after the 1.6 s open
    const stops = await tabStops(page, 25);
    expect(stops.filter((s) => s.region === "top bar" || s.region === "content").map((s) => s.name), "focus went under the assistant").toEqual([]);
    expect(stops.filter((s) => !s.marked).map((s) => s.name), "stops with no visible focus").toEqual([]);

    await page.getByRole("button", { name: "Back to the dashboard" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(/\/assistant(\/[^/?]+)?(\?|$)/);
    await expect(ai).toBeFocused({ timeout: 5000 });
  });

  /* Under reduced motion the intro must not leave an inline `visibility: visible` on the top bar's
     pieces (it would beat the `hidden` the open assistant puts on the top bar). */
  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("Tab never lands under the assistant", async ({ page }) => {
      await show(page, "/assistant");
      const stops = await tabStops(page, 25);
      expect(stops.filter((s) => s.region === "top bar" || s.region === "content").map((s) => s.name)).toEqual([]);
    });
  });
});

// ---- contrast of the meaning colours ----------------------------------------------------------

const TOKENS = Object.fromEntries(
  [...readFileSync(path.join(__dirname, "..", "src", "styles", "tokens.css"), "utf8").matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [m[1], m[2]]),
);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** A badge's fill: its colour at 13% over the surface it sits on (status-badge.tsx). */
const tint = (c: number[], under: number[], share = 0.13) => c.map((v, i) => share * v + (1 - share) * under[i]);

test("the meaning colours read at 4.5:1 on the cards, the page and inside their own badges", () => {
  const colours = ["primary", "success", "warning", "danger", "info", "sev-critical", "sev-high", "sev-medium", "sev-low"];
  const grounds = ["card", "card-2", "background", "surface"]; // a card's gradient runs --card → --card-2; a row's tile is --surface
  const low: string[] = [];
  for (const name of colours) {
    expect(TOKENS[name], `--${name} is a token`).toMatch(/^#/);
    for (const g of grounds) {
      const [fg, bg] = [rgb(TOKENS[name]), rgb(TOKENS[g])];
      const plain = contrast(fg, bg);
      const badge = contrast(fg, tint(fg, bg));
      if (plain < 4.5) low.push(`--${name} on --${g}: ${plain.toFixed(2)}`);
      if (badge < 4.5) low.push(`--${name} badge on --${g}: ${badge.toFixed(2)}`);
    }
  }
  expect(low).toEqual([]);
});
