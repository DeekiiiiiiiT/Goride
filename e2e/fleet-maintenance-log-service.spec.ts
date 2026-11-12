/**
 * Maintenance log-service discount done-tests 1, 3, 8 (audit Rev 5).
 * Local testcopy: seeded org, session auth (no E2E_FLEET_EMAIL/PASSWORD).
 */
import { expect, test, type Page } from "@playwright/test";
import {
  attachMaintenanceNoLiveGuard,
  getMaintenanceNoLiveHits,
  seedMaintenanceDiscountFleetSession,
} from "./helpers/maintenanceDiscountDoneTestAuth";
import {
  applyMaintenanceDiscountDoneSeed,
  latestSavedServiceTotals,
  MD_DISC_PLATE,
  MD_DISC_VEHICLE_ID,
  teardownMaintenanceDiscountDone,
} from "./helpers/maintenanceDiscountDoneTestDb";

const AUDIT_LINE_TOTALS = [1000, 600, 8000, 8000] as const;

function auditDraftLines() {
  return AUDIT_LINE_TOTALS.map((material, i) => ({
    categoryId: `e2e-disc-line-${i}`,
    categoryCode: `e2e_${i}`,
    categoryName: `E2E job ${i + 1}`,
    material,
    action: "replace",
  }));
}

async function fleetAuthUserId(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.includes("auth-token")) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { user?: { id?: string } };
        if (parsed.user?.id) return parsed.user.id;
      } catch {
        /* next */
      }
    }
    return "";
  });
}

async function writeReviewDraft(
  page: Page,
  opts: { discountAmount?: number; discountRowOpen?: boolean } = {},
) {
  const userId = await fleetAuthUserId(page);
  expect(userId).toBeTruthy();
  await page.evaluate(
    ({ userId, vehicleId, lines, discountAmount, discountRowOpen }) => {
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        step: "review",
        formMeta: {
          date: new Date().toISOString().slice(0, 10),
          type: "Regular Maintenance",
          currency: "JMD",
          odo: 180000,
          provider: "E2E Test Shop",
          notes: "",
          invoiceUrl: "",
        },
        lines,
        logMode: "quick_job",
        selectedPackageId: null,
        selectedSystemId: null,
        selectedCategoryIds: [],
        idempotencyKey: crypto.randomUUID(),
        anomalyAcknowledged: false,
        discountAmount: discountAmount ?? 0,
        discountRowOpen: discountRowOpen ?? false,
      };
      localStorage.setItem(
        `roam:fleet:log-service-draft:${userId}:${vehicleId}`,
        JSON.stringify(payload),
      );
    },
    {
      userId,
      vehicleId: MD_DISC_VEHICLE_ID,
      lines: auditDraftLines(),
      discountAmount: opts.discountAmount ?? 0,
      discountRowOpen: opts.discountRowOpen ?? false,
    },
  );
}

async function gotoMaintenance(page: Page) {
  await page.goto("/");
  await page.getByText("Loading application…").waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
  await page.getByText("Loading application...").waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({
    timeout: 60_000,
  });
}

async function openLogServiceWizard(page: Page) {
  await gotoMaintenance(page);
  await page.getByRole("button", { name: /^Log service$/i }).click();
  // The test org has one car and a saved draft, so the wizard can open straight on Review.
  const carPicker = page.getByRole("heading", { name: /which car/i });
  const review = page.getByRole("heading", { name: /review and save/i });
  await expect(carPicker.or(review)).toBeVisible({ timeout: 30_000 });
  if (await carPicker.isVisible()) {
    await page.getByPlaceholder(/search plate/i).fill(MD_DISC_PLATE);
    await page.getByText(MD_DISC_PLATE, { exact: false }).first().click();
    await page.getByRole("button", { name: /continue/i }).click();
  }
}

async function expectOnReview(page: Page) {
  await expect(page.getByRole("heading", { name: /review and save/i })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Fleet maintenance log service discount", () => {
  test.beforeAll(() => {
    applyMaintenanceDiscountDoneSeed();
  });

  test.afterAll(() => {
    teardownMaintenanceDiscountDone();
  });

  test.beforeEach(async ({ page }) => {
    attachMaintenanceNoLiveGuard(page);
    await seedMaintenanceDiscountFleetSession(page);
    await page.goto("/");
    await page.getByText("Loading application…").waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
    await page.getByText("Loading application...").waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
  });

  test.afterEach(() => {
    const hits = getMaintenanceNoLiveHits();
    if (hits.length) {
      throw new Error(
        `Maintenance discount E2E must not call live Supabase:\n${hits.slice(0, 10).join("\n")}`,
      );
    }
  });

  test("done-test 3 — discount too large disables Log service", async ({ page }) => {
    await writeReviewDraft(page);
    await openLogServiceWizard(page);
    await expectOnReview(page);

    await page.getByTestId("log-service-add-discount").click();
    await page.getByTestId("log-service-discount-amount").fill("20000");
    await expect(page.getByTestId("log-service-discount-error")).toHaveText(
      "Discount can't be more than the bill.",
    );
    await expect(page.getByRole("button", { name: /^Log service$/i })).toBeDisabled();
  });

  test("done-test 8 — draft restores discount on reopen", async ({ page }) => {
    await writeReviewDraft(page, { discountAmount: 1000, discountRowOpen: true });
    await openLogServiceWizard(page);
    await expectOnReview(page);
    await expect(page.getByTestId("log-service-review-total")).toContainText("16,600");

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: /review and save/i })).toBeHidden({
      timeout: 15_000,
    });

    await openLogServiceWizard(page);
    await expectOnReview(page);
    await expect(page.getByTestId("log-service-discount-amount")).toHaveValue("1000");
    await expect(page.getByTestId("log-service-review-total")).toContainText("16,600");
  });

  test("done-test 1 — save with discount shows net total on Service history", async ({ page }) => {
    await writeReviewDraft(page);
    await openLogServiceWizard(page);
    await expectOnReview(page);

    await page.getByTestId("log-service-add-discount").click();
    await page.getByTestId("log-service-discount-amount").fill("1000");
    await expect(page.getByTestId("log-service-review-subtotal")).toContainText("17,600");
    await expect(page.getByTestId("log-service-review-discount")).toContainText("1,000");
    await expect(page.getByTestId("log-service-review-total")).toContainText("16,600");

    await page.getByRole("button", { name: /^Log service$/i }).click();
    await expect(page.getByText(/service log saved|posted to business finance/i).first()).toBeVisible({
      timeout: 90_000,
    });

    await page.getByRole("tab", { name: /service history/i }).click();
    await expect(page.getByText("Maintenance Audit Trail")).toBeVisible({ timeout: 30_000 });

    const row = page.locator("tr").filter({ hasText: MD_DISC_PLATE }).first();
    await row.click();
    await expect(page.getByTestId("service-history-discount-row")).toContainText("1,000");
    await expect(page.getByTestId("service-history-net-total-row")).toContainText("16,600");

    const db = latestSavedServiceTotals();
    expect(db.total_cost).toBe(16600);
    expect(db.discount_amount).toBe(1000);
    expect(db.record_cost).toBe(16600);
  });
});
