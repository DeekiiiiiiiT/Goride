/**
 * Add parts self-serve — Stitch fidelity + CONTROL_MATRIX (AP1–AP13).
 * Run: node node_modules/@playwright/test/cli.js test e2e/add-a-part-stitch.spec.ts --project=dominion-admin
 */
import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  AP_FORBIDDEN,
  applyAddPartsTheme,
  assertAddPartsTheme,
  assertNoForbidden,
  assertStitchHeadings,
  fileHash,
  gotoAddParts,
  installAddPartsSession,
  prepareAddPartsScreen,
} from "./addPartsStitchHelpers";
import { createAddPartsMockState, installAddPartsMocks } from "./addPartsStitchMocks";

const stitchShots = join(process.cwd(), "docs", "stitch", "dominion-add-a-part", "screenshots");

/** Live capture basenames (light file); dark uses `-live-dark.png`. */
export const AP_LIVE_SHOT_BASES = [
  "add_parts_home_ap1-live.png",
  "add_parts_step_1_part_type_picker_ap2-live.png",
  "add_parts_step_1_continued_part_details_source_ap3-live.png",
  "add_parts_step_2a_specific_cars_brake_pads-live.png",
  "add_parts_step_2b_by_engine_oil_filter-live.png",
  "add_parts_step_2c_by_size_or_spec_wiper_blades_spec_types-live.png",
  "add_parts_step_3_replaces_factory_number_ap7-live.png",
  "add_parts_step_4_review_and_save_ap8-live.png",
  "add_parts_saved_ap9-live.png",
  "add_parts_parts_in_plain_words_guide_drawer_ap10-live.png",
  "add_parts_states_exceptions_ap11-live.png",
  "add_parts_position_spec_frames_for_all_types_ap12-live.png",
  "part_types_owner_settings_screen_13-live.png",
] as const;

function shotPath(base: string, dark: boolean) {
  return join(stitchShots, dark ? base.replace("-live.png", "-live-dark.png") : base);
}

async function fillPartDetails(page: import("@playwright/test").Page) {
  await page.locator('label:has-text("Brand")').locator("..").locator("input").fill("MK Kashiyama");
  await page.locator('label:has-text("Part number")').locator("..").locator("input").fill("D0051MH");
  await page.locator('label:has-text("Source page link")').locator("..").locator("input").fill("https://example.com/src");
}

function registerApScreens(dark: boolean) {
  const theme = dark ? "dark" : "light";

  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await installAddPartsSession(page, { dark });
      await installAddPartsMocks(page, createAddPartsMockState());
    });

    test(`AP1 home ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await expect(page.getByRole("button", { name: /Start/i })).toBeEnabled();
      await page.getByRole("button", { name: /What do these words mean/i }).click();
      await expect(page.getByText(/Parts in plain words/i)).toBeVisible();
      await page.getByRole("button", { name: /Got it/i }).click();
      await assertNoForbidden(page, AP_FORBIDDEN);
      await page.screenshot({ path: shotPath("add_parts_home_ap1-live.png", dark), fullPage: true });
    });

    test(`AP2 type picker ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await expect(page.getByRole("heading", { name: /What kind of part/i })).toBeVisible();
      await page.screenshot({ path: shotPath("add_parts_step_1_part_type_picker_ap2-live.png", dark), fullPage: true });
    });

    test(`AP3 part details ${theme}`, async ({ page }) => {
      await gotoAddParts(page);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Brake pads", exact: true }).click();
      await expect(page.getByRole("heading", { name: /Which part exactly/i })).toBeVisible();
      await assertStitchHeadings(page, "add_parts_step_1_continued_part_details_source_ap3.html", page.locator(".parts-database-stitch").first());
      await applyAddPartsTheme(page, dark);
      await assertAddPartsTheme(page, dark);
      await page.screenshot({
        path: shotPath("add_parts_step_1_continued_part_details_source_ap3-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP4 specific cars ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Brake pads", exact: true }).click();
      await fillPartDetails(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByPlaceholder(/Make, model or chassis/i).fill("Toyota");
      await expect(page.getByText("Same body:")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Vehicle Model")).toBeVisible();
      await expect(page.getByText("Your selection")).toBeVisible();
      await expect(page.getByLabel("Filter by engine code")).toBeVisible();
      await page.getByRole("checkbox").nth(1).check();
      await expect(page.getByRole("button", { name: "Front Axle" })).toBeVisible();
      await expect(page.getByLabel("Filter years from")).toBeVisible();
      await assertAddPartsTheme(page, dark);
      await page.screenshot({
        path: shotPath("add_parts_step_2a_specific_cars_brake_pads-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP5 by engine ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Oil filter", exact: true }).click();
      await fillPartDetails(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByPlaceholder(/Engine code/i).fill("1KR");
      await page.getByRole("button", { name: /1KR-FE/i }).click();
      await page.screenshot({
        path: shotPath("add_parts_step_2b_by_engine_oil_filter-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP6 by spec ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Wiper blades", exact: true }).click();
      await fillPartDetails(page);
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText(/Driver wiper|Driver blade/i)).toBeVisible();
      await page.screenshot({
        path: shotPath("add_parts_step_2c_by_size_or_spec_wiper_blades_spec_types-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP7 replaces OE ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Brake pads", exact: true }).click();
      await fillPartDetails(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText(/Replaces a factory number/i)).toBeVisible();
      await page.screenshot({
        path: shotPath("add_parts_step_3_replaces_factory_number_ap7-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP8 review ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Brake pads", exact: true }).click();
      await fillPartDetails(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText("Check it reads right")).toBeVisible();
      await expect(page.getByText(/brake pad set/i)).toBeVisible();
      await assertStitchHeadings(page, "add_parts_step_4_review_and_save_ap8.html", page.locator(".parts-database-stitch").first());
      await assertAddPartsTheme(page, dark);
      await page.screenshot({
        path: shotPath("add_parts_step_4_review_and_save_ap8-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP9 saved ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Brake pads", exact: true }).click();
      await fillPartDetails(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Save part" }).click();
      await expect(page.getByRole("button", { name: "Add another part" })).toBeVisible();
      await page.screenshot({ path: shotPath("add_parts_saved_ap9-live.png", dark), fullPage: true });
    });

    test(`AP10 plain words drawer ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /What do these words mean/i }).click();
      await page.screenshot({
        path: shotPath("add_parts_parts_in_plain_words_guide_drawer_ap10-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP11 part exists state ${theme}`, async ({ page }) => {
      await gotoAddParts(page);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Brake pads", exact: true }).click();
      await page.locator('label:has-text("Brand")').locator("..").locator("input").fill("Dup");
      await page.locator('label:has-text("Part number")').locator("..").locator("input").fill("EXIST-1");
      await page.locator('label:has-text("Source page link")').locator("..").locator("input").fill("https://example.com/x");
      await expect(page.getByText(/already in the database/i)).toBeVisible();
      await expect(page.getByRole("heading", { name: /Which part exactly/i })).toBeVisible();
      await applyAddPartsTheme(page, dark);
      await assertAddPartsTheme(page, dark);
      await page.screenshot({ path: shotPath("add_parts_states_exceptions_ap11-live.png", dark), fullPage: true });
    });

    test(`AP12 position spec frame ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Brake pads", exact: true }).click();
      await fillPartDetails(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByPlaceholder(/Make, model or chassis/i).fill("Toyota");
      await page.locator('input[type="checkbox"]').first().check();
      await expect(page.getByRole("button", { name: "Front Axle" })).toBeVisible();
      await page.screenshot({
        path: shotPath("add_parts_position_spec_frames_for_all_types_ap12-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP13 part types owner ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: "Part types" }).click();
      await expect(page.getByRole("heading", { name: "Part types" })).toBeVisible();
      await page.screenshot({ path: shotPath("part_types_owner_settings_screen_13-live.png", dark), fullPage: true });
    });
  });
}

test.describe("Add parts self-serve stitch gate", () => {
  registerApScreens(false);
  registerApScreens(true);

  test.beforeEach(async ({ page }) => {
    await installAddPartsSession(page);
    await installAddPartsMocks(page, createAddPartsMockState());
  });

  test("CONTROL_MATRIX home controls respond", async ({ page }) => {
    await prepareAddPartsScreen(page, false);
    await page.getByRole("button", { name: /Bulk upload/i }).click();
    await expect(page.getByText(/Back to Add parts/i)).toBeVisible();
    await page.getByRole("button", { name: /Back to Add parts/i }).click();
    await page.getByRole("button", { name: /What do these words mean/i }).click();
    await expect(page.getByText(/Parts in plain words/i)).toBeVisible();
    await page.getByRole("button", { name: /Got it/i }).click();
    await page.getByRole("button", { name: /Start/i }).click();
    await expect(page.getByRole("heading", { name: /What kind of part/i })).toBeVisible();
  });

  test("CONTROL_MATRIX wizard step 1 search and tiles", async ({ page }) => {
    await prepareAddPartsScreen(page, false);
    await page.getByRole("button", { name: /Start/i }).click();
    await page.getByPlaceholder(/Search part types/i).fill("brake");
    await page.getByRole("button", { name: "Brake pads", exact: true }).click();
    await expect(page.getByText(/Which part exactly/i)).toBeVisible();
  });

  test("light and dark live captures differ for every AP screen", async () => {
    for (const base of AP_LIVE_SHOT_BASES) {
      const lightPath = join(stitchShots, base);
      const darkPath = join(stitchShots, base.replace("-live.png", "-live-dark.png"));
      expect(fileHash(lightPath), `${base} light/dark identical`).not.toBe(fileHash(darkPath));
    }
  });
});
