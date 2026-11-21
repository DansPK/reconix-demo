/* The AI Assistant: both entries open the same screen without a reload, the history entry and
   the shared draft; the terminal's mark (◆) in the header and beside each answer, lit while one
   is written; answers streamed by the stand-in model (e2e/llm-stub.mjs) with the cards the
   server built from the sample data; conversations the dashboard's server keeps (they survive
   a reload and a new browser; open, rename, delete); Markdown with Copy; Stop and "New
   messages"; Retry; an answer with nothing in it; the composer and its model picker (the chip
   naming the seeded stand-in, "Stub", no Model button in the header and no Environment
   anywhere; the list of every saved model with its search and + Model; Set the provider's
   tiles: Custom at the stand-in, Test again, stub-model-2 added to Stub and asked with; a new
   provider saved unused by Test connection and made active by Add model; a one-click switch
   back; the provider in use kept, another removed after a confirm; cloud providers usable by
   default (each with where the questions go); the Core API's refusal kept on the form; no model
   at all; Escape, Back and Cancel (a tested provider never added goes too); a typed API key never in the markup and gone with the form, with another
   provider, and with the picker when the Assistant is left by keyboard or by Back); no roles:
   signed in, the chip, History and Security knowledge are all there; and the routes' locks (the
   old "environment" refused). The web reads no
   model from its environment: e2e/global-setup.ts saves the stand-in (e2e/models.ts).
   The chat panel holds still (text never moves), but the welcome's globe and the sidebar's icon
   breathe, so this project runs with reduced motion (playwright.config.ts; the motion itself is
   tested in motion.spec.ts) and clicks need no `force`. The
   stand-in model changes its answer only for explicit [stub:…] tokens. Conversations go to a
   test folder, and the e2e server allows more questions a minute (playwright.config.ts). */
import { type BrowserContext, type Locator, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { LLM_PORT, PORT } from "../playwright.config";
import { clearModels, seedModels, STUB_URL } from "./models";
import { counted, newest, runsWithFindings, sample, signIn, signInFresh } from "./support";

const ORIGIN = `http://127.0.0.1:${PORT}`;
const tab = (page: Page) => page.locator('nav[aria-label="Views"] button[aria-label="AI Assistant"]');
const composer = (page: Page) => page.getByRole("textbox", { name: /^Ask about/ }).last();
const log = (page: Page) => page.getByRole("log", { name: "Conversation" });
const minimize = (page: Page) => page.getByRole("button", { name: "Back to the dashboard" }).click();
const assistantShown = (page: Page) => expect(page.getByRole("heading", { name: "Reconix AI Assistant", level: 1 })).toBeVisible();
const history = (page: Page) => page.getByRole("dialog", { name: "Conversation history" });
const header = (page: Page) => page.locator("header", { hasText: "Reconix AI Assistant" });
const openHistory = async (page: Page) => {
  await page.getByRole("button", { name: /^History/ }).click();
  await expect(history(page)).toBeVisible();
};
const ask = async (page: Page, question: string) => {
  await expect(log(page)).toHaveAttribute("aria-busy", "false"); // the last answer has ended
  await composer(page).fill(question);
  await composer(page).press("Enter");
};
/** Starts from no saved conversations (the folder outlives a run). */
const forgetAll = async (page: Page) => {
  const res = await page.request.delete("/api/assistant/conversations", { headers: { Origin: ORIGIN } });
  expect(res.status()).toBe(200);
};
/** The Reconix mark's colours as drawn (tile, diamond) and the tokens it should use, resolved the
    same way (ui/reconix-mark.tsx: --surface and --globe-glow, the TUI's cyan). */
const markColours = (svg: SVGElement | HTMLElement) => {
  const resolve = (token: string) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  };
  return {
    tile: getComputedStyle(svg.querySelector("rect")!).fill,
    diamond: getComputedStyle(svg.querySelector("path")!).fill,
    surface: resolve("--surface"),
    cyan: resolve("--globe-glow"),
  };
};
/** The composer's model chip: "Model: <name> (<provider>, local|remote)", or "Choose a model". */
const chip = (page: Page) => page.locator(".ai-composer").getByRole("button", { name: /^(Model: |Choose a model$)/ });
/** The model picker, named after its step ("Model", or "Set the provider"). */
const picker = (page: Page, step: string) => page.getByRole("dialog", { name: step, exact: true });
/** The list of your models in the picker. */
const yours = (page: Page) => picker(page, "Model").getByRole("list", { name: "Your models" });
/** An API key typed in the picker (the stand-in model takes none: it only has to be typed). */
const KEY = "sk-e2e-picker-key-0123456789abcdef";

test("the Ask bar and the sidebar open the same assistant in place, and Back returns", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => ((window as unknown as { kept: number }).kept = 7)); // gone after a reload
  await page.locator(".dash-askbar").click({ position: { x: 240, y: 60 } });
  await expect(page).toHaveURL(/\/assistant(\/[^/?]+)?(\?|$)/);
  await assistantShown(page);
  await expect(tab(page)).toHaveAttribute("data-active", "true");
  await composer(page).fill("a draft for later");

  await minimize(page);
  await expect(page).not.toHaveURL(/\/assistant(\/[^/?]+)?(\?|$)/);
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  await expect(page.locator(".dash-askbar input")).toHaveValue("a draft for later"); // one draft

  await tab(page).click();
  await assistantShown(page);
  await expect(composer(page)).toHaveValue("a draft for later");
  await page.goBack();
  await expect(page).not.toHaveURL(/\/assistant(\/[^/?]+)?(\?|$)/);
  await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  await page.goForward();
  await assistantShown(page);
  expect(await page.evaluate(() => (window as unknown as { kept?: number }).kept)).toBe(7); // never reloaded
});

test("opening it again while it is open adds no history entry", async ({ page }) => {
  await signIn(page);
  const before = await page.evaluate(() => history.length);
  await tab(page).click();
  await assistantShown(page);
  await tab(page).click(); // already open: nothing is pushed
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the welcome suggests from the real data, leaves a slot for the globe, and needs no motion", async ({ page }) => {
    await page.goto("/assistant");
    await expect(page).toHaveURL(/\/assistant$/);
    await assistantShown(page);
    // the header's logo is the terminal's: the cyan ◆ on its dark tile, beside the name (so hidden)
    const logo = header(page).locator("[data-reconix-mark]");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(await logo.boundingBox()).toMatchObject({ width: 26, height: 26 });
    const colours = await logo.evaluate(markColours);
    expect(colours.tile).toBe(colours.surface);
    expect(colours.diamond).toBe(colours.cyan);
    expect(colours.cyan).toBe("rgb(34, 211, 238)"); // #22D3EE, the TUI's CYAN
    await expect(logo).toHaveCSS("animation-name", "none");
    const all = sample();
    const suggestions = page.getByRole("list", { name: "Suggested questions" });
    await expect(suggestions.getByRole("button")).toHaveCount(6); // one run waits: the approvals suggestion is there
    await expect(suggestions).toContainText(`${all.reduce((n, a) => n + counted(a).length, 0)} findings`);
    await expect(suggestions).toContainText(`${all.filter((a) => a.status === "Completed").length} of ${all.length} runs completed`);
    await expect(page.locator("[data-globe-slot]")).toHaveCount(1);
    await expect(page.locator("[data-assistant-piece]")).toHaveCount(3);
    const animation = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);
    expect(await animation(".dash-assistant-panel")).toBe("none");
    expect(await animation(".dash-ai-icon")).toBe("none");
    await minimize(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
  });

  test("a conversation is kept by the server: cards from the saved data, a reload, a new browser, rename and delete", async ({ page, browser }) => {
    await signIn(page);
    await forgetAll(page);
    await page.goto("/assistant");
    // a suggestion asks, the findings card comes from the sample data, then the model's text
    await page.getByRole("button", { name: /Analyze current findings/ }).click();
    const findings = log(page).getByRole("region", { name: "Findings" });
    await expect(findings).toBeVisible();
    const total = sample().reduce((n, a) => n + counted(a).length, 0);
    await expect(findings).toContainText(`${total} across ${runsWithFindings().length} runs`);
    await expect(findings).toContainText("Saved data");
    await expect(log(page)).toContainText(`Stub answer: I saw ${sample().length} runs. Earlier turns: 0. You asked: Analyze the current findings`);
    // a follow-up gets the first turn back from the server's file, not from the page
    await ask(page, "What waits on my approval?");
    await expect(log(page)).toContainText("Earlier turns: 2. You asked: What waits on my approval?");
    const approvals = log(page).getByRole("region", { name: "Approvals" });
    await expect(approvals).toContainText("1 waiting for you");
    await expect(approvals).toContainText("Waiting for approval");
    await expect(approvals).toContainText("Nothing can be approved from this chat.");
    await expect(approvals.getByRole("button", { name: /approve/i })).toHaveCount(0);
    // each answer sits beside the mark (hidden: "Reconix AI:" names it), still once it is written
    await expect(log(page)).toHaveAttribute("aria-busy", "false");
    const avatars = log(page).locator(".ai-row-assistant > [data-reconix-mark]");
    await expect(avatars).toHaveCount(2);
    for (const avatar of await avatars.all()) {
      await expect(avatar).toHaveAttribute("aria-hidden", "true");
      expect(await avatar.boundingBox()).toMatchObject({ width: 26, height: 26 });
      const colours = await avatar.evaluate(markColours);
      expect([colours.tile, colours.diamond]).toEqual([colours.surface, colours.cyan]);
    }
    await expect(log(page).locator("[data-reconix-mark][data-live]")).toHaveCount(0);

    // the tab keeps only which conversation is open and the draft, never the messages
    await composer(page).fill("not sent token=abc123secret");
    const stored = () => page.evaluate(() => ({ v1: sessionStorage.getItem("reconix.assistant.v1"), v2: sessionStorage.getItem("reconix.assistant.v2") ?? "" }));
    await expect.poll(async () => (await stored()).v2).toContain("not sent token=");
    const { v1, v2 } = await stored();
    expect(v1).toBeNull();
    const kept = JSON.parse(v2) as Record<string, unknown>;
    expect(Object.keys(kept).sort()).toEqual(["draft", "openId", "pageUid"]);
    expect(String(kept.draft)).not.toContain("abc123secret");
    expect(v2).not.toContain("Stub answer");

    await page.reload();
    await expect(log(page)).toContainText("You asked: What waits on my approval?");
    await expect(log(page).getByRole("region", { name: "Findings" })).toBeVisible(); // the cards were saved too

    // a new browser (nothing in its storage), signed in again, finds it in History
    const other: BrowserContext = await browser.newContext({ reducedMotion: "reduce", storageState: { cookies: [], origins: [] } });
    const again = await other.newPage();
    await signInFresh(again);
    await again.goto("/assistant");
    await expect(log(again)).not.toContainText("Stub answer");
    await openHistory(again);
    await history(again).getByRole("button", { name: /^Analyze the current findings/ }).click();
    await expect(log(again)).toContainText("You asked: What waits on my approval?");
    await expect(header(again)).toContainText("All assessments");

    // no rename (the Core API keeps no titles, so the route refuses a PATCH), then delete
    await openHistory(again);
    await expect(history(again).getByRole("button", { name: /^Rename/ })).toHaveCount(0);
    const conversationId = (await (await again.request.get("/api/assistant/conversations")).json()).conversations[0].id as string;
    const renamed = await again.request.patch(`/api/assistant/conversations/${conversationId}`, { headers: { Origin: ORIGIN }, data: { title: "Triage of every run" } });
    expect(renamed.status()).toBe(405);
    await expect(history(again).getByRole("button", { name: /^Analyze the current findings/ })).toBeVisible();
    await history(again).getByRole("button", { name: "Delete “Analyze the current findings”" }).click();
    await history(again).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(history(again)).toContainText("No saved conversations yet");
    await expect(log(again)).not.toContainText("Stub answer"); // the open one was deleted: a new chat
    await other.close();
    expect((await page.request.get("/api/assistant/conversations")).ok()).toBe(true);
    expect((await (await page.request.get("/api/assistant/conversations")).json()).conversations).toEqual([]);
  });

  test("one open run is what a conversation is about, and stays about", async ({ page }) => {
    await signIn(page);
    const run = newest();
    await page.goto(`/assistant/${run.uid}`);
    await expect(header(page)).toContainText(run.label);
    await expect(header(page)).toContainText("Waiting for you"); // its status as a badge
    await page.getByRole("button", { name: /Review assessment progress/ }).click();
    await expect(log(page)).toContainText("I saw 1 runs");
    const progress = log(page).getByRole("region", { name: "Assessment progress" });
    await expect(progress.getByRole("listitem")).toHaveCount(5);
    await expect(progress).toContainText("Running");
    await expect(progress).toContainText("Planned");
    // the dashboard moves to every run: the next question starts a new conversation about it
    await page.goto("/assistant");
    await expect(header(page)).toContainText("All assessments");
    await expect(log(page)).not.toContainText("Stub answer");
  });

  test("Markdown tables and code with Copy, a long answer, New messages and Stop", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    await page.goto("/assistant");
    await ask(page, "Show the findings as a table [stub:markdown]");
    const table = log(page).getByRole("region", { name: "Table" });
    await expect(table.getByRole("columnheader", { name: "Severity" })).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(3);
    expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true); // it scrolls sideways
    const code = log(page).getByRole("figure").filter({ hasText: "bash" });
    await code.getByRole("button", { name: "Copy the bash code" }).click();
    await expect(code.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("curl -s 'https://staging.example.com/api/v1/orders");

    await ask(page, "Give me the whole story [stub:long]");
    await expect(log(page)).toContainText("Paragraph 6");
    const down = page.getByRole("button", { name: /scroll to the latest/i }); // "New messages" while text still comes
    await expect(down).toBeHidden(); // following the text at the bottom
    await log(page).evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(down).toBeVisible();
    await down.click();
    await expect(down).toBeHidden();
    // the reply being written has a lit mark: with reduced motion a still glow, no loop
    const live = log(page).locator(".ai-row-assistant").last().locator("[data-reconix-mark][data-live]");
    await expect(live).toHaveCount(1);
    await expect(live).toHaveCSS("animation-name", "none");
    await expect(live).toHaveCSS("filter", /drop-shadow/);
    await page.getByRole("button", { name: "Stop the answer" }).click();
    await expect(log(page).getByText("Stopped")).toBeVisible();
    await expect(log(page).locator("[data-reconix-mark][data-live]")).toHaveCount(0); // stopped: still
    await expect(log(page)).not.toContainText("The end of the long answer");
    // Stop only stops the page reading: the Core API carries on with the answer and saves it
    // when the model ends (services/chat.py), so a reload meanwhile says it is still being written
    await page.reload();
    await expect(log(page)).toContainText("Give me the whole story [stub:long]");
    await expect(log(page)).toContainText("The answer is still being written. Open this chat again in a moment.");
    await expect(log(page)).not.toContainText("Paragraph 6"); // nothing half-written was saved

    // Delete all asks first
    await openHistory(page);
    await history(page).getByRole("button", { name: "Delete all", exact: true }).click();
    await history(page).getByRole("button", { name: "Delete all conversations" }).click();
    await expect(history(page)).toContainText("No saved conversations yet");
    await expect(log(page)).not.toContainText("Paragraph 6");
  });

  test("approvals and planning stay in the TUI: guidance only, never a plan or a button", async ({ page }) => {
    await page.goto("/assistant");
    await page.getByRole("button", { name: /Plan a security assessment/ }).click();
    const plan = log(page).getByRole("region", { name: "Plan a new assessment in the TUI" });
    await expect(plan).toContainText("no plan has been made");
    await expect(plan).toContainText("reconix");
    await expect(plan.getByRole("button")).toHaveCount(0); // no Open Terminal: there is no web terminal
    await expect(log(page)).toContainText("You asked: Plan a security assessment");
    await ask(page, "Explain the top finding");
    const top = log(page).getByRole("region", { name: /^Finding / });
    await expect(top).toContainText("CVSS");
    await top.getByRole("link", { name: /in Findings$/ }).click();
    await expect(page).toHaveURL(/\/findings(\/[^/?]+)?\?/);
    await expect(page).toHaveURL(/finding=/);
    await expect(page.getByRole("heading", { name: "Findings", level: 1 })).toBeVisible();
    await tab(page).click();
    // a card link to another run opens it, and the conversation stays (it says it is about
    // every run while the dashboard shows that one)
    await ask(page, "Generate a report");
    const report = log(page).getByRole("region", { name: "Report" });
    await report.getByRole("button", { name: /RCX-DEMO-002/ }).first().click();
    await report.getByRole("link", { name: /^Open the Reports view of RCX-DEMO-002/ }).click();
    await expect(page).toHaveURL(/\/reports\/\d{8}-\d{6}-[0-9a-f]{4}_RCX-DEMO-002$/);
    await tab(page).click();
    await expect(log(page)).toContainText("You asked: Generate a report");
    await expect(log(page)).toContainText("You asked: Plan a security assessment");
    await expect(page.getByText(/This conversation is about All assessments/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Terminal" })).toHaveCount(0);
  });
});

test.describe("when the model fails", () => {
  test.use({ reducedMotion: "reduce" });

  test("an answer with nothing in it is said plainly, with Retry, and after a reload is a question left unanswered", async ({ page }) => {
    await page.goto("/assistant");
    await ask(page, "Say nothing at all [stub:empty]");
    const empty = log(page).getByRole("region", { name: "The model returned nothing" });
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("Try asking again");
    await expect(log(page).getByRole("region", { name: "The assistant couldn't answer" })).toHaveCount(0);
    await expect(log(page)).toHaveAttribute("aria-busy", "false");
    await empty.getByRole("button", { name: "Retry" }).click(); // the stub answers nothing again
    await expect(log(page).getByRole("region", { name: "The model returned nothing" })).toBeVisible();
    await expect(log(page).locator(".ai-bubble")).toHaveCount(1); // replaced, not kept twice
    // the Core API saves no empty answer (EMPTY_RESPONSE ends the ask), so a reload finds the
    // question without one: still offered again, once
    await page.reload();
    const unanswered = log(page).getByRole("region", { name: "The assistant couldn't answer" });
    await expect(unanswered).toContainText("No answer was saved for this question.");
    await expect(unanswered.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(log(page).locator(".ai-bubble")).toHaveCount(1);
    // a question with cards gets them; the empty text under them is "no explanation", with Retry
    await ask(page, "Analyze the findings [stub:empty]");
    await expect(log(page).getByRole("region", { name: "Findings" })).toBeVisible();
    const none = log(page).getByRole("region", { name: "The model added no explanation" });
    await expect(none).toBeVisible();
    await expect(none.getByRole("button", { name: "Retry" })).toBeVisible();
    // (the reloaded question above keeps its own "couldn't answer"; this reply is not one)
    await expect(log(page).locator(".ai-row-assistant").last().getByRole("region", { name: "The assistant couldn't answer" })).toHaveCount(0);
  });

  test("the reply says why, keeps its cards, and Retry replaces the failed turn", async ({ page }) => {
    await page.goto("/assistant");
    await ask(page, "Summarize the findings [stub:fail]");
    const failed = log(page).getByRole("region", { name: "The assistant couldn't answer" });
    await expect(failed).toContainText("The model did not answer."); // the Core API's words (MODEL_UNAVAILABLE)
    await expect(log(page).getByRole("region", { name: "Findings" })).toBeVisible(); // the cards still came
    await failed.getByRole("button", { name: "Retry" }).click();
    // the Core API kept the failed question in the session, so the model sees it as one earlier turn
    await expect(log(page)).toContainText("Earlier turns: 1. You asked: Summarize the findings [stub:fail]");
    await expect(failed).toHaveCount(0);
    await page.reload();
    await expect(log(page)).toContainText("You asked: Summarize the findings [stub:fail]");
    await expect(log(page).locator(".ai-bubble")).toHaveCount(1); // replaced, not kept twice
    await expect(log(page).getByRole("region", { name: "The assistant couldn't answer" })).toHaveCount(0);
  });
});

test.describe("the composer and its model picker", () => {
  test.use({ reducedMotion: "reduce" });
  // each starts from, and leaves, the seeded stand-in only: the other specs ask its stub-model
  test.beforeEach(({ request }) => seedModels(request));
  test.afterEach(({ request }) => seedModels(request));

  type Saved = { providers: { id: string; name: string; preset: string; models: string[] }[]; active: { providerId: string; model: string } | null };
  /** What the dashboard's server says is saved (read from the Core API's stand-in). */
  const savedModels = async (page: Page) => (await (await page.request.get("/api/assistant/models")).json()) as Saved;
  /** Opens Set the provider from the list (+ Model). */
  const openForm = async (page: Page) => {
    await chip(page).click();
    await picker(page, "Model").getByRole("button", { name: "+ Model" }).click();
    return picker(page, "Set the provider");
  };
  /** A provider's tile in Set the provider (a radio: "Custom OpenAI-compatible (set up)" once saved). */
  const tile = (form: Locator, name: string) => form.getByRole("radiogroup", { name: "Provider" }).getByRole("radio", { name: new RegExp(`^${name}( \\(set up\\))?$`) });
  /** Where Set the provider's connection stands (its status line). */
  const connection = (form: Locator) => form.getByRole("status");
  /** The Model choice Test connection lists (a radio group of the provider's models). */
  const modelChoice = (form: Locator) => form.getByRole("radiogroup", { name: "Model" });

  test("the composer: the chip names the seeded model in green, the header has no Model button", async ({ page }) => {
    await page.goto("/assistant");
    await assistantShown(page);
    await expect(header(page).getByRole("button", { name: /^Model/ })).toHaveCount(0);
    await expect(chip(page)).toHaveAccessibleName("Model: stub-model (Stub, local)");
    await expect(chip(page)).toHaveText("stub-model");
    await expect(chip(page)).toHaveAttribute("data-tone", "success");
    await expect(chip(page).locator(".ai-dot")).toHaveAttribute("data-tone", "success");
    await expect(chip(page)).toHaveAttribute("aria-expanded", "false");
    // the box: the text area on top, the chip bottom left, the hint and the send button on the right
    await expect(composer(page)).toHaveAttribute("placeholder", "Ask anything about your assessments…");
    const box = page.locator(".ai-composer");
    await expect(box.getByText("Enter to send · Shift+Enter new line")).toBeVisible();
    await expect(box.getByRole("button", { name: "Send" })).toBeVisible();
    const [field, chipBox, send] = await Promise.all([composer(page).boundingBox(), chip(page).boundingBox(), box.getByRole("button", { name: "Send" }).boundingBox()]);
    expect(chipBox!.y).toBeGreaterThan(field!.y + field!.height - 2); // under the text area
    expect(send!.x).toBeGreaterThan(chipBox!.x + chipBox!.width); // to its right
    expect(Math.round(send!.width)).toBe(32);
    await expect(page.getByText("Answers use your saved assessment data. Scans and approvals stay in the terminal.")).toBeVisible();
  });

  test("the list: every saved model, the seeded one checked, search first, + Model at the bottom, no Environment anywhere", async ({ page }) => {
    await page.goto("/assistant");
    await chip(page).click();
    const pick = picker(page, "Model");
    await expect(pick).toBeVisible();
    await expect(chip(page)).toHaveAttribute("aria-expanded", "true");
    // Models | Providers, on Models; the search field is the step's first control
    await expect(pick.getByRole("tablist", { name: "Show" }).getByRole("tab", { name: /^Models/ })).toHaveAttribute("aria-selected", "true");
    const search = pick.getByRole("searchbox", { name: "Search your models" });
    await expect(search).toBeFocused();
    // every model of every saved provider: the stand-in lists two (GET /v1/models), stub-model is the active one
    const rows = yours(page);
    await expect(rows.getByRole("listitem")).toHaveCount(2);
    const stub = rows.getByRole("button", { name: "stub-model Stub local", exact: true });
    const stub2 = rows.getByRole("button", { name: "stub-model-2 Stub local", exact: true });
    await expect(stub).toHaveAttribute("aria-current", "true");
    await expect(stub2).not.toHaveAttribute("aria-current", /.*/);
    await expect(rows.getByRole("button", { name: /^Remove/ })).toHaveCount(0); // removing is a provider's, on its page
    const add = pick.getByRole("button", { name: "+ Model" });
    const [addBox, lastBox] = await Promise.all([add.boundingBox(), stub2.boundingBox()]);
    expect(addBox!.y).toBeGreaterThan(lastBox!.y + lastBox!.height); // at the bottom
    // only your models here (the providers are behind the other tab), and nothing of an Environment model
    await expect(pick.getByText(/OpenAI|Anthropic|Ollama/)).toHaveCount(0);
    await expect(pick.getByText(/environment/i)).toHaveCount(0);
    await expect(page.locator(".ai-composer-area").getByText(/environment/i)).toHaveCount(0);
    expect(await (await page.request.get("/api/assistant/models")).text()).not.toContain("nvironment");
    // the search narrows by any part of the name, and says when nothing matches
    await search.fill("model-2");
    await expect(rows.getByRole("listitem")).toHaveCount(1);
    await expect(stub2).toBeVisible();
    await search.fill("no-such-model");
    await expect(pick.getByText("No model matches “no-such-model”.")).toBeVisible();
    await search.fill("");
    await expect(rows.getByRole("listitem")).toHaveCount(2);
    // Down moves from the search into the list (onto the checked one), the arrow keys move in it, wrapping
    await page.keyboard.press("ArrowDown");
    await expect(stub).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(stub2).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(stub).toBeFocused();
    await page.keyboard.press("Enter"); // the checked one: just closes
    await expect(pick).toBeHidden();
    await expect(chip(page)).toBeFocused();
    expect((await savedModels(page)).active).toMatchObject({ model: "stub-model" }); // nothing changed
  });

  test("+ Model: Custom at the stand-in, Test again, stub-model-2, Add model, ask with it; one click back; the one in use is kept", async ({ page }) => {
    await page.goto("/assistant");
    await page.evaluate(() => ((window as unknown as { kept: number }).kept = 3));
    const form = await openForm(page);
    // the provider tiles: Reconix (the default) chosen and focused; the arrow keys move and choose, wrapping
    await expect(tile(form, "Reconix \\(default\\)")).toBeFocused();
    await expect(tile(form, "Reconix \\(default\\)")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowLeft");
    const custom = tile(form, "Custom OpenAI-compatible");
    await expect(custom).toBeFocused();
    await expect(custom).toHaveAttribute("aria-checked", "true");
    await expect(custom).toHaveAccessibleName("Custom OpenAI-compatible (set up)"); // Stub is one
    const url = form.getByLabel("Base URL", { exact: true });
    await expect(url).toHaveValue("");
    await expect(form.getByLabel("API key", { exact: true })).toHaveAttribute("type", "password");
    await expect(form.getByLabel("API key", { exact: true })).toHaveAttribute("placeholder", "Optional");
    await expect(modelChoice(form)).toHaveCount(0); // no model before a test
    await form.getByRole("button", { name: "Test connection" }).click();
    await expect(form.getByRole("alert")).toHaveText("Give the base URL (it usually ends in /v1)."); // asked first, nothing sent
    await url.fill(STUB_URL);

    // the stand-in's address is Stub's: its models show at once, on its active one; Test again asks it
    await expect(form.getByText("Saved as Stub: Add model switches it to the chosen model.")).toBeVisible();
    await expect(connection(form)).toHaveText("Stub is saved but not tested here yet: Test again checks that it answers.");
    await form.getByRole("button", { name: "Test again" }).click();
    await expect(connection(form)).toHaveText("Connected: 2 models found.");
    const choices = modelChoice(form).getByRole("radio");
    await expect(choices).toHaveText(["stub-model", "stub-model-2"]);
    await expect(modelChoice(form).getByRole("radio", { name: "stub-model", exact: true })).toHaveAttribute("aria-checked", "true");
    await modelChoice(form).getByRole("radio", { name: "stub-model", exact: true }).focus();
    await page.keyboard.press("ArrowDown"); // the arrow keys choose, as native radios do
    const two = modelChoice(form).getByRole("radio", { name: "stub-model-2", exact: true });
    await expect(two).toBeFocused();
    await expect(two).toHaveAttribute("aria-checked", "true");
    await form.getByRole("button", { name: "Add model" }).click();

    // closed: the chip says the new model, focus is back on it, and the next question goes to it
    await expect(form).toBeHidden();
    await expect(chip(page)).toBeFocused();
    await expect(chip(page)).toHaveAccessibleName("Model: stub-model-2 (Stub, local)");
    await expect(chip(page)).toHaveText("stub-model-2");
    await ask(page, "Which model answers?");
    await expect(log(page)).toContainText("You asked: Which model answers? Model: stub-model-2.");
    expect(await page.evaluate(() => (window as unknown as { kept?: number }).kept)).toBe(3); // never reloaded
    const saved = await savedModels(page);
    expect(saved.providers).toEqual([expect.objectContaining({ name: "Stub", models: ["stub-model", "stub-model-2"] })]); // added to Stub, no second provider
    expect(saved.active).toEqual({ providerId: saved.providers[0].id, model: "stub-model-2" });
    await page.reload();
    await expect(chip(page)).toHaveAccessibleName("Model: stub-model-2 (Stub, local)"); // the Core API's

    // one click back to stub-model
    await chip(page).click();
    const rows = yours(page);
    await expect(rows.getByRole("listitem")).toHaveCount(2);
    await expect(rows.getByRole("button", { name: "stub-model-2 Stub local", exact: true })).toHaveAttribute("aria-current", "true");
    await rows.getByRole("button", { name: "stub-model Stub local", exact: true }).click();
    await expect(picker(page, "Model")).toBeHidden();
    await expect(chip(page)).toHaveAccessibleName("Model: stub-model (Stub, local)");
    await expect(chip(page)).toBeFocused();

    // Stub answers, so it can't be removed: its page says so instead of asking, and OK keeps it
    await chip(page).click();
    const pick = picker(page, "Model");
    await pick.getByRole("tab", { name: /^Providers/ }).click();
    await pick.getByRole("list", { name: "Providers" }).getByRole("button", { name: /^Custom OpenAI-compatible/ }).click();
    await expect(pick.getByRole("button", { name: "Back to providers" })).toBeFocused();
    const card = pick.getByRole("region", { name: new URL(STUB_URL).host });
    await expect(card).toContainText("in use");
    await card.getByRole("button", { name: "Remove" }).click();
    const inUse = page.getByRole("dialog", { name: "Stub is in use" });
    await expect(inUse).toContainText("It answers your questions now. Choose another model first, then you can remove it.");
    await expect(inUse.getByRole("button", { name: "OK" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(inUse).toHaveCount(0);
    await expect(pick).toBeVisible(); // only the dialog went
    await expect(card.getByRole("button", { name: "Remove" })).toBeFocused();
    expect((await savedModels(page)).providers.map((p) => p.name)).toEqual(["Stub"]);
    // what the list showed is remembered: the picker opens on Custom's page next time
    await page.keyboard.press("Escape");
    await expect(pick).toBeHidden();
    await chip(page).click();
    await expect(pick.getByRole("button", { name: "Back to providers" })).toBeVisible();
    const inCard = card.getByRole("list", { name: `${new URL(STUB_URL).host} models` }).getByRole("button", { name: "stub-model", exact: true });
    await expect(inCard).toHaveAttribute("aria-current", "true");
    await expect(inCard).toBeFocused(); // the page's first control: the model that answers
  });

  test("a new provider: Test connection saves it unused, Add model makes it active; removing it asks first", async ({ page }) => {
    await page.goto("/assistant");
    const form = await openForm(page);
    await tile(form, "Custom OpenAI-compatible").click();
    const other = `http://localhost:${LLM_PORT}/v1`; // the stand-in at another address: a new provider
    await form.getByLabel("Base URL", { exact: true }).fill(other);
    await expect(connection(form)).toHaveText("Test the connection first: it checks the provider and finds its models. Nothing is used until you add one.");
    await expect(form.getByRole("button", { name: "Add model" })).toHaveCount(0);
    await form.getByLabel("Base URL", { exact: true }).press("Enter"); // Test connection
    await expect(connection(form)).toHaveText("Connected: 2 models found.");
    // saved by the test (POST), but not used yet: Stub still answers
    let saved = await savedModels(page);
    expect(saved.providers.map((p) => p.name)).toEqual(["Stub", "Custom OpenAI-compatible"]);
    expect(saved.active).toEqual({ providerId: saved.providers[0].id, model: "stub-model" });
    await modelChoice(form).getByRole("radio", { name: "stub-model-2", exact: true }).click();
    await form.getByRole("button", { name: "Add model" }).click();
    await expect(form).toBeHidden();
    await expect(chip(page)).toHaveAccessibleName("Model: stub-model-2 (Custom OpenAI-compatible, local)");
    saved = await savedModels(page);
    expect(saved.providers.map((p) => [p.name, p.preset, [...p.models].sort()])).toEqual([
      ["Stub", "custom", ["stub-model", "stub-model-2"]],
      ["Custom OpenAI-compatible", "custom", ["stub-model", "stub-model-2"]],
    ]);
    expect(saved.active).toEqual({ providerId: saved.providers[1].id, model: "stub-model-2" });
    // the list names it by its address, beside Stub's two
    await chip(page).click();
    const host = new URL(other).host;
    await expect(yours(page).getByRole("button", { name: `stub-model-2 ${host} local`, exact: true })).toHaveAttribute("aria-current", "true");
    await expect(yours(page).getByRole("listitem")).toHaveCount(4);

    // in use: "Choose another model" goes to Models, and one click there moves off it
    const pick = picker(page, "Model");
    await pick.getByRole("tab", { name: /^Providers/ }).click();
    await pick.getByRole("list", { name: "Providers" }).getByRole("button", { name: /^Custom OpenAI-compatible/ }).click();
    const card = pick.getByRole("region", { name: host });
    await card.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog", { name: "Custom OpenAI-compatible is in use" }).getByRole("button", { name: "Choose another model" }).click();
    await expect(pick.getByRole("searchbox", { name: "Search your models" })).toBeFocused();
    await yours(page).getByRole("button", { name: "stub-model Stub local", exact: true }).click();
    await expect(chip(page)).toHaveAccessibleName("Model: stub-model (Stub, local)");

    // not in use: asked first, Cancel focused; Escape keeps it, with focus back on its Remove
    await chip(page).click();
    await pick.getByRole("tab", { name: /^Providers/ }).click();
    await pick.getByRole("list", { name: "Providers" }).getByRole("button", { name: /^Custom OpenAI-compatible/ }).click();
    await card.getByRole("button", { name: "Remove" }).click();
    const confirm = page.getByRole("dialog", { name: "Remove Custom OpenAI-compatible?" });
    await expect(confirm).toContainText("Its 2 models go with it. You can set it up again later.");
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(pick).toBeVisible(); // only the dialog went
    await expect(card.getByRole("button", { name: "Remove" })).toBeFocused();
    expect((await savedModels(page)).providers).toHaveLength(2);
    await page.keyboard.press("Enter");
    await confirm.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(card).toHaveCount(0);
    await expect(pick.getByRole("list", { name: "Providers" })).toBeVisible(); // back on Providers
    saved = await savedModels(page);
    expect(saved.providers.map((p) => p.name)).toEqual(["Stub"]); // every row of it went (DELETE)
    expect(saved.active).toEqual({ providerId: saved.providers[0].id, model: "stub-model" });
  });

  for (const [name, host] of [
    ["OpenAI", "api.openai.com"],
    ["Anthropic", "api.anthropic.com"],
    ["DeepSeek", "api.deepseek.com"],
  ] as const) {
    test(`cloud providers can be chosen, each with where the questions go: ${name}`, async ({ page }) => {
      await page.goto("/assistant");
      const form = await openForm(page);
      const tiles = form.getByRole("radiogroup", { name: "Provider" }).getByRole("radio");
      // the TUI's /provider list, in its order, every one usable (cloud allowed by default)
      const names = ["Reconix (default)", "OpenAI", "Anthropic", "DeepSeek", "Ollama", "Custom OpenAI-compatible (set up)"];
      await expect(tiles).toHaveCount(names.length);
      for (const [i, n] of names.entries()) {
        await expect(tiles.nth(i)).toHaveAccessibleName(n);
        await expect(tiles.nth(i)).toBeEnabled();
      }
      await expect(form.getByText(/LLM_ALLOW_REMOTE/)).toHaveCount(0);
      await tile(form, name).click();
      await expect(tile(form, name)).toHaveAttribute("aria-checked", "true");
      const warning = `Needs only an API key; its models are listed for you. It runs at ${host}, so the Core API sends your questions and the session data they need there.`;
      await expect(form.getByText(warning)).toBeVisible();
      await expect(form.getByRole("radiogroup", { name: "Provider" })).toHaveAccessibleDescription(warning);
      await expect(form.getByLabel("Base URL", { exact: true })).toHaveCount(0); // its address is fixed
      const key = form.getByLabel("API key", { exact: true });
      await expect(key).toBeVisible();
      await expect(key).toHaveAttribute("placeholder", `Needed by ${name}`);
      await form.getByRole("button", { name: "Test connection" }).click();
      await expect(form.getByRole("alert")).toHaveText(`${name} needs an API key.`); // asked first, nothing sent
      expect((await savedModels(page)).providers.map((p) => p.name)).toEqual(["Stub"]);
    });
  }

  test("a refusal stays on the form with the server's words", async ({ page }) => {
    await page.goto("/assistant");
    const form = await openForm(page);
    await tile(form, "Custom OpenAI-compatible").click();
    const url = form.getByLabel("Base URL", { exact: true });
    await url.fill("http://example.com/v1");
    await expect(form.getByText("Off this machine: the Core API sends your questions and the session data they need there.")).toBeVisible(); // the hint, before anything is sent
    await form.getByLabel("API key", { exact: true }).fill("sk-e2e-not-a-real-key");
    await form.getByRole("button", { name: "Test connection" }).click();
    // the Core API refuses plain http off this computer (422 PROVIDER_URL_NOT_ALLOWED), in its words
    await expect(form.getByRole("alert")).toHaveText("Plain http is only allowed to this computer; use https.");
    await expect(form.getByRole("alert")).toHaveClass(/ai-picker-refusal/);
    await expect(form).toBeVisible();
    await url.fill(`http://user:pw@127.0.0.1:${LLM_PORT}/v1`);
    await url.press("Enter"); // Test connection
    await expect(form.getByRole("alert")).toHaveText("Put the API key in the key field, not in the base URL."); // refused here: nothing sent
    await expect(form).toBeVisible();
    const saved = await savedModels(page);
    expect(saved.providers.map((p) => p.name)).toEqual(["Stub"]);
  });

  test("with no model: Choose a model in amber, the message, and an empty list with + Model", async ({ page }) => {
    await clearModels();
    await page.goto("/assistant");
    await expect(chip(page)).toHaveAccessibleName("Choose a model");
    await expect(chip(page)).toHaveAttribute("data-tone", "warning");
    await expect(page.locator("#ai-composer-reason")).toContainText("Choose a model in the model picker: the Core API answers with it.");
    await expect(composer(page)).toBeDisabled();
    await expect(composer(page)).toHaveAccessibleDescription(/^Choose a model in the model picker: the Core API answers with it\./);
    await chip(page).click();
    const pick = picker(page, "Model");
    await expect(pick.getByText("No model yet.")).toBeVisible();
    await expect(pick.getByRole("searchbox")).toHaveCount(0); // nothing to search
    await expect(pick.getByRole("button", { name: "+ Model" })).toBeFocused();
    // Choose a provider: the TUI's /provider list, none set up
    await pick.getByRole("button", { name: "Choose a provider" }).click();
    const providers = pick.getByRole("list", { name: "Providers" }).getByRole("button");
    await expect(providers).toHaveCount(6);
    await expect(providers.first()).toBeFocused();
    await expect(providers.first()).toHaveAccessibleName("Reconix (default) Not set up");
  });

  test("Escape and Back go back to the list, then Escape closes, with focus back on the chip", async ({ page }) => {
    await page.goto("/assistant");
    const form = await openForm(page);
    const pick = picker(page, "Model");
    await expect(tile(form, "Reconix \\(default\\)")).toBeFocused();
    await tile(form, "Custom OpenAI-compatible").click();
    await form.getByLabel("Base URL", { exact: true }).fill(STUB_URL);
    await page.keyboard.press("Escape");
    await expect(pick).toBeVisible();
    await expect(pick.getByRole("button", { name: "+ Model" })).toBeFocused();
    // opened again, the form starts afresh
    await page.keyboard.press("Enter");
    await expect(tile(form, "Reconix \\(default\\)")).toHaveAttribute("aria-checked", "true");
    await expect(tile(form, "Reconix \\(default\\)")).toBeFocused();
    await expect(form.getByLabel("Base URL", { exact: true })).toHaveCount(0);
    await form.getByRole("button", { name: "Back to your models" }).click();
    await expect(pick).toBeVisible();
    await pick.getByRole("button", { name: "+ Model" }).click();
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(pick).toBeVisible();
    await expect(pick.getByRole("button", { name: "+ Model" })).toBeFocused();
    // a provider Test connection saved and that was never added goes when the form does
    await page.keyboard.press("Enter");
    await tile(form, "Custom OpenAI-compatible").click();
    await form.getByLabel("Base URL", { exact: true }).fill(`http://localhost:${LLM_PORT}/v1`);
    await form.getByLabel("Base URL", { exact: true }).press("Enter"); // Test connection
    await expect(connection(form)).toHaveText("Connected: 2 models found.");
    expect((await savedModels(page)).providers).toHaveLength(2);
    await page.keyboard.press("Escape");
    await expect(pick.getByRole("button", { name: "+ Model" })).toBeFocused();
    await expect.poll(async () => (await savedModels(page)).providers.map((p) => p.name)).toEqual(["Stub"]);
    await page.keyboard.press("Escape");
    await expect(pick).toBeHidden();
    await expect(chip(page)).toBeFocused();
    await expect(chip(page)).toHaveAttribute("aria-expanded", "false");
    // a click outside closes it too
    await chip(page).click();
    await expect(pick).toBeVisible();
    await log(page).click({ position: { x: 20, y: 20 } });
    await expect(pick).toBeHidden();
  });

  test("Test connection by its button keeps focus in the form, so Escape still goes back to the list", async ({ page }) => {
    await page.goto("/assistant");
    const form = await openForm(page);
    await tile(form, "Custom OpenAI-compatible").click();
    await form.getByLabel("Base URL", { exact: true }).fill(`http://localhost:${LLM_PORT}/v1`);
    await form.getByRole("button", { name: "Test connection" }).focus();
    await page.keyboard.press("Enter");
    await expect(connection(form)).toHaveText("Connected: 2 models found.");
    // the button is replaced by Test again and Add model: focus must not fall to the page
    expect(await form.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(picker(page, "Model").getByRole("button", { name: "+ Model" })).toBeFocused();
    await expect.poll(async () => (await savedModels(page)).providers.map((p) => p.name)).toEqual(["Stub"]);
  });

  /** Opens Set the provider for Custom and types KEY in its API key field: masked, never in the markup. */
  const typeKey = async (page: Page) => {
    const form = await openForm(page);
    await tile(form, "Custom OpenAI-compatible").click();
    const key = form.getByLabel("API key", { exact: true });
    await key.pressSequentially(KEY);
    await expect(key).toHaveValue(KEY);
    await expect(key).toHaveAttribute("type", "password");
    // nothing that looks like a sign-in for a password manager to offer to save
    await expect(key).toHaveAttribute("autocomplete", "off");
    for (const flag of ["data-1p-ignore", "data-lpignore", "data-bwignore"]) await expect(key).toHaveAttribute(flag, /.*/);
    await expect(form.locator("form")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector("input[type=password]")?.getAttribute("value") ?? null)).toBeNull();
    expect(await page.evaluate((k) => document.documentElement.outerHTML.includes(k), KEY)).toBe(false);
    return form;
  };
  /** No field on the page holds KEY, as its value or in the markup, and the picker is closed. */
  const keyGone = async (page: Page) => {
    await expect(page.locator(".ai-picker")).toHaveCount(0);
    expect(await page.evaluate((k) => [...document.querySelectorAll("input")].some((i) => i.value === k) || document.documentElement.outerHTML.includes(k), KEY)).toBe(false);
  };

  test("another provider empties the key field, and so does going back to the list", async ({ page }) => {
    await page.goto("/assistant");
    const form = await typeKey(page);
    await tile(form, "OpenAI").click();
    await expect(form.getByLabel("API key", { exact: true })).toHaveValue(""); // never sent to another provider
    await tile(form, "Custom OpenAI-compatible").click();
    await expect(form.getByLabel("API key", { exact: true })).toHaveValue("");
    await form.getByLabel("API key", { exact: true }).fill(KEY);
    await page.keyboard.press("Escape");
    await expect(picker(page, "Model")).toBeVisible();
    expect(await page.evaluate((k) => [...document.querySelectorAll("input")].some((i) => i.value === k), KEY)).toBe(false);
  });

  test("leaving the Assistant by keyboard closes the picker and forgets a key typed in it", async ({ page }) => {
    await page.goto("/assistant");
    const form = await typeKey(page);
    // Shift+Tab out of the picker (focus leaving it closes it), on to Minimize, and Enter
    const back = page.getByRole("button", { name: "Back to the dashboard" });
    for (let i = 0; i < 80 && !(await back.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Shift+Tab");
    await expect(back).toBeFocused();
    await expect(form).toHaveCount(0); // closed as focus left it and the chip, the Assistant still shown
    await expect(chip(page)).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(/\/assistant(\/[^/?]+)?(\?|$)/);
    await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
    await keyGone(page);
    await tab(page).click();
    await assistantShown(page);
    await expect(chip(page)).toHaveAttribute("aria-expanded", "false");
    await keyGone(page);
  });

  test("Back out of the Assistant closes the picker with it and forgets a key typed in it", async ({ page }) => {
    await page.goto("/");
    await tab(page).click();
    await assistantShown(page);
    const form = await typeKey(page);
    await expect(form.getByLabel("API key", { exact: true })).toBeFocused(); // still being typed in
    await page.goBack();
    await expect(page).not.toHaveURL(/\/assistant(\/[^/?]+)?(\?|$)/);
    await expect(page.getByRole("heading", { name: "Assessment Operations Center" })).toBeVisible();
    await keyGone(page); // closed as the Assistant went, not left behind its inert stage
    await page.goForward();
    await assistantShown(page);
    await expect(chip(page)).toHaveAttribute("aria-expanded", "false");
    await keyGone(page);
    // opened again: the form starts empty
    const again = await openForm(page);
    await tile(again, "Custom OpenAI-compatible").click();
    await expect(again.getByLabel("API key", { exact: true })).toHaveValue("");
  });
});

test("no roles: signed in, the model chip, History and Security knowledge are all there", async ({ page }) => {
  await signIn(page);
  await page.goto("/assistant");
  await assistantShown(page);
  await expect(page.getByText(/operator role/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^History/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Security knowledge" })).toBeVisible();
  await expect(chip(page)).toBeEnabled();
  await chip(page).click();
  await expect(page.getByRole("dialog", { name: "Model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Model" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Model" })).toHaveCount(0);
});

test("the routes want a session, the page's origin and a valid request", async ({ page, playwright }) => {
  const body = { uid: null, question: "hi" };
  // no session: a context that starts with no cookies (the default one is signed in)
  const anonymous = await playwright.request.newContext({ baseURL: ORIGIN, storageState: { cookies: [], origins: [] } });
  expect((await anonymous.post("/api/assistant", { data: body })).status()).toBe(401);
  expect((await anonymous.get("/api/assistant/conversations")).status()).toBe(401);
  expect((await anonymous.get("/api/assistant/models")).status()).toBe(401);
  expect((await anonymous.post("/api/assistant/models/test", { data: { providerId: "environment" } })).status()).toBe(401);
  await anonymous.dispose();
  await signIn(page);
  const post = (data: unknown, origin = ORIGIN) => page.request.post("/api/assistant", { headers: { Origin: origin }, data });
  expect((await post(body, "http://evil.example")).status()).toBe(403);
  expect((await post({ uid: null, messages: [{ role: "user", content: "hi" }] })).status()).toBe(400); // no history from the browser
  // a run the page's (cached) list doesn't hold yet is still asked about, not refused: it may be
  // new since the list was read (tests/core-assistant.test.ts, "keeps the asked assessment uid")
  const unknown = await post({ uid: "20200101-000000-dead_NOPE-1", question: "hi" });
  expect(unknown.status()).toBe(200);
  expect(JSON.parse((await unknown.text()).split("\n")[0])).toMatchObject({ t: "meta", scope: { uid: "20200101-000000-dead_NOPE-1" } });
  const ok = await post(body);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toContain("application/x-ndjson");
  const lines = (await ok.text()).trim().split("\n").map((l) => JSON.parse(l) as { t: string; delta?: string; conversationId?: string });
  expect(lines[0].t).toBe("meta");
  expect(lines.at(-1)?.t).toBe("done");
  expect(lines.map((l) => l.delta ?? "").join("")).toContain("Stub answer");

  const id = lines[0].conversationId!;
  expect((await page.request.get(`/api/assistant/conversations/${id}`)).status()).toBe(200);
  expect((await page.request.get("/api/assistant/conversations/not-an-id")).status()).toBe(400);
  expect((await page.request.patch(`/api/assistant/conversations/${id}`, { headers: { Origin: "http://evil.example" }, data: { title: "x" } })).status()).toBe(403);
  expect((await page.request.delete(`/api/assistant/conversations/${id}`, { headers: { Origin: "http://evil.example" } })).status()).toBe(403);
  expect((await page.request.delete(`/api/assistant/conversations/${id}`, { headers: { Origin: ORIGIN } })).status()).toBe(200);

  // the model picker's routes: changes need the page's origin and a strict body; the old
  // Environment provider is no provider any more
  const provider = { name: "x", preset: "custom", baseUrl: "http://127.0.0.1:1/v1", models: ["m"] };
  expect((await page.request.post("/api/assistant/models", { headers: { Origin: "http://evil.example" }, data: provider })).status()).toBe(403);
  expect((await page.request.put("/api/assistant/models/active", { headers: { Origin: "http://evil.example" }, data: { providerId: "environment", model: "stub-model" } })).status()).toBe(403);
  expect((await page.request.put("/api/assistant/models/active", { headers: { Origin: ORIGIN }, data: { providerId: "environment", model: "stub-model" } })).status()).toBe(400);
  expect((await page.request.post("/api/assistant/models/fetch", { headers: { Origin: ORIGIN }, data: { providerId: "environment" } })).status()).toBe(400);
  expect((await page.request.post("/api/assistant/models", { headers: { Origin: ORIGIN }, data: { ...provider, extra: 1 } })).status()).toBe(400);
  expect((await page.request.delete("/api/assistant/models/not-an-id", { headers: { Origin: ORIGIN } })).status()).toBe(400);
  const models = await page.request.get("/api/assistant/models");
  expect(models.status()).toBe(200);
  expect(models.headers()["cache-control"]).toContain("no-store");
});
