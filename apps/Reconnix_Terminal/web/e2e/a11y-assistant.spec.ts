/* Accessibility of the AI Assistant's states that write a conversation (one sent, and the
   History list) or read the saved models (the composer's model picker: its list, the remove
   confirm, Set the provider with a refusal and with a fetched list, and the picker as a phone's
   sheet): they share the assistant's folder with e2e/assistant.spec.ts, so they run in the
   serial-assistant project (playwright.config.ts), never beside another writer. */
import { expect, test } from "./fixtures";

import { LLM_PORT } from "../playwright.config";
import { axe, show } from "./axe";

test.describe("axe", () => {
  test.use({ reducedMotion: "reduce" }); // everything on screen at once, nothing mid-animation

  test("the assistant with a conversation has no violations", async ({ page }) => {
    await show(page, "/?view=assistant");
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
    await show(page, "/?view=assistant");
    await page.getByRole("button", { name: /^History/ }).click();
    await expect(page.getByRole("dialog", { name: "Conversation history" })).toBeVisible();
    await axe(page, "assistant history");
  });

  test("the model picker's list and Set the provider have no violations", async ({ page }) => {
    await show(page, "/?view=assistant");
    await page.locator(".ai-composer").getByRole("button", { name: /^Model: / }).click();
    // the list: your models (the seeded stand-in, checked) and + Model
    const pick = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(pick.getByRole("button", { name: "stub-model Stub · local", exact: true })).toBeFocused();
    await axe(page, "assistant model picker: the list");
    // the remove confirm
    await pick.getByRole("button", { name: "Remove stub-model (Stub)" }).click();
    await expect(pick.getByRole("group", { name: "Remove stub-model (Stub)?" }).getByRole("button", { name: "No" })).toBeFocused();
    await axe(page, "assistant model picker: the remove confirm");
    await page.keyboard.press("Enter"); // No
    // Set the provider, then with a refusal shown, then with the stand-in's models (nothing is saved)
    await pick.getByRole("button", { name: "+ Model" }).click();
    const form = page.getByRole("dialog", { name: "Set the provider", exact: true });
    await expect(form.getByLabel("Provider", { exact: true })).toBeFocused();
    await axe(page, "assistant model picker: set the provider");
    await form.getByLabel("Provider", { exact: true }).selectOption("custom");
    await form.getByLabel("Base URL", { exact: true }).fill("ftp://127.0.0.1/v1");
    await form.getByRole("button", { name: "Fetch models" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await axe(page, "assistant model picker: a refusal");
    await form.getByLabel("Base URL", { exact: true }).fill(`http://127.0.0.1:${LLM_PORT}/v1`);
    await form.getByRole("button", { name: "Fetch models" }).click();
    await expect(form.getByLabel("Model", { exact: true }).locator("option")).toHaveCount(3);
    await form.getByLabel("Model", { exact: true }).selectOption({ label: "Type a model name…" });
    await expect(form.getByLabel("Model name", { exact: true })).toBeVisible();
    await axe(page, "assistant model picker: the provider's models");
    await page.keyboard.press("Escape");
    await expect(pick).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pick).toBeHidden();
  });

  test("the model picker as a sheet on a phone has no violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await show(page, "/?view=assistant");
    const chip = page.locator(".ai-composer").getByRole("button", { name: /^Model: / });
    await chip.click();
    const pick = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(pick.getByRole("button", { name: "stub-model Stub · local", exact: true })).toBeFocused();
    // the sheet spans the composer, above it, inside the window
    const [sheet, box] = await Promise.all([pick.boundingBox(), page.locator(".ai-composer").boundingBox()]);
    expect(Math.abs(sheet!.x - box!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(sheet!.width - box!.width)).toBeLessThanOrEqual(1);
    expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(box!.y);
    expect(sheet!.y).toBeGreaterThanOrEqual(0);
    await axe(page, "assistant model picker on a phone");
    await pick.getByRole("button", { name: "+ Model" }).click();
    const form = page.getByRole("dialog", { name: "Set the provider", exact: true });
    await expect(form.getByLabel("Provider", { exact: true })).toBeFocused();
    const formBox = await form.boundingBox();
    expect(formBox!.y).toBeGreaterThanOrEqual(0);
    expect(formBox!.y + formBox!.height).toBeLessThanOrEqual(box!.y);
    await axe(page, "assistant model picker on a phone: set the provider");
  });
});
