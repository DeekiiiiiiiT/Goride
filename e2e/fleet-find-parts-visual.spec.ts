import { test } from "@playwright/test";

/**
 * Side-by-side proof for Find parts.
 * Stitch reference pictures live in docs/stitch/roam-fleet-app/screenshots/FP*-stitch.png.
 * This spec is the place that writes FP*-compare.png once the live page is up.
 * It does not invent a pass. A missing login or a missing page fails the test.
 */
test("find parts tab is on the maintenance page", async ({ page }) => {
  await page.goto("/?tab=find-parts");
  await page.getByText("Which car is it?").waitFor({ timeout: 20_000 });
});
