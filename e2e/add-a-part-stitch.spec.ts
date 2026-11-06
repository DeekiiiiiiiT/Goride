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
  assertPartsDatabaseButtonsHaveBorderOrFill,
  assertCancelOverlayButtonStyling,
  installPartsImportAreasMock,
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

function cancelOverlayShotPath(dark: boolean) {
  return join(stitchShots, dark ? "add_parts_cancel_overlay-live-dark.png" : "add_parts_cancel_overlay-live.png");
}

async function openCancelOverlayFromWizardDetails(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Start/i }).click();
  await selectPartTypeAndOpenDetails(page, "Brake pads");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Cancel adding this part?" });
  await expect(dialog).toBeVisible();
  const panel = page.locator('[data-slot="alert-dialog-content"]').last();
  await expect(panel).toBeVisible();
  await page.waitForTimeout(350);
  return dialog;
}

async function fillPartDetails(page: import("@playwright/test").Page) {
  await page.locator('label:has-text("Brand")').locator("..").locator("input").fill("MK Kashiyama");
  await page.locator('label:has-text("Part number")').locator("..").locator("input").fill("D0051MH");
  await page.getByRole("button", { name: /No — another brand/i }).click();
  await page.getByRole("radio", { name: /Part maker's own catalogue/i }).check();
  await page.locator('label:has-text("Source page link")').locator("..").locator("input").fill("https://example.com/src");
}

async function selectPartTypeAndOpenDetails(page: import("@playwright/test").Page, typeName: string) {
  await page.getByRole("button", { name: typeName, exact: true }).click();
  const next = page.getByRole("button", { name: /Next: How it fits/i });
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await next.scrollIntoViewIfNeeded();
  await next.click();
}

async function wizardNext(page: import("@playwright/test").Page, label: RegExp) {
  await page.getByRole("button", { name: label }).click();
}

async function scrollCaptureToBottom(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(300);
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
      await page.getByRole("button", { name: /Got it, back to adding parts/i }).click();
      await assertNoForbidden(page, AP_FORBIDDEN);
      await page.screenshot({ path: shotPath("add_parts_home_ap1-live.png", dark), fullPage: true });
    });

    test(`AP2 type picker ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await page.getByRole("button", { name: "Brake pads", exact: true }).click();
      await expect(page.getByRole("heading", { name: /What kind of part/i })).toBeVisible();
      await expect(page.getByText("Selected classification:", { exact: false }).first()).toBeVisible();
      await page.screenshot({ path: shotPath("add_parts_step_1_part_type_picker_ap2-live.png", dark), fullPage: true });
    });

    test(`AP3 part details ${theme}`, async ({ page }) => {
      await gotoAddParts(page);
      await page.getByRole("button", { name: /Start/i }).click();
      await selectPartTypeAndOpenDetails(page, "Brake pads");
      await fillPartDetails(page);
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
      await selectPartTypeAndOpenDetails(page, "Brake pads");
      await fillPartDetails(page);
      await wizardNext(page, /Next: How it fits/i);
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
      await selectPartTypeAndOpenDetails(page, "Oil filter");
      await fillPartDetails(page);
      await wizardNext(page, /Next: How it fits/i);
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
      await selectPartTypeAndOpenDetails(page, "Wiper blades");
      await fillPartDetails(page);
      await wizardNext(page, /Next: How it fits/i);
      await expect(page.getByText("Length", { exact: true })).toBeVisible();
      await page.screenshot({
        path: shotPath("add_parts_step_2c_by_size_or_spec_wiper_blades_spec_types-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP7 replaces OE ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await selectPartTypeAndOpenDetails(page, "Brake pads");
      await fillPartDetails(page);
      await wizardNext(page, /Next: How it fits/i);
      await wizardNext(page, /Next: replaces \(optional\)/i);
      await page.getByRole("combobox").first().selectOption("Toyota");
      await page.getByPlaceholder("04465-B1190").fill("04465-B1190");
      await page.getByRole("button", { name: /Add another factory number/i }).click();
      await expect(page.getByText(/more car/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Replaces a factory number/i)).toBeVisible();
      await scrollCaptureToBottom(page);
      await page.screenshot({
        path: shotPath("add_parts_step_3_replaces_factory_number_ap7-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP8 review ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await selectPartTypeAndOpenDetails(page, "Brake pads");
      await fillPartDetails(page);
      await wizardNext(page, /Next: How it fits/i);
      await page.getByPlaceholder(/Make, model or chassis/i).fill("Toyota");
      await expect(page.getByText("Same body:")).toBeVisible({ timeout: 10_000 });
      await page.getByTitle("Select all in group").check();
      const frontAxle = page.getByRole("button", { name: "Front Axle" });
      if (await frontAxle.isVisible()) await frontAxle.click();
      await wizardNext(page, /Next: replaces \(optional\)/i);
      await page.getByPlaceholder("04465-B1190").fill("04465-B1190");
      await page.getByRole("button", { name: /Add another factory number/i }).click();
      await wizardNext(page, /Next: Review in plain words/i);
      await expect(page.getByText("Check it reads right")).toBeVisible();
      await expect(page.getByText(/brake pad set/i)).toBeVisible();
      await assertStitchHeadings(page, "add_parts_step_4_review_and_save_ap8.html", page.locator(".parts-database-stitch").first());
      await assertAddPartsTheme(page, dark);
      await scrollCaptureToBottom(page);
      await page.screenshot({
        path: shotPath("add_parts_step_4_review_and_save_ap8-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP9 saved ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: /Start/i }).click();
      await selectPartTypeAndOpenDetails(page, "Brake pads");
      await fillPartDetails(page);
      await wizardNext(page, /Next: How it fits/i);
      await wizardNext(page, /Next: replaces \(optional\)/i);
      await wizardNext(page, /Next: Review in plain words/i);
      await page.getByRole("button", { name: /Save part/i }).click();
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

    test(`AP11 states gallery ${theme}`, async ({ page }) => {
      await gotoAddParts(page, "?addPartsStates=1");
      await applyAddPartsTheme(page, dark);
      await assertAddPartsTheme(page, dark);
      await expect(page.getByText(/states & exceptions/i)).toBeVisible();
      await page.screenshot({ path: shotPath("add_parts_states_exceptions_ap11-live.png", dark), fullPage: true });
    });

    test(`AP12 position spec frame ${theme}`, async ({ page }) => {
      await gotoAddParts(page, "?addPartsPositionCatalog=1");
      await applyAddPartsTheme(page, dark);
      await assertAddPartsTheme(page, dark);
      await expect(page.getByText(/Position & spec component catalog/i)).toBeVisible();
      await page.screenshot({
        path: shotPath("add_parts_position_spec_frames_for_all_types_ap12-live.png", dark),
        fullPage: true,
      });
    });

    test(`AP13 part types owner ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await page.getByRole("button", { name: "Part types" }).click();
      await expect(page.getByRole("heading", { name: "Part types" })).toBeVisible();
      const catalogList = page.getByRole("heading", { name: "Catalog types" }).locator("..");
      await catalogList.getByRole("button", { name: /Shock absorber/i }).click();
      await expect(page.getByRole("heading", { name: "Edit part type" })).toBeVisible();
      await page.locator("h3", { hasText: "Requests queue" }).locator("..").getByRole("button", { name: "Create part type" }).first().click();
      await expect(page.getByRole("heading", { name: "Create from request" })).toBeVisible();
      await page.screenshot({ path: shotPath("part_types_owner_settings_screen_13-live.png", dark), fullPage: true });
    });

    test(`Cancel overlay styling ${theme}`, async ({ page }) => {
      await prepareAddPartsScreen(page, dark);
      await openCancelOverlayFromWizardDetails(page);
      await assertCancelOverlayButtonStyling(page, dark);
      await page.locator('[data-slot="alert-dialog-content"]').last().screenshot({ path: cancelOverlayShotPath(dark) });
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

  test("CONTROL_MATRIX wizard cancel confirm dialog", async ({ page }) => {
    page.on("dialog", () => {
      throw new Error("Native browser dialog must not appear");
    });
    await prepareAddPartsScreen(page, false);
    await page.getByRole("button", { name: /Start/i }).click();
    await selectPartTypeAndOpenDetails(page, "Brake pads");
    await fillPartDetails(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Cancel adding this part?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Nothing will be saved.")).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('label:has-text("Brand")').locator("..").locator("input")).toHaveValue("MK Kashiyama");
    await expect(page.locator('label:has-text("Part number")').locator("..").locator("input")).toHaveValue("D0051MH");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel part" }).click();
    await expect(page.getByRole("button", { name: /Start/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What kind of part/i })).toHaveCount(0);
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
    await page.getByRole("button", { name: /Next: How it fits/i }).click();
    await expect(page.getByText(/Which part exactly/i)).toBeVisible();
  });

  test("CONTROL_MATRIX AP8 AP11 AP12 action buttons", async ({ page }) => {
    await prepareAddPartsScreen(page, false);
    await page.getByRole("button", { name: /Start/i }).click();
    await selectPartTypeAndOpenDetails(page, "Brake pads");
    await fillPartDetails(page);
    await wizardNext(page, /Next: How it fits/i);
    await page.getByPlaceholder(/Make, model or chassis/i).fill("Toyota");
    await expect(page.getByText("Same body:")).toBeVisible({ timeout: 10_000 });
    await page.getByTitle("Select all in group").check();
    const frontAxle = page.getByRole("button", { name: "Front Axle" });
    if (await frontAxle.isVisible()) await frontAxle.click();
    await wizardNext(page, /Next: replaces \(optional\)/i);
    await wizardNext(page, /Next: Review in plain words/i);
    await expect(page.getByText("Check it reads right")).toBeVisible();
    await expect(page.getByText(/Union O-104-MOCK/i)).toBeVisible();
    await expect(page.getByText(/WB-525-MOCK/i)).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page.getByText(/Which part exactly/i)).toBeVisible();
    await wizardNext(page, /Next: How it fits/i);
    await wizardNext(page, /Next: replaces \(optional\)/i);
    await wizardNext(page, /Next: Review in plain words/i);
    await page.getByRole("button", { name: "Recently added" }).click();
    await expect(page.getByRole("button", { name: /Start/i })).toBeVisible();

    await gotoAddParts(page, "?addPartsStates=1");
    await page.getByRole("button", { name: /Audit trail \(AP11-v4\)/i }).click();
    await expect(page).toHaveURL(/page=activity-log/);
    await expect(page).toHaveURL(/filter=parts/);
    await gotoAddParts(page, "?addPartsStates=1");
    const downloadAp11 = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export test cases/i }).click();
    const ap11File = await downloadAp11;
    expect(ap11File.suggestedFilename()).toMatch(/ap11-test-cases\.json$/i);

    await gotoAddParts(page, "?addPartsPositionCatalog=1");
    await page.getByRole("button", { name: /Sync Schema v4\.8/i }).click();
    await expect(page.getByText(/Schema refreshed/i)).toBeVisible({ timeout: 10_000 });
    const downloadSpecs = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export Specs JSON/i }).click();
    const specsFile = await downloadSpecs;
    expect(specsFile.suggestedFilename()).toMatch(/add-parts-spec-schema\.json$/i);
    await page.getByRole("button", { name: /Commit Catalog Templates/i }).click();
    await expect(page.getByText(/Committed \d+ catalog template/i)).toBeVisible({ timeout: 15_000 });
  });

  test("light and dark live captures differ for every AP screen", async () => {
    for (const base of AP_LIVE_SHOT_BASES) {
      const lightPath = join(stitchShots, base);
      const darkPath = join(stitchShots, base.replace("-live.png", "-live-dark.png"));
      expect(fileHash(lightPath), `${base} light/dark identical`).not.toBe(fileHash(darkPath));
    }
  });

  test("parts database buttons have border or fill on each main tab", async ({ page }) => {
    await installPartsImportAreasMock(page);
    await page.goto("/?page=parts-catalog");
    await expect(page.locator(".parts-database-stitch")).toBeVisible({ timeout: 20_000 });
    await assertPartsDatabaseButtonsHaveBorderOrFill(page);

    await page.getByRole("navigation", { name: "Database sections" }).getByRole("button", { name: "Full database" }).click();
    await expect(page.getByText(/Master catalog|Full database/i).first()).toBeVisible({ timeout: 15_000 });
    await assertPartsDatabaseButtonsHaveBorderOrFill(page);

    await page.getByRole("navigation", { name: "Database sections" }).getByRole("button", { name: "Add parts" }).click();
    await expect(page.getByRole("heading", { name: "Add parts" })).toBeVisible({ timeout: 15_000 });
    await assertPartsDatabaseButtonsHaveBorderOrFill(page);

    await page.getByRole("button", { name: /Bulk upload \(advanced\)/i }).click();
    await expect(page.getByText(/Back to Add parts/i)).toBeVisible({ timeout: 15_000 });
    await assertPartsDatabaseButtonsHaveBorderOrFill(page);

    await page.getByRole("button", { name: /Back to Add parts/i }).click();
    await page.getByRole("button", { name: "Part types" }).click();
    await expect(page.getByRole("heading", { name: "Part types" })).toBeVisible({ timeout: 15_000 });
    await assertPartsDatabaseButtonsHaveBorderOrFill(page);
  });
});
