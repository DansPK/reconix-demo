/* Accessibility checks for the offline assistant, conversation history and model picker. */
import { expect, test } from "./fixtures";


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
    const pick = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(pick.getByRole("list", { name: "Your models" }).getByRole("listitem")).toHaveCount(1);
    await expect(pick.getByRole("button", { name: "+ Model", exact: true })).toBeDisabled();
    await axe(page, "offline model picker");
  });

  test("the model picker as a sheet on a phone has no violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await show(page, "/assistant");
    const chip = page.locator(".ai-composer").getByRole("button", { name: /^Model: / });
    await chip.click();
    const pick = page.getByRole("dialog", { name: "Model", exact: true });
    await expect(pick.getByRole("searchbox", { name: "Search your models" })).toBeFocused();
    await expect(pick.getByRole("list", { name: "Your models" }).getByRole("listitem")).toHaveCount(1);
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
