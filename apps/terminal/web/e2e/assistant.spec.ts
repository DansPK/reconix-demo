import { expect, test } from "./fixtures";
import { signIn } from "./support";

test("the demo model picker shows the active model and disables configuration", async ({ page }) => {
  await signIn(page);
  await page.goto("/assistant");
  await page.locator(".ai-composer").getByRole("button", { name: /^Model: / }).click();
  const picker = page.getByRole("dialog", { name: "Model", exact: true });
  await expect(picker.getByRole("list", { name: "Your models" })).toContainText("reconix-security-flash");
  await expect(picker.getByRole("button", { name: "+ Model", exact: true })).toBeDisabled();
});
