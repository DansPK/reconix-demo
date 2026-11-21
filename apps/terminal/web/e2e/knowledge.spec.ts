import { expect, test } from "./fixtures";
import { signIn } from "./support";

test("the knowledge view opens without a Core API", async ({ page }) => {
  await signIn(page);
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: "Security knowledge", exact: true })).toBeVisible();
  const graph = await page.request.get("/api/knowledge/graph");
  expect(await graph.json()).toEqual({ items: [], references: {} });
});
