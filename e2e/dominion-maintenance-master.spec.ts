/**
 * Maintenance master done-test: real local stack, live-D1…D13, click log.
 * Prerequisites: supabase db + mm_p01_http_seed.sql, fleet-ops serve, admin dev/preview.
 *
 * ADMIN_BASE_URL=http://127.0.0.1:5173 node node_modules/@playwright/test/cli.js test e2e/dominion-maintenance-master.spec.ts --project=dominion-admin
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MM_P01_FIXTURE_CATALOG_ID, applyMmP01HttpSeed, seedMmP01AnalystSession, seedMmP01Session } from "./helpers/mmP01Auth";
import { resetMmP01D12Fixture } from "./helpers/mmP01D12Fixture";

const shotsDir = join(process.cwd(), "docs", "stitch", "dominion-maintenance-master", "screenshots");
mkdirSync(shotsDir, { recursive: true });

type ClickLogEntry = { screen: string; label: string; method: string; url: string; status: number };

const clickLog: ClickLogEntry[] = [];

test.describe.configure({ mode: "serial" });

test.describe("Dominion maintenance master (real stack)", () => {

  test.beforeAll(() => {
    applyMmP01HttpSeed();
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title !== "D13 phone read-only ladder") {
      await seedMmP01Session(page);
    }
    page.on("requestfinished", async (req) => {
      const url = req.url();
      if (!url.includes("/functions/v1/fleet-ops/") && !url.includes("/__sb/functions/v1/fleet-ops/")) return;
      const entry = clickLog[clickLog.length - 1];
      if (entry && !entry.status) {
        entry.method = req.method();
        entry.url = url;
        entry.status = (await req.response())?.status() ?? 0;
      }
    });
  });

  test.afterAll(() => {
    writeFileSync(join(shotsDir, "mm-done-click-log.json"), JSON.stringify(clickLog, null, 2));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(clickLog, null, 2));
  });

  async function gotoMaintenance(page: import("@playwright/test").Page, extra = "") {
    await page.goto(`/?page=maintenance-templates${extra}`);
    await expect(page.getByRole("heading", { name: /Maintenance templates/i })).toBeVisible({ timeout: 60_000 });
    await waitForMaintenanceLoaded(page);
  }

  async function waitForMaintenanceLoaded(page: import("@playwright/test").Page) {
    await expect
      .poll(async () => page.locator("tbody tr.group").count(), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(16);
  }

  async function assertNoMaintenanceErrorBanner(page: import("@playwright/test").Page) {
    await expect(page.getByText(/Invalid JWT/i)).toHaveCount(0);
    await expect(page.getByText(/Could not load maintenance master/i)).toHaveCount(0);
    const banner = page.locator(".text-error").filter({ hasText: /JWT|Could not load/i });
    await expect(banner).toHaveCount(0);
  }

  async function snap(page: import("@playwright/test").Page, id: string) {
    await assertNoMaintenanceErrorBanner(page);
    await page.screenshot({ path: join(shotsDir, `live-${id}.png`), fullPage: true });
  }

  async function clickAndLog(page: import("@playwright/test").Page, screen: string, label: string, locator: import("@playwright/test").Locator) {
    clickLog.push({ screen, label, method: "", url: "", status: 0 });
    await locator.click();
    await page.waitForTimeout(400);
  }

  test("D1 part schedules home", async ({ page }) => {
    await gotoMaintenance(page);
    await expect(page.getByText(/1[67] for everyone/i)).toBeVisible();
    await expect(page.locator("tbody tr.group").count()).resolves.toBeGreaterThanOrEqual(16);
    await expect(page.locator("tbody").getByText(/Engine|Brakes|Other/i).first()).toBeVisible();
    const activeChip = page.locator("tbody").getByText("Active").first();
    await expect(activeChip).toBeVisible();
    await snap(page, "D1");
    await clickAndLog(page, "D1", "Review list tab", page.getByRole("button", { name: /^Review list/i }));
    await clickAndLog(page, "D1", "Part schedules tab", page.getByRole("button", { name: /^Part schedules/i }));
    await clickAndLog(page, "D1", "Preview a car", page.getByRole("button", { name: /Preview a car/i }).first());
    await page.keyboard.press("Escape").catch(() => {});
  });

  test("D2 service packages", async ({ page }) => {
    await gotoMaintenance(page);
    await clickAndLog(page, "D2", "Service packages tab", page.getByRole("button", { name: /^Service packages/i }));
    await expect(page.locator("article.rounded-2xl")).toHaveCount(5, { timeout: 15_000 });
    await expect(page.locator("article .rounded-full").first()).toBeVisible();
    await snap(page, "D2");
    const edit = page.getByRole("button", { name: /Edit parts/i }).first();
    if (await edit.isVisible().catch(() => false)) {
      await clickAndLog(page, "D2", "Edit parts", edit);
      await page.getByRole("button", { name: /^Cancel$/i }).click();
    }
  });

  test("D3 part ladder", async ({ page }) => {
    await gotoMaintenance(page);
    await page.locator("tbody tr.group").first().click();
    await expect(page.getByText("Who gets what")).toBeVisible({ timeout: 15_000 });
    await snap(page, "D3");
    await clickAndLog(page, "D3", "Back", page.getByRole("button", { name: /Part schedules/i }));
  });

  test("D4 schedule drawer", async ({ page }) => {
    await gotoMaintenance(page);
    await clickAndLog(page, "D4", "Add schedule", page.getByRole("button", { name: /Add schedule/i }).first());
    await expect(page.getByRole("heading", { name: /Add schedule/i })).toBeVisible();
    await snap(page, "D4");
    await page.getByRole("button", { name: /^Cancel$/i }).click();
  });

  test("D5 impact dialog", async ({ page }) => {
    await gotoMaintenance(page);
    await clickAndLog(page, "D5", "Add schedule", page.getByRole("button", { name: /Add schedule/i }).first());
    const drawer = page.locator("aside").filter({ has: page.getByRole("heading", { name: /Add schedule/i }) });
    await drawer.locator("select").first().selectOption({ index: 1 });
    await drawer.locator('input[type="number"]').first().fill("12000");
    await drawer.locator('input[type="number"]').nth(1).fill("12");
    await drawer.getByRole("button", { name: /Make active/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/Roam Fleet car/i)).toBeVisible();
    await expect(dialog.getByText(/→/)).toBeVisible();
    await snap(page, "D5");
    await clickAndLog(page, "D5", "Cancel impact", dialog.getByRole("button", { name: /Cancel/i }));
  });

  test("D6 package drawer", async ({ page }) => {
    await gotoMaintenance(page);
    await page.getByRole("button", { name: /^Service packages/i }).click();
    const edit = page.getByRole("button", { name: /Edit parts/i }).first();
    await edit.click();
    await expect(page.getByText(/Edit package/i)).toBeVisible();
    await snap(page, "D6");
    await page.getByRole("button", { name: /^Cancel$/i }).click();
  });

  test("D7 part types", async ({ page }) => {
    await gotoMaintenance(page);
    await clickAndLog(page, "D7", "Part types tab", page.getByRole("button", { name: /^Part types/i }));
    await expect(page.getByText(/\d+ part types/i)).toBeVisible({ timeout: 15_000 });
    await snap(page, "D7");
  });

  test("D7b retire dialog", async ({ page }) => {
    await gotoMaintenance(page);
    await page.getByRole("button", { name: /^Part types/i }).click();
    const retire = page.getByRole("button", { name: /^Retire$/i }).first();
    if (await retire.isVisible().catch(() => false)) {
      await retire.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: /Retire/i })).toBeVisible();
      await snap(page, "D7b");
      await dialog.getByRole("button", { name: /^Cancel$/i }).click();
    } else {
      await snap(page, "D7b");
    }
  });

  test("D8 review list", async ({ page }) => {
    await gotoMaintenance(page);
    await clickAndLog(page, "D8", "Review list", page.getByRole("button", { name: /^Review list/i }));
    await snap(page, "D8");
  });

  test("D9 preview a car", async ({ page }) => {
    await gotoMaintenance(page);
    await page.getByRole("button", { name: /Preview a car/i }).first().click();
    await expect(page.getByRole("heading", { name: /Preview a car/i })).toBeVisible();
    const search = page.getByPlaceholder(/Search catalog car/i);
    await search.fill(MM_P01_FIXTURE_CATALOG_ID);
    await expect(page.getByText(/FxToyota|FxRoomy|Fx-M900A/i)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => page.locator("table tbody tr").count(), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: /Export breakdown/i })).toBeVisible();
    await snap(page, "D9");
    await page.getByLabel("Close").click().catch(() => page.keyboard.press("Escape"));
  });

  test("D10 history", async ({ page }) => {
    await gotoMaintenance(page);
    await clickAndLog(page, "D10", "History tab", page.getByRole("button", { name: /^History/i }));
    await expect(page.getByText(/Roam setup|added:|retired:/i).first()).toBeVisible({ timeout: 30_000 });
    await snap(page, "D10");
    const exportBtn = page.getByRole("button", { name: /Export CSV/i });
    if (await exportBtn.isVisible()) await clickAndLog(page, "D10", "Export CSV", exportBtn);
  });

  test("D11 data quality health card", async ({ page }) => {
    await page.goto("/?page=catalog-quality");
    await expect(page.getByRole("heading", { name: /Data Quality/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /Service schedules/i })).toBeVisible({ timeout: 30_000 });
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: /Service schedules/i }) });
    await expect(card.locator("li")).toHaveCount(7);
    await expect(card.getByText("Cars in use with no specific schedule")).toBeVisible();
    await expect(card.getByText("Schedules by source")).toBeVisible();
    await expect(card.getByText(/Roam policy 1[5-9]/)).toBeVisible({ timeout: 15_000 });
    await assertNoMaintenanceErrorBanner(page);
    await page.screenshot({ path: join(shotsDir, "live-D11.png"), fullPage: true });
  });

  test("D12 states on real data", async ({ page }) => {
    resetMmP01D12Fixture();
    await gotoMaintenance(page);
    await page.getByRole("button", { name: /^Review list/i }).click();
    await expect(page.getByText(/Two schedules for the same cars/i).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^Part schedules/i }).click();
    await page.getByRole("button", { name: "Needs checking" }).click();
    await expect
      .poll(async () => page.locator("tbody tr.group, tbody tr").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "Retired" }).click();
    await expect(page.locator("tbody").getByText("Retired").first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Add schedule/i }).first().click();
    const drawer = page.locator("aside").filter({ has: page.getByRole("heading", { name: /Add schedule/i }) });
    const partSelect = drawer.locator("select").first();
    const oilOption = partSelect.locator("option").filter({ hasText: /Engine oil/i }).first();
    await partSelect.selectOption({ value: await oilOption.getAttribute("value") ?? "" });
    await drawer.getByRole("radio", { name: /Car maker's manual or catalogue/i }).check();
    await drawer.getByRole("button", { name: /Make active/i }).click();
    await expect(drawer.getByText(/Add the link to the page you used/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^Cancel$/i }).click();
    await page.getByRole("button", { name: /^Part schedules/i }).click();
    await page.getByRole("button", { name: "All status" }).click();
    await page.locator("tbody tr.group").filter({ hasText: /Engine oil/i }).first().click();
    await expect(page.getByText("Who gets what")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Edit$/i }).first().click();
    const editDrawer = page.locator("aside").filter({ has: page.getByRole("heading", { name: /Edit schedule/i }) });
    await editDrawer.getByRole("spinbutton", { name: /Every km/i }).fill("11000");
    await editDrawer.getByRole("spinbutton", { name: /or every months/i }).fill("11");
    await editDrawer.getByRole("button", { name: /Make active/i }).click();
    const impact = page.getByRole("dialog");
    await expect(impact.getByText(/Roam Fleet car/)).toBeVisible({ timeout: 15_000 });
    await impact.getByRole("button", { name: /Save and update cars/i }).click();
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /Saved · [1-9]\d* Roam Fleet cars updated/i }),
    ).toBeVisible({ timeout: 30_000 });
    await snap(page, "D12");
  });

  test("D13 phone read-only ladder", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedMmP01AnalystSession(page);
    await page.goto("/?page=maintenance-templates");
    await expect(page.getByRole("heading", { name: /Maintenance templates/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/look but not change schedules/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-mm-mobile-part]").first()).toBeVisible({ timeout: 60_000 });
    await page.locator("[data-mm-mobile-part]").first().click();
    await expect(page.getByText("Edit on a larger screen")).toBeVisible({ timeout: 15_000 });
    await snap(page, "D13");
  });
});
