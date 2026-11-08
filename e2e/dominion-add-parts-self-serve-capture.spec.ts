/**
 * Capture live PNGs for docs/stitch/dominion-add-parts-self-serve (A1–A14).
 * Uses ?addPartsCapture= fixtures + catalog API mocks (Roomy/Tank handbrake cable sample).
 * Run from repo root: npx playwright test e2e/dominion-add-parts-self-serve-capture.spec.ts --project=dominion-admin
 */
import { test, type Page } from "@playwright/test";
import { join } from "node:path";
import { applyAddPartsTheme, installAddPartsSession } from "./addPartsStitchHelpers";
import { createAddPartsMockState, installAddPartsMocks } from "./addPartsStitchMocks";

const STITCH_ROOT = join(process.cwd(), "docs", "stitch", "dominion-add-parts-self-serve");

/** Every A1–A14 folder. */
const AFFECTED_SCREENS = [
  "add_parts_home_hub",
  "step_1_the_page",
  "step_2_which_cars",
  "step_3_parts_on_this_page",
  "step_3_just_one_part",
  "step_4_review_trust_for_each_car",
  "step_4_review_and_save",
  "saved_confirmation_next_steps",
  "add_more_cars_to_a_part_already_on_file",
  "fluid_oil_or_size_part_and_which_cars_use_it",
  "help_built_into_the_page",
  "states_edge_cases",
  "dark_mode_parts_table_review",
  "phone_390px_parts_intake_mobile",
] as const;

const ROOMY_HAND_BRAKE_RECENT = {
  batchId: "44444444-4444-4444-8444-44444444444a",
  batchCode: "AP-ROOMY-CABLES",
  brand: "Toyota",
  partNumber: "46410-B1011",
  partTypeName: "Handbrake cable",
  iconKey: "cable",
  fitMode: "specific",
  fitSummary: "3 cables · 2 cars",
  reachLabel: "6 fits",
  summaryLine: "3 handbrake cables · Roomy + Tank",
  plainWordsSentence: "3 handbrake cables · Roomy + Tank",
  vehicleHint: "Toyota Roomy, Toyota Tank",
  sourceHost: "partsouq.com",
  evidenceUrl:
    "https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B",
  trustLabel: "Verified · car maker's catalogue",
  promotedAt: new Date(Date.now() - 3600000).toISOString(),
  promotedByName: "Dominion Owner",
  undoEligible: true,
  canUndo: true,
};

async function installCaptureMocks(page: Page) {
  await installAddPartsMocks(page, createAddPartsMockState());
  await page.route((url) => url.pathname.includes("/admin/catalog/parts/recent"), async (route) => {
    await route.fulfill({ json: { items: [ROOMY_HAND_BRAKE_RECENT] } });
  });
}

async function shot(page: Page, folder: string, name: string, dark: boolean) {
  await applyAddPartsTheme(page, dark);
  await page.waitForTimeout(350);
  const out = join(STITCH_ROOT, folder, name);
  await page.locator(".parts-database-stitch").first().screenshot({ path: out, timeout: 60_000 });
}

async function scrollPhoneStep3ForProof(page: Page) {
  await page.locator(".catalog-parts-mobile-bar").waitFor({ state: "visible", timeout: 60_000 });
  const lastCard = page.locator(".catalog-parts-mobile-stack article").last();
  await lastCard.waitFor({ state: "visible", timeout: 60_000 });
  await lastCard.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const bar = document.querySelector(".catalog-parts-mobile-bar");
    const cards = document.querySelectorAll(".catalog-parts-mobile-stack article");
    const last = cards[cards.length - 1];
    if (!last || !bar) return;
    const barTop = bar.getBoundingClientRect().top;
    const lastBottom = last.getBoundingClientRect().bottom;
    if (lastBottom > barTop - 8) {
      window.scrollBy(0, lastBottom - barTop + 12);
    }
  });
  await page.waitForTimeout(200);
}

async function captureFolder(
  page: Page,
  folder: string,
  modes: Array<"light" | "dark" | "390">,
  afterLoad?: () => Promise<void>,
) {
  const cap = folder === "step_3_just_one_part" ? folder : folder;
  await page.goto(`/?page=parts-catalog&tab=add-parts&addPartsCapture=${encodeURIComponent(cap)}`);
  await page.waitForSelector(".parts-database-stitch", { timeout: 60_000 });
  if (afterLoad) await afterLoad();
  if (modes.includes("light")) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await shot(page, folder, "live.png", false);
  }
  if (modes.includes("dark")) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await shot(page, folder, "live-dark.png", true);
    await applyAddPartsTheme(page, false);
  }
  if (modes.includes("390")) {
    await page.setViewportSize({ width: 390, height: 844 });
    await applyAddPartsTheme(page, false);
    await page.waitForTimeout(350);
    const out390 = join(STITCH_ROOT, folder, "live-390.png");
    if (folder === "step_3_parts_on_this_page") {
      await page.screenshot({ path: out390, timeout: 60_000 });
    } else {
      await page.locator(".parts-database-stitch").first().screenshot({ path: out390, timeout: 60_000 });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
}

test.describe("dominion add parts self-serve capture", () => {
  test("fixture screenshots", async ({ page }) => {
    test.setTimeout(600_000);
    await installAddPartsSession(page, { owner: true });
    await installCaptureMocks(page);

    const defaultModes: Array<"light" | "dark" | "390"> = ["light", "dark", "390"];

    for (const folder of AFFECTED_SCREENS) {
      if (folder === "phone_390px_parts_intake_mobile") {
        await page.goto(`/?page=parts-catalog&tab=add-parts&addPartsCapture=${encodeURIComponent(folder)}`);
        await page.waitForSelector(".catalog-add-parts", { timeout: 60_000 });
        await page.setViewportSize({ width: 390, height: 844 });
        await applyAddPartsTheme(page, false);
        await page.waitForTimeout(350);
        await scrollPhoneStep3ForProof(page);
        await page.screenshot({
          path: join(STITCH_ROOT, folder, "live-390.png"),
          timeout: 60_000,
        });
        await page.setViewportSize({ width: 1280, height: 900 });
        continue;
      }
      if (folder === "help_built_into_the_page") {
        await captureFolder(page, folder, defaultModes, async () => {
          await page.locator("button").filter({ hasText: "?" }).first().click().catch(() => undefined);
          await page.waitForTimeout(200);
        });
        continue;
      }
      await captureFolder(page, folder, defaultModes);
    }
  });
});
