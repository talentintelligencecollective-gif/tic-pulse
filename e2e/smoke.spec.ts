import { test, expect } from "@playwright/test";

test.describe("App shell", () => {
  test("loads Pulse branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Pulse" }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("auth screen shows email field when logged out", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("you@company.com")).toBeVisible({
      timeout: 30_000,
    });
  });
});
