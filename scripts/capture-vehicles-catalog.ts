import { chromium } from "@playwright/test";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { applyAddPartsTheme, installAddPartsSession } from "../e2e/addPartsStitchHelpers";
import { createAddPartsMockState, installAddPartsMocks } from "../e2e/addPartsStitchMocks";
import { installVehiclesCaptureMocks } from "../e2e/vehiclesStitchMocks";

const ROOT = process.cwd();
const STITCH = join(ROOT, "docs", "stitch", "dominion-vehicles-catalog");
const BASE = process.env.ADMIN_BASE_URL?.trim() || "http://127.0.0.1:5180";

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

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installAddPartsSession(page, { role: "platform_owner" });
  await installAddPartsMocks(page, createAddPartsMockState());
  await installVehiclesCaptureMocks(page);

  for (const folder of FOLDERS) {
    await mkdir(join(STITCH, folder), { recursive: true });
    await page.goto(`${BASE}/?page=motor-vehicles&vehiclesCapture=${encodeURIComponent(folder)}`);
    await page.waitForSelector(".vehicles-database-stitch", { timeout: 120_000 });
    await applyAddPartsTheme(page, false);
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(STITCH, folder, "live.png"), fullPage: false });

    if (
      folder === "toyota_roomy_versions"
      || folder === "toyota_roomy_car_specs"
      || folder === "vehicles_dark_mode_versions_specs"
    ) {
      if (folder === "vehicles_dark_mode_versions_specs") {
        await page.goto(`${BASE}/?page=motor-vehicles&vehiclesCapture=toyota_roomy_versions`);
        await page.waitForSelector(".vehicles-database-stitch", { timeout: 120_000 });
        await applyAddPartsTheme(page, true);
        await page.screenshot({ path: join(STITCH, folder, "live-dark.png"), fullPage: false });
        await page.goto(`${BASE}/?page=motor-vehicles&vehiclesCapture=toyota_roomy_car_specs`);
        await page.waitForSelector(".vehicles-database-stitch", { timeout: 120_000 });
        await applyAddPartsTheme(page, true);
        await page.screenshot({ path: join(STITCH, "toyota_roomy_car_specs", "live-dark.png"), fullPage: false });
      } else {
        await applyAddPartsTheme(page, true);
        await page.screenshot({ path: join(STITCH, folder, "live-dark.png"), fullPage: false });
      }
      await applyAddPartsTheme(page, false);
    }

    if (
      folder === "toyota_roomy_versions"
      || folder === "toyota_roomy_car_specs"
      || folder === "vehicles_master_catalog"
      || folder === "vehicles_phone_390px_home_versions_specs"
    ) {
      const cap390 = folder === "vehicles_phone_390px_home_versions_specs" ? "vehicles_master_catalog" : folder;
      if (folder === "vehicles_phone_390px_home_versions_specs") {
        await page.goto(`${BASE}/?page=motor-vehicles&vehiclesCapture=${encodeURIComponent(cap390)}`);
        await page.waitForSelector(".vehicles-database-stitch", { timeout: 120_000 });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await applyAddPartsTheme(page, false);
      const out390 = join(
        STITCH,
        folder === "vehicles_phone_390px_home_versions_specs" ? folder : folder,
        "live-390.png",
      );
      await page.screenshot({ path: out390, fullPage: false });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
  }
  await browser.close();
  console.log("vehicles capture done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
