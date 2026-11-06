/**
 * Fleet maintenance master F1–F9 (real local stack, mm_f01 seed).
 * Prerequisites: supabase stack, mm_f01_http_seed.sql, fleet-ops bundle, fleet preview :3000
 *
 * E2E_FLEET_EMAIL=mm-f01-fleet@local.test E2E_FLEET_PASSWORD=MmF01Local2026!
 */
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  MM_F01_PLATE_1505,
  MM_F01_PLATE_5179,
  applyMmF01HttpSeed,
  resetMmF01Vehicle1505OdometerFixture,
  resetMmF01Vehicle5179BrakeBaselineFixture,
  resetMmF01Vehicle5179F7Fixture,
  resetMmF01Vehicle5179F8Fixture,
  resetMmF01Vehicle5179SevereDutyFixture,
  seedMmF01Session,
  seedMmF01ViewerSession,
} from "./helpers/mmF01Auth";

const shotsDir = join(process.cwd(), "docs", "stitch", "fleet-maintenance-master", "screenshots");
mkdirSync(shotsDir, { recursive: true });

test.describe.configure({ mode: "serial" });

async function gotoMaintenance(page: import("@playwright/test").Page, query = "") {
  await page.goto(`/maintenance${query}`);
  await expect(page.getByText("Vehicle Service Ledger")).toBeVisible({ timeout: 60_000 });
}

async function waitForDueDrawerReady(page: import("@playwright/test").Page) {
  const drawer = page.getByTestId("mm-due-drawer");
  await expect(drawer).toBeVisible({ timeout: 30_000 });
  await expect(drawer).toHaveAttribute("data-state", "open", { timeout: 15_000 }).catch(() => {});
  await expect(page.getByTestId("mm-due-drawer-loaded")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("mm-due-line").first()).toBeVisible({ timeout: 30_000 });
}

async function waitForDrawerSettled(page: import("@playwright/test").Page) {
  await waitForDueDrawerReady(page);
  const drawer = page.getByTestId("mm-due-drawer");
  await expect
    .poll(
      async () => {
        const a = await drawer.boundingBox();
        await page.waitForTimeout(350);
        const b = await drawer.boundingBox();
        if (!a || !b) return false;
        return Math.abs(a.x - b.x) < 1;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function openDueDrawer5179(page: import("@playwright/test").Page, maintenanceQuery = "") {
  await gotoMaintenance(page, maintenanceQuery);
  const row = page.locator("tr").filter({ hasText: MM_F01_PLATE_5179 });
  const overdueBtn = row.getByRole("button", { name: /overdue/i });
  if (await overdueBtn.isVisible().catch(() => false)) {
    await overdueBtn.click();
  } else {
    await row.getByRole("button", { name: /View due items/i }).click();
  }
  await waitForDueDrawerReady(page);
}

async function openDueDrawer1505(page: import("@playwright/test").Page) {
  await gotoMaintenance(page);
  const row = page.locator("tr").filter({ hasText: MM_F01_PLATE_1505 });
  await row.getByRole("button", { name: /View due items/i }).click();
  await waitForDueDrawerReady(page);
}

async function assertDialogOnTop(page: import("@playwright/test").Page, testId: string, buttonName: RegExp) {
  const dialog = page.getByTestId(testId);
  await expect(dialog).toBeVisible();
  const btn = dialog.getByRole("button", { name: buttonName }).first();
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  const top = await page.evaluate(
    ({ x, y, tid }) => {
      const el = document.elementFromPoint(x + 4, y + 4);
      return el?.closest(`[data-testid="${tid}"]`) != null;
    },
    { x: box.x, y: box.y, tid: testId },
  );
  expect(top).toBe(true);
}

test.describe("Fleet maintenance master (real stack)", () => {
  test.beforeAll(() => {
    applyMmF01HttpSeed();
    resetMmF01Vehicle5179SevereDutyFixture();
  });

  test.beforeEach(async ({ page }) => {
    await seedMmF01Session(page);
  });

  test("F1 due drawer 5179KZ", async ({ page }) => {
    await openDueDrawer5179(page);
    await waitForDrawerSettled(page);
    const drawer = page.getByTestId("mm-due-drawer");
    await expect(drawer.getByText(MM_F01_PLATE_5179)).toBeVisible();
    await expect(drawer.getByText(/read 2 Nov 2026/i)).toBeVisible();
    await expect(drawer.getByTestId("mm-hard-use-chip")).toBeVisible();
    await expect(drawer.getByText("Overdue").first()).toBeVisible();
    await expect(drawer.getByText("OK").first()).toBeVisible();
    await expect(drawer.getByText(/161,952 km|161952/i)).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "live-F1.png"), fullPage: true });
  });

  test("F2 why this schedule", async ({ page }) => {
    await openDueDrawer5179(page);
    await page.getByRole("button", { name: /Why this schedule/i }).first().click();
    await expect(page.getByTestId("mm-why-schedule")).toBeVisible();
    await assertDialogOnTop(page, "mm-why-schedule", /Set custom schedule|Close/i);
    await page.screenshot({ path: join(shotsDir, "live-F2.png"), fullPage: true });
  });

  test("F3 custom schedule dialog", async ({ page }) => {
    resetMmF01Vehicle5179BrakeBaselineFixture();
    await openDueDrawer5179(page);
    const line = page.getByTestId("mm-due-line").filter({ hasText: "Brake Fluid" });
    const rfLine = page.getByTestId("mm-due-line").filter({ hasText: "Tire Change · RF" });
    const rfDueBefore = (await rfLine.textContent()) ?? "";
    await line.getByRole("button", { name: /Set custom schedule/i }).click();
    const dialog = page.getByTestId("mm-custom-schedule");
    await expect(dialog).toBeVisible();
    await assertDialogOnTop(page, "mm-custom-schedule", /Save custom schedule/i);
    await dialog.locator("#mm-custom-km").fill("999999");
    await dialog.locator("#mm-custom-reason").fill("e2e too long interval test");
    await dialog.getByRole("button", { name: /Save custom schedule/i }).click();
    await expect(page.getByText(/shorter than Roam/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mm-custom-schedule-error")).toBeVisible();
    await dialog.locator("#mm-custom-km").fill("35000");
    await dialog.locator("#mm-custom-mo").fill("18");
    await dialog.getByRole("button", { name: /Save custom schedule/i }).click();
    await expect(page.getByText(/Custom schedule saved/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mm-custom-schedule-error")).toHaveCount(0);
    await waitForDueDrawerReady(page);
    await expect(line.getByText(/Custom: every 35,000 km or 18 months/i)).toBeVisible({ timeout: 30_000 });
    await expect(line.getByText(/156,952 km/i)).toBeVisible();
    await expect(line.locator("span").filter({ hasText: /^Custom$/ })).toBeVisible();
    const lfLine = page.getByTestId("mm-due-line").filter({ hasText: "Tire Change · LF" });
    await lfLine.getByRole("button", { name: /Set custom schedule/i }).click();
    await expect(page.getByTestId("mm-custom-schedule")).toBeVisible();
    await page.locator("#mm-custom-km").fill("34000");
    await page.locator("#mm-custom-reason").fill("e2e lf only");
    await page.getByRole("button", { name: /Save custom schedule/i }).click();
    await expect(page.getByText(/Custom schedule saved/i)).toBeVisible({ timeout: 15_000 });
    await waitForDueDrawerReady(page);
    await expect(rfLine).toContainText(/163,000 km|163000/);
    expect((await rfLine.textContent()) ?? "").toMatch(/163,000 km|163000/);
    expect(rfDueBefore).toMatch(/163,000 km|163000/);
    await waitForDrawerSettled(page);
    await page.screenshot({ path: join(shotsDir, "live-F3.png"), fullPage: true });
  });

  test("F4 waiting for odometer 1505LM", async ({ page }) => {
    resetMmF01Vehicle1505OdometerFixture();
    await openDueDrawer1505(page);
    await expect(page.getByTestId("mm-odometer-banner")).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "live-F4.png"), fullPage: true });
    await page.getByTestId("mm-odometer-banner").getByRole("button", { name: /Log odometer/i }).click();
    await expect(page.getByRole("heading", { name: /Log odometer/i })).toBeVisible({ timeout: 15_000 });
    await page.locator("#odo-km").fill("88000");
    await page.getByRole("button", { name: /Save reading/i }).click();
    await expect(page.getByText(/Reading saved|saved/i)).toBeVisible({ timeout: 30_000 });
    await waitForDueDrawerReady(page);
    await expect(page.getByTestId("mm-due-line").filter({ hasText: /Due at/i }).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("F5 alerts menu open closed", async ({ page }) => {
    await gotoMaintenance(page);
    await page.getByRole("button", { name: /Maintenance alerts/i }).click();
    const menu = page.getByTestId("mm-alerts-menu");
    await expect(menu).toBeVisible();
    await expect
      .poll(async () => menu.getByTestId("mm-alert-row").count(), { timeout: 60_000 })
      .toBeGreaterThan(0);
    await expect(menu.getByText("Loading…")).toHaveCount(0);
    const open5179 = menu.getByTestId("mm-alert-row").filter({ hasText: MM_F01_PLATE_5179 });
    await expect(open5179.first()).toBeVisible();
    await page.getByText("Closed").click();
    await expect(menu.getByText(/performed/i)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: join(shotsDir, "live-F5.png"), fullPage: true });
  });

  test("F6 overview schedule column", async ({ page }) => {
    await gotoMaintenance(page);
    await expect(page.getByTestId("mm-overview-schedule-col")).toBeVisible();
    await expect(page.getByTestId("mm-overview-schedule-filters")).toBeVisible();
    await expect(page.getByRole("button", { name: "Roam policy" })).toBeVisible();
    await expect(page.locator("tr").filter({ hasText: MM_F01_PLATE_5179 })).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "live-F6.png"), fullPage: true });
  });

  test("F7 hard use dialog", async ({ page }) => {
    resetMmF01Vehicle5179F7Fixture();
    await openDueDrawer5179(page);
    const sampleLine = page.getByTestId("mm-due-line").filter({ hasText: "Brake Fluid" });
    await expect(sampleLine).toBeVisible();
    const dueBefore = (await sampleLine.textContent()) ?? "";
    await expect(page.getByTestId("mm-hard-use-chip")).toBeVisible();
    await page.getByTestId("mm-hard-use-chip").click();
    await expect(page.getByTestId("mm-hard-use-dialog")).toBeVisible();
    await assertDialogOnTop(page, "mm-hard-use-dialog", /^Save$/i);
    const toggle = page.getByTestId("mm-hard-use-dialog").getByRole("switch");
    await expect(toggle).toBeChecked();
    await toggle.click();
    await page.getByTestId("mm-hard-use-dialog").getByRole("button", { name: /^Save$/i }).click();
    await waitForDueDrawerReady(page);
    await expect(page.getByRole("button", { name: "Mark as hard use" })).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => (await sampleLine.textContent()) ?? "", { timeout: 30_000 })
      .not.toBe(dueBefore);
    await page.getByRole("button", { name: "Mark as hard use" }).click();
    await expect(page.getByTestId("mm-hard-use-dialog")).toBeVisible();
    await page.getByTestId("mm-hard-use-dialog").getByRole("switch").click();
    await page.getByTestId("mm-hard-use-dialog").getByRole("button", { name: /^Save$/i }).click();
    await waitForDueDrawerReady(page);
    await expect(page.getByTestId("mm-hard-use-chip")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => (await sampleLine.textContent()) ?? "", { timeout: 30_000 })
      .toBe(dueBefore);
    await waitForDrawerSettled(page);
    await page.screenshot({ path: join(shotsDir, "live-F7.png"), fullPage: true });
  });

  test("F8 edge needs checking chip", async ({ page }) => {
    resetMmF01Vehicle5179F8Fixture();
    await openDueDrawer5179(page);
    await expect(page.getByText("Needs checking").first()).toBeVisible();
    await expect(page.locator('[data-retired="true"]').first()).toBeVisible();
    const brakeLine = page.getByTestId("mm-due-line").filter({ hasText: "Brake Fluid" });
    await brakeLine.getByRole("button", { name: /Set custom schedule/i }).click();
    const dialog = page.getByTestId("mm-custom-schedule");
    await dialog.locator("#mm-custom-km").fill("999999");
    await dialog.locator("#mm-custom-reason").fill("e2e f8 reject");
    await dialog.getByRole("button", { name: /Save custom schedule/i }).click();
    await expect(page.getByText(/shorter than Roam/i)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await waitForDrawerSettled(page);
    await page.screenshot({ path: join(shotsDir, "live-F8.png"), fullPage: true });

    await seedMmF01ViewerSession(page);
    await page.goto("/maintenance", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Vehicle Service Ledger")).toBeVisible({ timeout: 60_000 });
    const row5179 = page.locator("tr").filter({ hasText: MM_F01_PLATE_5179 });
    const overdueBtn = row5179.getByRole("button", { name: /overdue/i });
    if (await overdueBtn.isVisible().catch(() => false)) {
      await overdueBtn.click();
    } else {
      await row5179.getByRole("button", { name: /View due items/i }).click();
    }
    await waitForDueDrawerReady(page);
    const actions = page.getByTestId("mm-due-line-actions").first();
    await expect(actions.getByRole("button", { name: /Set custom schedule/i })).toHaveCount(0);
    await expect(actions.getByRole("button", { name: /Why this schedule/i })).toBeVisible();
  });

  test("F9 phone 390px drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDueDrawer5179(page);
    await waitForDrawerSettled(page);
    await expect(page.getByText("Every —")).toHaveCount(0);
    const drawer = page.getByTestId("mm-due-drawer");
    const box = await drawer.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.x).toBeLessThanOrEqual(2);
      expect(box.width).toBeLessThanOrEqual(390 + 2);
    }
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390 + 2);
    await page.screenshot({ path: join(shotsDir, "live-F9.png"), fullPage: true });
  });
});
