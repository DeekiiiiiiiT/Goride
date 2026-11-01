import { test, expect } from "@playwright/test";

/**
 * Smoke: log-service wizard chrome loads on maintenance hub (auth required in CI).
 */
test.describe("Fleet maintenance log service", () => {
  test.skip(!process.env.E2E_FLEET_AUTH, "Set E2E_FLEET_AUTH to run fleet maintenance e2e");

  test("maintenance hub route responds", async ({ page }) => {
    await page.goto("/maintenance");
    await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});
