/* Accessibility of the AI Assistant's states that write a conversation (one sent, and the
   History list) or read the saved models (the composer's model picker: its list, Providers, a
   provider's page and its in-use notice, Set the provider with a refusal, with the tested
   models and with a name to type, and the picker as a phone's sheet): they share the assistant's folder with e2e/assistant.spec.ts, so they run in the
   serial-assistant project (playwright.config.ts), never beside another writer. */
import { expect, test } from "./fixtures";

import { LLM_PORT } from "../playwright.config";
import { axe, show } from "./axe";

test.describe("axe", () => {
  test.use({ reducedMotion: "reduce" }); // everything on screen at once, nothing mid-animation

  test("the assistant with a conversation has no violations", async ({ page }) => {
    await show(page, "/assistant");
    const composer = page.getByRole("textbox", { name: /^Ask about/ }).last();
    await composer.fill("Which runs wait on me?");
    await expect(async () => {
      if (await composer.inputValue()) await composer.press("Enter");
      expect(await composer.inputValue()).toBe("");
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole("log", { name: "Conversation" })).toContainText("Which runs wait on me?");
    await expect(page.getByRole("log", { name: "Conversation" })).not.toHaveAttribute("aria-busy", "true");
    await axe(page, "assistant with a conversation");
  });

  test("the assistant's History has no violations", async ({ page }) => {
    await show(page, "/assistant");
    await page.getByRole("button", { name: /^History/ }).click();
    await expect(page.getByRole("dialog", { name: "Conversation history" })).toBeVisible();
    await axe(page, "assistant history");
  });

  test("the model picker's list and Set the provider have no violations", async ({ page }) => {
    await show(page, "/assistant");
    await page.locator(".ai-composer").getByRole("button", { name: /^Model: / }).click();
    // the list: the search first, your models (the seeded stand-in's two, stub-model checked) and + Model
    const pick = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(pick.getByRole("searchbox", { name: "Search your models" })).toBeFocused();
    await expect(pick.getByRole("list", { name: "Your models" }).getByRole("listitem")).toHaveCount(2);
    await axe(page, "assistant model picker: the list");
    // Providers, one provider's page, and its in-use notice (Stub answers, so it can't be removed)
    await pick.getByRole("tab", { name: /^Providers/ }).click();
    await expect(pick.getByRole("list", { name: "Providers" }).getByRole("listitem")).toHaveCount(6);
    await axe(page, "assistant model picker: providers");
    await pick.getByRole("list", { name: "Providers" }).getByRole("button", { name: /^Custom OpenAI-compatible/ }).click();
    await expect(pick.getByRole("button", { name: "Back to providers" })).toBeFocused();
    await axe(page, "assistant model picker: a provider's page");
    await pick.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("dialog", { name: "Stub is in use" }).getByRole("button", { name: "OK" })).toBeFocused();
    await axe(page, "assistant model picker: the in-use notice");
    await page.keyboard.press("Enter"); // OK
    // Set the provider, then with a refusal shown, then with the stand-in's models, then a model
    // name to type (a remote server lists none); nothing is added
    await pick.getByRole("button", { name: "Back to providers" }).click();
    await pick.getByRole("tab", { name: /^Models/ }).click();
    await pick.getByRole("button", { name: "+ Model" }).click();
    const form = page.getByRole("dialog", { name: "Set the provider", exact: true });
    await expect(form.getByRole("radio", { name: "Reconix (default)" })).toBeFocused();
    await axe(page, "assistant model picker: set the provider");
    await form.getByRole("radio", { name: /^Custom OpenAI-compatible/ }).click();
    const url = form.getByLabel("Base URL", { exact: true });
    await url.fill("ftp://127.0.0.1/v1");
    await form.getByRole("button", { name: "Test connection" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await axe(page, "assistant model picker: a refusal");
    await url.fill(`http://127.0.0.1:${LLM_PORT}/v1`);
    await form.getByRole("button", { name: "Test again" }).click();
    await expect(form.getByRole("status")).toHaveText("Connected: 2 models found.");
    await expect(form.getByRole("radiogroup", { name: "Model" }).getByRole("radio")).toHaveCount(2);
    await axe(page, "assistant model picker: the provider's models");
    await url.fill("https://llm.example.com/v1");
    await url.press("Enter"); // Test connection
    await expect(form.getByRole("textbox", { name: "Model" })).toBeVisible();
    await axe(page, "assistant model picker: a model name to type");
    await page.keyboard.press("Escape");
    await expect(pick).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pick).toBeHidden();
  });

  test("the model picker as a sheet on a phone has no violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await show(page, "/assistant");
    const chip = page.locator(".ai-composer").getByRole("button", { name: /^Model: / });
    await chip.click();
    const pick = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(pick.getByRole("searchbox", { name: "Search your models" })).toBeFocused();
    await expect(pick.getByRole("list", { name: "Your models" }).getByRole("listitem")).toHaveCount(2);
    // the sheet spans the composer, above it, inside the window
    const [sheet, box] = await Promise.all([pick.boundingBox(), page.locator(".ai-composer").boundingBox()]);
    expect(Math.abs(sheet!.x - box!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(sheet!.width - box!.width)).toBeLessThanOrEqual(1);
    expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(box!.y);
    expect(sheet!.y).toBeGreaterThanOrEqual(0);
    await axe(page, "assistant model picker on a phone");
    await pick.getByRole("button", { name: "+ Model" }).click();
    const form = page.getByRole("dialog", { name: "Set the provider", exact: true });
    await expect(form.getByRole("radio", { name: "Reconix (default)" })).toBeFocused();
    const formBox = await form.boundingBox();
    expect(formBox!.y).toBeGreaterThanOrEqual(0);
    expect(formBox!.y + formBox!.height).toBeLessThanOrEqual(box!.y);
    await axe(page, "assistant model picker on a phone: set the provider");
  });
});
