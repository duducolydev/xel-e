import { expect, test } from "@playwright/test";

test("la page d'accueil affiche le nom de la plateforme", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Xel-E" })).toBeVisible();
});
