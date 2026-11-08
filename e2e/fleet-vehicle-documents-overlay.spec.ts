/**
 * Fleet vehicle Profile → Documents overlay (mm-f01 / 5179KZ).
 * Prereq: local Supabase + mm_f01_http_seed + fleet dev:testcopy :5181
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  MM_F01_PLATE_5179,
  applyMmF01HttpSeed,
  applyVehicleDocumentsOverlaySeed,
  resetVehicleDocumentsOverlaySeed,
  seedMmF01Session,
} from "./helpers/mmF01Auth";

const shotsDir = join(process.cwd(), "docs", "stitch", "fleet-vehicle-documents", "screenshots");
mkdirSync(shotsDir, { recursive: true });

const DOC_IDS = ["reg-cert", "fitness-cert", "valuation-report", "insurance-policy"] as const;

async function signInFleet(page: Page, dark = false) {
  await page.addInitScript((useDark) => {
    localStorage.setItem("preference_dark_mode", useDark ? "true" : "false");
    if (useDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, dark);
  await seedMmF01Session(page);
}

async function openVehicleDocuments(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/vehicles");
  const row = page.locator("tr").filter({ hasText: MM_F01_PLATE_5179 });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: /View Details/i }).click();
  await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Profile" }).click();
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page.getByTestId("vehicle-documents-list")).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Fleet vehicle document overlay", () => {
  test.beforeAll(() => {
    applyMmF01HttpSeed();
    applyVehicleDocumentsOverlaySeed();
  });

  test.afterAll(() => {
    resetVehicleDocumentsOverlaySeed();
  });

  test("documents list, overlays, dedupe, badges", async ({ page }) => {
    await signInFleet(page, false);
    await openVehicleDocuments(page);

    for (const id of DOC_IDS) {
      await expect(page.getByTestId(`vehicle-document-row-${id}`)).toBeVisible();
    }

    await expect(page.getByTestId("vehicle-documents-list").locator("[data-testid^=vehicle-document-row-]")).toHaveCount(4);

    await expect(page.getByTestId("vehicle-document-badge-reg-cert")).toContainText(/Expired on/i);
    await expect(page.getByTestId("vehicle-document-badge-fitness-cert")).toHaveText("Expires soon");

    for (const id of DOC_IDS) {
      await page.getByTestId(`vehicle-document-view-${id}`).click();
      const dialog = page.getByTestId("vehicle-document-details-dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId("vehicle-document-details-fields")).toBeVisible();
      if (id === "reg-cert") {
        await expect(dialog.getByTestId("vehicle-document-details-status")).toContainText(/Expired on/i);
        await expect(dialog.getByTestId("vehicle-document-details-status")).not.toHaveText(/^Verified$/);
        await expect(dialog.getByText("LA-5179-TEST")).toBeVisible();
      }
      if (id === "fitness-cert") {
        await expect(dialog.getByTestId("vehicle-document-details-status")).toHaveText("Expires soon");
        await expect(dialog.getByText("1500 cc")).toBeVisible();
      }
      if (id === "valuation-report") {
        await expect(dialog.getByText(/J\$2,500,000/)).toBeVisible();
      }
      if (id === "insurance-policy") {
        await expect(dialog.getByText("POL-NEW-2026")).toBeVisible();
        await expect(dialog.getByText("POL-OLD-DUPLICATE")).toHaveCount(0);
        await expect(dialog.getByTestId("vehicle-document-open-file")).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }

    await page.screenshot({
      path: join(shotsDir, "vehicle-documents-5179kz-light.png"),
      fullPage: true,
    });

    await page.getByTestId("vehicle-document-view-reg-cert").click();
    await expect(page.getByTestId("vehicle-document-details-dialog")).toBeVisible();
    await page.screenshot({
      path: join(shotsDir, "vehicle-document-overlay-reg-expired-light.png"),
    });
    await page.keyboard.press("Escape");

    await signInFleet(page, true);
    await openVehicleDocuments(page);
    await page.screenshot({
      path: join(shotsDir, "vehicle-documents-5179kz-dark.png"),
      fullPage: true,
    });
    await page.getByTestId("vehicle-document-view-fitness-cert").click();
    await expect(page.getByTestId("vehicle-document-details-dialog")).toBeVisible();
    await page.screenshot({
      path: join(shotsDir, "vehicle-document-overlay-fitness-soon-dark.png"),
    });
  });
});
