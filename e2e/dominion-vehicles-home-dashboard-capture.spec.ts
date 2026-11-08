/**
 * Capture live PNGs for docs/stitch/dominion-vehicles-home-dashboard (light, dark, phone 390px).
 * Run: npx playwright test e2e/dominion-vehicles-home-dashboard-capture.spec.ts --project=dominion-admin
 */
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { applyAddPartsTheme, installAddPartsSession } from "./addPartsStitchHelpers";
import { createAddPartsMockState, installAddPartsMocks } from "./addPartsStitchMocks";
import { installVehiclesCaptureMocks } from "./vehiclesStitchMocks";

const ROOT = join(process.cwd(), "docs", "stitch", "dominion-vehicles-home-dashboard");

async function open(page: Page, width: number, dark: boolean) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?page=motor-vehicles&vehiclesCapture=vehicles_master_catalog`);
  await page.waitForSelector(".vehicles-database-stitch", { timeout: 60_000 });
  await applyAddPartsTheme(page, dark);
  await page.waitForTimeout(350);
}

test("dominion vehicles home dashboard capture", async ({ page }) => {
  test.setTimeout(300_000);
  await installAddPartsSession(page, { role: "platform_owner" });
  await installAddPartsMocks(page, createAddPartsMockState());
  await installVehiclesCaptureMocks(page);

  await open(page, 1440, false);
  await expect(page.getByRole("heading", { name: "How complete is the catalogue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently changed cars" })).toBeVisible();
  await expect(page.getByText("Needs attention").first()).toBeVisible();
  await expect(page.getByText(/fleet/i)).toHaveCount(0);
  await page.screenshot({ path: join(ROOT, "vehicles_home_dashboard_light_database_view", "live.png"), fullPage: true });

  await open(page, 1440, true);
  await page.screenshot({ path: join(ROOT, "vehicles_home_dashboard_dark_mode", "live.png"), fullPage: true });

  await open(page, 390, false);
  await page.screenshot({ path: join(ROOT, "vehicles_home_dashboard_phone_390px", "live.png"), fullPage: true });
});
