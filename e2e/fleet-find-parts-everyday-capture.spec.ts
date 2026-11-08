/**
 * Capture live PNGs for docs/stitch/fleet-find-parts-everyday (F1–F14).
 * Run: node node_modules/@playwright/test/cli.js test -c playwright.fleet-find-parts-everyday.config.ts
 */
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import {
  EVERYDAY_CAPTURE_FOLDERS,
  EVERYDAY_VEHICLE_ID,
  everydayFleetCars,
} from "./findPartsEverydayCaptureFixtures";
import { fleetAuthSession, fleetCoreEverydayCaptureFixtures, installFleetCoreMockRoutes, seedFleetAuthSession } from "./findPartsFleetMocks";

const STITCH_ROOT = join(process.cwd(), "docs", "stitch", "fleet-find-parts-everyday");

async function installMocks(page: Page) {
  const session = fleetAuthSession();
  await seedFleetAuthSession(page, session);
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
  await page.route("**/platform-catalog/**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
  await page.route("**/functions/v1/platform-catalog/**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
  await installFleetCoreMockRoutes(page, fleetCoreEverydayCaptureFixtures());
  await page.route("**/maintenance-fleet-summary**", async (route) => {
    await route.fulfill({
      json: {
        items: everydayFleetCars().map((c) => ({
          vehicleId: c.vehicleId,
          licensePlate: c.licensePlate,
          make: c.make,
          model: c.model,
          year: c.year,
          odometer: 0,
          fleetStatus: "ok",
          servicesAttention: [],
          servicesAttentionTruncated: false,
        })),
        nightlyRun: null,
        telemetryMissingCount: 0,
        partsRequisition: { status: "Ready", detail: "Catalogue linked" },
      },
    });
  });
}

function captureUrl(folder: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({
    tab: "find-parts",
    vehicle: EVERYDAY_VEHICLE_ID,
    findPartsCapture: folder,
    ...extra,
  });
  return `/maintenance?${params.toString()}`;
}

async function prepareScroll(page: Page) {
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  });
}

async function shot(page: Page, folder: string, filename: string, fullPage = true) {
  const path = join(STITCH_ROOT, folder, filename);
  if (fullPage) {
    // The app scrolls inside an inner panel pinned to the window height, so a normal full-page shot stops at the
    // fold. Grow the window to the tallest scroll content, take the shot, then put the window back.
    const before = page.viewportSize();
    const needed = await page.evaluate(() => {
      let extra = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const hidden = el.scrollHeight - el.clientHeight;
        if (hidden > extra && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) extra = hidden;
      }
      return window.innerHeight + extra;
    });
    if (before && needed > before.height) {
      await page.setViewportSize({ width: before.width, height: Math.min(needed + 40, 6000) });
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path, fullPage });
    if (before) await page.setViewportSize(before);
    return;
  }
  await page.screenshot({ path, fullPage });
}

async function assertCaptureReady(page: Page, folder: string, extra?: Record<string, string>) {
  if (folder === "front_brake_pads_the_answer_04465_b1190") {
    await expect(page.getByText("Toyota Roomy 2019").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("04465-B1190").first()).toBeVisible({ timeout: 60_000 });
    return;
  }
  if (folder === "brakes_for_your_roomy_front_rear_whole_car") {
    await expect(page.getByText("Toyota Roomy 2019").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Front wheels/).first()).toBeVisible({ timeout: 60_000 });
    return;
  }
  if (folder === "find_parts_which_car_is_it_for") {
    await expect(page.getByText("5179KZ").first()).toBeVisible({ timeout: 60_000 });
    return;
  }
  if (folder === "which_roomy_2019_is_yours_2wd_or_4wd") {
    await expect(page.getByText("Select 2WD").first()).toBeVisible({ timeout: 60_000 });
    return;
  }
  if (folder === "parts_with_left_right_numbered_sets_roam_fleet") {
    await expect(page.getByText("Toyota Roomy 2019").first()).toBeVisible({ timeout: 60_000 });
    const state = extra?.findPartsCaptureState || "calipers";
    if (state === "cables") {
      await expect(page.getByText("Rear cable 2").first()).toBeVisible({ timeout: 60_000 });
    } else if (state === "shoes") {
      await expect(page.getByText("04495-B2430").first()).toBeVisible({ timeout: 60_000 });
    } else {
      await expect(page.getByText("47730-B1021").first()).toBeVisible({ timeout: 60_000 });
    }
    return;
  }
  if (folder === "every_car_the_front_pads_fit_cross_maker_matrix_roam_fleet") {
    await expect(page.getByText("Verified only (24)").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Suzuki").first()).toBeVisible({ timeout: 60_000 });
    return;
  }
  if (folder === "states_loading_couldn_t_load_car_we_don_t_know_yet_offline" && extra?.findPartsCaptureState === "error") {
    await expect(page.getByText("We couldn't load the parts. Nothing was changed.").first()).toBeVisible({ timeout: 60_000 });
    return;
  }
  if (folder === "states_loading_couldn_t_load_car_we_don_t_know_yet_offline" && extra?.findPartsCaptureState === "unknown") {
    await expect(page.getByText("Toyota Rush 2018").first()).toBeVisible({ timeout: 60_000 });
    return;
  }
  if (folder === "states_loading_couldn_t_load_car_we_don_t_know_yet_offline" && extra?.findPartsCaptureState === "offline") {
    await expect(page.getByText("You're offline. Showing what you last opened.").first()).toBeVisible({ timeout: 60_000 });
    return;
  }
}

test.describe("Fleet find parts everyday capture", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  for (const folder of EVERYDAY_CAPTURE_FOLDERS) {
    test(`capture ${folder} light`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const extra: Record<string, string> = {};
      if (folder === "parts_with_left_right_numbered_sets_roam_fleet") extra.findPartsCaptureState = "cables";
      if (folder === "search_results_pads_no_results_state_toyota_roomy") extra.findPartsCaptureState = "none";
      if (folder === "a_part_we_don_t_have_yet_ask_roam_to_find_it") extra.findPartsCaptureState = "sent";
      if (folder === "phone_390px_car_home_part_answer_every_car_sheet") extra.findPartsCaptureState = "answer";
      await page.goto(captureUrl(folder, extra));
      await page.locator(".fleet-find-parts-everyday").first().waitFor({ state: "visible", timeout: 60_000 });
      await assertCaptureReady(page, folder, extra);
      await prepareScroll(page);
      await page.waitForTimeout(400);
      await shot(page, folder, "live.png");
      if (folder === "every_car_the_front_pads_fit_cross_maker_matrix_roam_fleet") {
        await shot(page, folder, "live-full.png", true);
      }
    });

    test(`capture ${folder} dark`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const extra: Record<string, string> = {};
      if (folder === "parts_with_left_right_numbered_sets_roam_fleet") extra.findPartsCaptureState = "cables";
      await page.goto(captureUrl(folder, Object.keys(extra).length ? extra : undefined));
      await page.locator(".fleet-find-parts-everyday").first().waitFor({ state: "visible", timeout: 60_000 });
      await assertCaptureReady(page, folder, extra);
      await page.evaluate(() => {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
      });
      await page.waitForTimeout(400);
      await shot(page, folder, "live-dark.png");
    });

    test(`capture ${folder} 390`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const extra: Record<string, string> = {};
      if (folder === "phone_390px_car_home_part_answer_every_car_sheet") extra.findPartsCaptureState = "alsoFits";
      if (folder === "parts_with_left_right_numbered_sets_roam_fleet") extra.findPartsCaptureState = "cables";
      await page.goto(captureUrl(folder, extra));
      await page.locator(".fleet-find-parts-everyday").first().waitFor({ state: "visible", timeout: 60_000 });
      await assertCaptureReady(page, folder, extra);
      await prepareScroll(page);
      await page.waitForTimeout(400);
      await shot(page, folder, "live-390.png");
    });
  }

  const f7States = ["calipers", "cables", "shoes"] as const;
  for (const variant of f7States) {
    test(`capture parts_with_left_right_numbered_sets_roam_fleet ${variant}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const extra = { findPartsCaptureState: variant };
      await page.goto(captureUrl("parts_with_left_right_numbered_sets_roam_fleet", extra));
      await page.locator(".fleet-find-parts-everyday").first().waitFor({ state: "visible", timeout: 60_000 });
      await assertCaptureReady(page, "parts_with_left_right_numbered_sets_roam_fleet", extra);
      await prepareScroll(page);
      await page.waitForTimeout(400);
      await shot(page, "parts_with_left_right_numbered_sets_roam_fleet", `live-${variant}.png`);
    });
  }

  const f13States = [
    { state: "loading", file: "live-loading.png" },
    { state: "error", file: "live-error.png" },
    { state: "unknown", file: "live-unknown.png" },
    { state: "offline", file: "live-offline.png" },
  ] as const;
  for (const row of f13States) {
    test(`capture states frame ${row.state}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(captureUrl("states_loading_couldn_t_load_car_we_don_t_know_yet_offline", { findPartsCaptureState: row.state }));
      await page.locator(".fleet-find-parts-everyday").first().waitFor({ state: "visible", timeout: 60_000 });
      await assertCaptureReady(page, "states_loading_couldn_t_load_car_we_don_t_know_yet_offline", { findPartsCaptureState: row.state });
      await prepareScroll(page);
      await page.waitForTimeout(400);
      await shot(page, "states_loading_couldn_t_load_car_we_don_t_know_yet_offline", row.file);
    });
  }

});
