/**
 * Capture live PNGs for docs/stitch/dominion-vehicles-catalog (V1–V12).
 * Run: npx playwright test e2e/dominion-vehicles-catalog-capture.spec.ts --project=dominion-admin
 */
import { test, type Page } from "@playwright/test";
import { join } from "node:path";
import { applyAddPartsTheme, installAddPartsSession } from "./addPartsStitchHelpers";
import { createAddPartsMockState, installAddPartsMocks } from "./addPartsStitchMocks";
import { installVehiclesCaptureMocks } from "./vehiclesStitchMocks";

const STITCH_ROOT = join(process.cwd(), "docs", "stitch", "dominion-vehicles-catalog");

const FOLDERS = [
  "vehicles_master_catalog",
  "toyota_models",
  "toyota_roomy_versions",
  "toyota_roomy_overview",
  "toyota_roomy_car_specs",
  "toyota_roomy_add_or_edit_spec",
  "toyota_roomy_parts_on_file",
  "toyota_roomy_sister_cars_history",
  "vehicles_add_a_car",
  "vehicles_system_states_dialogs",
  "vehicles_dark_mode_versions_specs",
  "vehicles_phone_390px_home_versions_specs",
] as const;

async function shot(page: Page, folder: string, name: string, dark: boolean) {
  await applyAddPartsTheme(page, dark);
  await page.waitForTimeout(350);
  const out = join(STITCH_ROOT, folder, name);
  await page.screenshot({ path: out, fullPage: true, timeout: 60_000 });
}

test("dominion vehicles catalog capture", async ({ page }) => {
    test.setTimeout(600_000);
    await installAddPartsSession(page, { role: "platform_owner" });
    await installAddPartsMocks(page, createAddPartsMockState());
    await installVehiclesCaptureMocks(page);

    for (const folder of FOLDERS) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/?page=motor-vehicles&vehiclesCapture=${encodeURIComponent(folder)}`);
      await page.waitForSelector(".vehicles-database-stitch", { timeout: 60_000 });
      if (folder === "vehicles_add_a_car") {
        await page.getByText(/already exists/i).waitFor({ timeout: 60_000 });
        await page.getByRole("button", { name: "Open existing car" }).waitFor({ timeout: 60_000 });
      }
      await shot(page, folder, "live.png", false);

      if (
        folder === "toyota_roomy_versions"
        || folder === "toyota_roomy_car_specs"
        || folder === "vehicles_dark_mode_versions_specs"
      ) {
        if (folder === "vehicles_dark_mode_versions_specs") {
          await page.goto(`/?page=motor-vehicles&vehiclesCapture=toyota_roomy_versions`);
          await page.waitForSelector(".vehicles-database-stitch", { timeout: 60_000 });
          await shot(page, folder, "live-dark.png", true);
          await page.goto(`/?page=motor-vehicles&vehiclesCapture=toyota_roomy_car_specs`);
          await page.waitForSelector(".vehicles-database-stitch", { timeout: 60_000 });
          await shot(page, "toyota_roomy_car_specs", "live-dark.png", true);
        } else {
          await shot(page, folder, "live-dark.png", true);
        }
        await applyAddPartsTheme(page, false);
      }

      if (
        folder === "toyota_roomy_versions"
        || folder === "toyota_roomy_car_specs"
        || folder === "vehicles_master_catalog"
        || folder === "vehicles_phone_390px_home_versions_specs"
      ) {
        await page.setViewportSize({ width: 390, height: 844 });
        await applyAddPartsTheme(page, false);
        const cap390 =
          folder === "vehicles_phone_390px_home_versions_specs" ? "vehicles_master_catalog" : folder;
        if (folder === "vehicles_phone_390px_home_versions_specs") {
          await page.goto(`/?page=motor-vehicles&vehiclesCapture=${encodeURIComponent(cap390)}`);
          await page.waitForSelector(".vehicles-database-stitch", { timeout: 60_000 });
        }
        const out390 =
          folder === "vehicles_phone_390px_home_versions_specs"
            ? join(STITCH_ROOT, folder, "live-390.png")
            : join(STITCH_ROOT, folder, "live-390.png");
        await page.screenshot({ path: out390, fullPage: true, timeout: 60_000 });
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    }
});
