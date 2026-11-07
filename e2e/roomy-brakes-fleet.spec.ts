/**
 * Phase 4 — Fleet brakes (Fx fixtures, real stack, mm-f01).
 * Run once: see playwright.config fleet project.
 */
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MM_F01_PLATE_1505,
  MM_F01_PLATE_5179,
  applyMmF01HttpSeed,
  seedMmF01Session,
} from "./helpers/mmF01Auth";

const VIEWPORT = { width: 1440, height: 900 };
const shotsDir = join(process.cwd(), "docs", "stitch", "roomy-brakes-fleet", "screenshots");
mkdirSync(shotsDir, { recursive: true });
const FX_ROOMY_CATALOG = "e2e0f005-0000-4000-8000-000000000010";

function applySqlFile(relativePath: string) {
  const sqlFile = readFileSync(join(process.cwd(), relativePath), "utf8");
  execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
    input: sqlFile,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runSql(sql: string) {
  execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function signInFleet(page: Page, dark = false) {
  await page.addInitScript((useDark) => {
    localStorage.setItem("preference_dark_mode", useDark ? "true" : "false");
    if (useDark) document.documentElement.classList.add("dark");
  }, dark);
  await seedMmF01Session(page);
}

async function openBrakesList(page: Page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/maintenance?tab=find-parts");
  await expect(page.getByText("Which car is it?", { exact: false })).toBeVisible({ timeout: 30_000 });
  await page.getByText(MM_F01_PLATE_5179).click();
  await expect(page.getByText("What part", { exact: false })).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button").filter({ has: page.getByText("Brakes", { exact: true }) }).first().click();
  await expect(page.getByText("Parts encyclopedia for your car")).toBeVisible({ timeout: 25_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Roomy brakes fleet (real stack)", () => {
  test.beforeAll(() => {
    applyMmF01HttpSeed();
    applySqlFile("supabase/migrations/20261107012459_roomy_brakes_phase4_admin_part_fits.sql");
    applySqlFile("e2e/fixtures/roomy_brakes_fleet_seed.sql");
  });

  test.beforeEach(async ({ page }) => {
    await signInFleet(page);
  });

  test("done-test 1: one pad card with five brand numbers", async ({ page }) => {
    await openBrakesList(page);
    await page.getByRole("button").filter({ has: page.getByText("Brake pads", { exact: true }) }).first().click();
    await expect(page.getByText(/It is sold under 5 brand numbers|5 other brand numbers/i).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText("Reference number", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("FX-PAD-A").first()).toBeVisible();
    await expect(page.getByText("FX-PAD-E").first()).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "find_parts_front_brake_pads_light_dark_mode-live.png") });
  });

  test("done-test 2 and 3: Also fits and Needs checking", async ({ page }) => {
    await openBrakesList(page);
    await page.getByRole("button").filter({ has: page.getByText("Brake pads", { exact: true }) }).first().click();
    await page.getByRole("button", { name: /View details/i }).first().click();
    await expect(page.getByText("Also fits")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("FxSwift")).toBeVisible();
    await expect(page.getByText("FxDemio")).toBeVisible();
    await expect(page.getByText("FxRush")).toHaveCount(0);
    await expect(page.getByText("Needs checking").first()).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "find_parts_part_detail_with_also_fits_light_dark_mode-live.png") });
  });

  test("done-test 4: same card from FxSwift car", async ({ page }) => {
    await page.goto("/maintenance?tab=find-parts");
    await page.getByText(MM_F01_PLATE_1505).click();
    await page.getByRole("button").filter({ has: page.getByText("Brakes", { exact: true }) }).first().click();
    await page.getByRole("button").filter({ has: page.getByText("Brake pads", { exact: true }) }).first().click();
    await expect(page.getByText("FX-PAD-A").first()).toBeVisible({ timeout: 25_000 });
  });

  test("done-test 6: every brake type listed with empty Ask Roam", async ({ page }) => {
    await openBrakesList(page);
    await expect(page.getByText("Front brakes", { exact: true })).toBeVisible();
    await expect(page.getByText("Brake rotor", { exact: false })).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "find_parts_brakes_list_toyota_roomy_5179kz-live.png"), fullPage: true });
    await page.getByRole("button").filter({ has: page.getByText("Brake rotor", { exact: true }) }).first().click();
    await expect(page.getByText("Not in our database yet")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Ask Roam to find it", exact: true })).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "find_parts_brake_rotor_not_on_file_request_sent-live.png"), fullPage: true });
  });

  test("Fleet 5: brakes overview error banner", async ({ page }) => {
    await page.route("**/parts/brakes-overview**", (route) => route.abort());
    await page.goto("/maintenance?tab=find-parts");
    await page.getByText(MM_F01_PLATE_5179).click();
    await page.getByRole("button").filter({ has: page.getByText("Brakes", { exact: true }) }).first().click();
    await expect(page.getByText("Couldn't load brake parts. Nothing was changed.", { exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "find_parts_states_error_banner-live.png"), fullPage: true });
    await page.unroute("**/parts/brakes-overview**");
  });

  test("Fleet 5: unknown brake setup", async ({ page }) => {
    runSql(`
      UPDATE public.vehicle_catalog
      SET front_brake_type = NULL, rear_brake_type = NULL, brake_size_mm = NULL
      WHERE id = '${FX_ROOMY_CATALOG}'::uuid;
    `);
    try {
      await page.setViewportSize(VIEWPORT);
      await page.goto("/maintenance?tab=find-parts");
      await page.getByText(MM_F01_PLATE_5179).click();
      await page.getByRole("button").filter({ has: page.getByText("Brakes", { exact: true }) }).first().click();
      await expect(
        page.getByText("We don't know this car's brake setup yet, so we can't list its brake parts.", { exact: true }),
      ).toBeVisible({ timeout: 25_000 });
      await page.screenshot({ path: join(shotsDir, "find_parts_states_unknown_brake_setup-live.png"), fullPage: true });
    } finally {
      runSql(`
        UPDATE public.vehicle_catalog
        SET front_brake_type = 'Ventilated disc', rear_brake_type = 'Drum', brake_size_mm = 255
        WHERE id = '${FX_ROOMY_CATALOG}'::uuid;
      `);
    }
  });

  test("screenshots dark + 390px", async ({ page }) => {
    await signInFleet(page, true);
    await openBrakesList(page);
    await page.screenshot({ path: join(shotsDir, "find_parts_brakes_list_toyota_roomy_5179kz-live-dark.png"), fullPage: true });
    await page.getByRole("button").filter({ has: page.getByText("Brake pads", { exact: true }) }).first().click();
    await expect(page.getByText(/It is sold under 5 brand numbers|5 other brand numbers/i).first()).toBeVisible({
      timeout: 25_000,
    });
    await page.screenshot({ path: join(shotsDir, "find_parts_front_brake_pads_light_dark_mode-live-dark.png"), fullPage: true });
    await page.getByRole("button", { name: /View details/i }).first().click();
    await expect(page.getByText("Also fits")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: join(shotsDir, "find_parts_part_detail_with_also_fits_light_dark_mode-live-dark.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: join(shotsDir, "find_parts_phone_390px_screen_3-live-dark.png"), fullPage: true });
    await page.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(page.getByText(/It is sold under 5 brand numbers|5 other brand numbers/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: join(shotsDir, "find_parts_phone_390px_screen_2-live-dark.png"), fullPage: true });
  });

  test("Fleet 5: dark error + unknown screenshots", async ({ page }) => {
    await signInFleet(page, true);
    await page.route("**/parts/brakes-overview**", (route) => route.abort());
    await page.goto("/maintenance?tab=find-parts");
    await page.getByText(MM_F01_PLATE_5179).click();
    await page.getByRole("button").filter({ has: page.getByText("Brakes", { exact: true }) }).first().click();
    await expect(page.getByText("Couldn't load brake parts. Nothing was changed.", { exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await page.screenshot({ path: join(shotsDir, "find_parts_states_error_banner-live-dark.png"), fullPage: true });
    await page.unroute("**/parts/brakes-overview**");

    runSql(`
      UPDATE public.vehicle_catalog
      SET front_brake_type = NULL, rear_brake_type = NULL, brake_size_mm = NULL
      WHERE id = '${FX_ROOMY_CATALOG}'::uuid;
    `);
    try {
      await page.goto("/maintenance?tab=find-parts");
      await page.getByText(MM_F01_PLATE_5179).click();
      await page.getByRole("button").filter({ has: page.getByText("Brakes", { exact: true }) }).first().click();
      await expect(
        page.getByText("We don't know this car's brake setup yet, so we can't list its brake parts.", { exact: true }),
      ).toBeVisible({ timeout: 25_000 });
      await page.screenshot({ path: join(shotsDir, "find_parts_states_unknown_brake_setup-live-dark.png"), fullPage: true });
    } finally {
      runSql(`
        UPDATE public.vehicle_catalog
        SET front_brake_type = 'Ventilated disc', rear_brake_type = 'Drum', brake_size_mm = 255
        WHERE id = '${FX_ROOMY_CATALOG}'::uuid;
      `);
    }
  });
});
