/**
 * Log service positions — Slice A done-tests 1, 2, 3, 6, 7 (docs/log-service-parts-gaps-audit.md section 5)
 * on the real local stack. Nothing faked: real Fleet app, real fleet-ops routes, real local database.
 *
 * Start `pnpm testcopy`, then:
 * FLEET_BASE_URL=http://127.0.0.1:5181 node node_modules/@playwright/test/cli.js test e2e/fleet-log-service-positions.spec.ts \
 *   --project=fleet --reporter=list --max-failures=1 --retries=0
 *
 * Done-tests 4 and 5 (old lines re-save unchanged; no positions key when untouched) are proven in
 * supabase/tests/log_service_positions_checks.sql and positionChips.test.ts (positionsForWire).
 */
import { expect, test, type Page } from "@playwright/test";
import {
  attachMaintenanceNoLiveGuard,
  getMaintenanceNoLiveHits,
  MD_DISC_PASSWORD,
  seedMaintenanceDiscountFleetSession,
} from "./helpers/maintenanceDiscountDoneTestAuth";
import {
  applyMaintenanceDiscountDoneSeed,
  MD_DISC_ORG,
  MD_DISC_OWNER_EMAIL,
  MD_DISC_PLATE,
  MD_DISC_VEHICLE_ID,
  queryMaintenanceDiscountDb,
  teardownMaintenanceDiscountDone,
} from "./helpers/maintenanceDiscountDoneTestDb";
import { getLocalSupabaseKeys, signInPlatformAal2 } from "./helpers/mmP01Auth";

function sql(q: string): string {
  return queryMaintenanceDiscountDb(q)
    .split(/\r?\n/)
    .filter((l) => !/^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SET|CREATE \w+|DROP \w+|DO)$/.test(l.trim()))
    .join("\n")
    .trim();
}

const ITEMS = "feature_flag:service_items";
const FINDINGS = "feature_flag:inspection_findings";
const GAPS = "feature_flag:log_service_parts_gaps";
const FLAGS = [ITEMS, FINDINGS, GAPS];
const FLAG_CACHE_WAIT_MS = 31_000;
const saved: Record<string, string | null> = {};

function setFlag(key: string, on: boolean) {
  const value = JSON.stringify({ enabled: false, enabledForOrgs: on ? [MD_DISC_ORG] : [], updatedAt: new Date().toISOString() });
  sql(`
    INSERT INTO public.kv_store_37f42386 (key, value) VALUES ('${key}', '${value}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`);
}

type Job = { id: string; name: string; code: string };
const job = (name: string): Job => {
  const row = sql(`
    SELECT id || '|' || name || '|' || code FROM public.maintenance_service_categories
    WHERE kind = 'component' AND name = '${name}' AND coalesce(status, 'active') = 'active' LIMIT 1`);
  const [id, n, code] = row.split("|");
  if (!id) throw new Error(`job not found: ${name}`);
  return { id, name: n, code };
};

let o2: Job;
let tire: Job;
let insp: Job;

async function authUserId(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.includes("auth-token")) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "{}") as { user?: { id?: string } };
        if (parsed.user?.id) return parsed.user.id;
      } catch {
        /* next */
      }
    }
    return "";
  });
}

async function api() {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const { access_token } = await signInPlatformAal2(base, anonKey, MD_DISC_OWNER_EMAIL, MD_DISC_PASSWORD);
  const url = `${base}/functions/v1/fleet-ops`;
  return async (method: string, path: string) => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { apikey: anonKey, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
}

/** A saved draft holding one job: the wizard opens on Review, then Edit opens that job's details. */
async function openJobFromDraft(page: Page, j: Job, amount: number) {
  const userId = await authUserId(page);
  expect(userId).toBeTruthy();
  await page.evaluate(
    ({ userId, vehicleId, line }) => {
      localStorage.setItem(
        `roam:fleet:log-service-draft:${userId}:${vehicleId}`,
        JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          step: "review",
          formMeta: {
            date: new Date().toISOString().slice(0, 10),
            type: line.categoryName,
            currency: "JMD",
            odo: 198900,
            provider: "Northside Auto",
            notes: "",
            invoiceUrl: "",
          },
          lines: [line],
          logMode: "quick_job",
          selectedPackageId: null,
          selectedSystemId: null,
          selectedCategoryIds: [],
          idempotencyKey: crypto.randomUUID(),
          anomalyAcknowledged: false,
          discountAmount: 0,
          discountRowOpen: false,
        }),
      );
    },
    {
      userId,
      vehicleId: MD_DISC_VEHICLE_ID,
      line: {
        categoryId: j.id,
        categoryCode: j.code,
        categoryName: j.name,
        action: j.id === insp?.id ? "inspect" : "replace",
        labor: amount,
        values: { cost_mode: "total", service_amount: amount },
      },
    },
  );
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Log service$/i }).click();
  const carPicker = page.getByRole("heading", { name: /which car/i });
  const review = page.getByTestId("log-service-review-summary");
  await expect(carPicker.or(review)).toBeVisible({ timeout: 30_000 });
  if (await carPicker.isVisible()) {
    await page.getByPlaceholder(/search plate/i).fill(MD_DISC_PLATE);
    await page.getByText(MD_DISC_PLATE, { exact: false }).first().click();
    await page.getByRole("button", { name: /continue/i }).click();
  }
  await expect(review).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("log-service-review-job").filter({ hasText: j.name }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByTestId("log-service-job-header")).toContainText(j.name, { timeout: 30_000 });
  // The group's answer (which carries the switches) arrives just after the form opens.
  await page.waitForTimeout(2000);
}

async function fillJobAmount(page: Page, amount: string) {
  const service = page.locator("#service-amount");
  if (await service.isVisible().catch(() => false)) return service.fill(amount);
  const labor = page.locator("#cat-field-labor");
  if (await labor.isVisible().catch(() => false)) return labor.fill(amount);
  await page.locator("#labor-hours").fill("1");
  await page.locator("#labor-rate").fill(amount);
}

const saveLine = (page: Page) => page.getByRole("button", { name: /^Save line/ }).first();

async function logIt(page: Page) {
  await page.getByRole("button", { name: /^Log service$/i }).click();
  await expect(page.getByTestId("log-service-review-summary")).toBeHidden({ timeout: 60_000 });
}

function latestLine(jobId: string): string {
  return sql(`
    SELECT coalesce(array_to_string(l.positions, ','), '<null>') FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE wo.vehicle_id = '${MD_DISC_VEHICLE_ID}' AND l.component_id = '${jobId}' AND l.voided_at IS NULL
    ORDER BY l.created_at DESC LIMIT 1`);
}

async function gotoHub(page: Page) {
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Fleet Log service positions (Slice A)", () => {
  test.beforeAll(() => {
    teardownMaintenanceDiscountDone();
    applyMaintenanceDiscountDoneSeed();
    for (const k of FLAGS) saved[k] = sql(`SELECT value::text FROM public.kv_store_37f42386 WHERE key = '${k}'`) || null;
    o2 = job("Oxygen sensor");
    tire = job("Tire Change");
    try {
      insp = job("Inspection / diagnostic fee");
    } catch {
      insp = job("Leak Inspection");
    }
  });

  test.afterAll(() => {
    for (const k of FLAGS) {
      if (saved[k]) sql(`UPDATE public.kv_store_37f42386 SET value = '${saved[k]}'::jsonb WHERE key = '${k}'`);
      else sql(`DELETE FROM public.kv_store_37f42386 WHERE key = '${k}'`);
    }
    teardownMaintenanceDiscountDone();
  });

  test.beforeEach(async ({ page }) => {
    attachMaintenanceNoLiveGuard(page);
    await seedMaintenanceDiscountFleetSession(page);
    await page.goto("/");
    await page.getByText(/Loading application/).waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
  });

  test.afterEach(() => {
    const hits = getMaintenanceNoLiveHits();
    if (hits.length) throw new Error(`Must not call live Supabase:\n${hits.slice(0, 10).join("\n")}`);
  });

  test("done-test 7 — switch off: Oxygen sensor has no chips and saves with no position", async ({ page }) => {
    setFlag(ITEMS, true);
    setFlag(FINDINGS, true);
    setFlag(GAPS, false);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    await openJobFromDraft(page, o2, 4000);
    await expect(page.getByTestId("where-on-car")).toHaveCount(0);
    await fillJobAmount(page, "4000");
    await expect(saveLine(page)).toBeEnabled();
    await saveLine(page).click();
    await expect(page.getByTestId("log-service-review-summary")).toBeVisible({ timeout: 30_000 });
    await logIt(page);
    expect(["<null>", ""]).toContain(latestLine(o2.id));
    // Delete this service so the history check below opens the one with a position.
    sql(`UPDATE public.maintenance_work_orders SET voided_at = now()
         WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND voided_at IS NULL`);
  });

  test("done-tests 1 + 6 — Oxygen sensor: chips, Save line waits, Front saved and shown in words", async ({ page }) => {
    setFlag(GAPS, true);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    await openJobFromDraft(page, o2, 5000);

    const where = page.getByTestId("where-on-car");
    await expect(where).toBeVisible({ timeout: 30_000 });
    for (const label of ["Front (Air fuel ratio sensor)", "Rear (Oxygen sensor No.2)", "Not sure"]) {
      await expect(where.getByRole("button", { name: label })).toBeVisible();
    }
    await expect(where).toContainText("Pick where on the car. Tap Not sure if the paper doesn't say.");
    await fillJobAmount(page, "5000");
    await expect(saveLine(page)).toBeDisabled();
    await expect(page.getByTestId("pick-where-first")).toHaveText("Pick where on the car first");

    await where.getByRole("button", { name: "Front (Air fuel ratio sensor)" }).click();
    await expect(where.getByRole("button", { name: "Front (Air fuel ratio sensor)" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("pick-where-first")).toHaveCount(0);
    await expect(saveLine(page)).toBeEnabled();
    await saveLine(page).click();

    await expect(page.getByTestId("review-where-on-car")).toHaveText("Where on the car: Front (Air fuel ratio sensor)", {
      timeout: 30_000,
    });
    await logIt(page);
    expect(latestLine(o2.id)).toBe("before_cat");
    // The service read gives each line its job's position type (Server round, LS-07).
    const woId = sql(`SELECT id FROM public.maintenance_work_orders
                      WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`);
    const read = await (await api())("GET", `/maintenance-work-orders/${woId}`);
    const readLine = ((read.json.item as { lines?: Array<Record<string, unknown>> })?.lines ?? []).find(
      (l) => l.categoryId === o2.id,
    );
    expect(readLine?.positions).toEqual(["before_cat"]);
    expect(readLine?.positionScheme).toBe("before_after_catalyst");
    // Gate 5: a non-wheel position never moves a schedule — no wheel position in the ledger for this job.
    expect(
      sql(`SELECT count(*) FROM public.maintenance_service_ledger
           WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND category_id = '${o2.id}' AND position IS NOT NULL`),
    ).toBe("0");

    // Done-test 6: Service history → View service reads "Oxygen sensor · Front (Air fuel ratio sensor)".
    await gotoHub(page);
    await page.getByRole("tab", { name: /service history/i }).click();
    const row = page.getByTestId("service-history-job").filter({ hasText: o2.name }).first();
    const groupRow = page.getByRole("row").filter({ hasText: o2.name }).first();
    await expect(groupRow.or(row).first()).toBeVisible({ timeout: 30_000 });
    if (!(await row.isVisible().catch(() => false))) await groupRow.click();
    await row.getByRole("button", { name: "View service" }).click();
    await expect(page.getByTestId("service-details-job").filter({ hasText: o2.name }).first()).toHaveText(
      `${o2.name} · Front (Air fuel ratio sensor)`,
      { timeout: 30_000 },
    );
  });

  test("done-test 2 — Tire Change: four wheel buttons, no Not sure, saves with none picked", async ({ page }) => {
    await openJobFromDraft(page, tire, 6000);
    await expect(page.getByTestId("where-on-car")).toHaveCount(0);
    for (const w of ["LF", "RF", "LR", "RR"]) await expect(page.getByRole("button", { name: w, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Not sure" })).toHaveCount(0);
    // No wheel picked: Save line does not wait (wheel jobs stay optional, exactly as today).
    await expect(saveLine(page)).toBeEnabled();
    await expect(page.getByTestId("pick-where-first")).toHaveCount(0);
  });

  test("done-test 3 — found row: chips under the name, Front saved, Log it now opens with Front picked", async ({ page }) => {
    await openJobFromDraft(page, insp, 8000);
    const section = page.getByTestId("found-work-section");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("found-add-job").click();
    const picker = page.getByTestId("found-picker");
    await picker.getByTestId("found-picker-search").fill("oxygen");
    await picker.getByTestId("found-picker-row").filter({ hasText: o2.name }).first().getByTestId("found-picker-add").click();
    await expect(picker).toBeHidden();

    const foundRow = page.getByTestId("found-work-row").filter({ hasText: o2.name });
    const where = foundRow.getByTestId("found-where-on-car");
    await expect(where).toBeVisible();
    await expect(saveLine(page)).toBeDisabled();
    await where.getByRole("button", { name: "Front (Air fuel ratio sensor)" }).click();
    await expect(saveLine(page)).toBeEnabled();
    await saveLine(page).click();
    // The saved inspection collapses to one row; then on to Review.
    await expect(page.getByTestId("found-collapsed-row")).toContainText("1 found, not done yet", { timeout: 15_000 });
    await page.getByRole("button", { name: /continue to review/i }).click();
    await expect(page.getByTestId("log-service-review-summary")).toBeVisible({ timeout: 30_000 });
    await logIt(page);

    // Saved on the found line, J$ 0 (inspection gate 6), and returned by the found list.
    expect(
      sql(`SELECT array_to_string(l.positions, ',') || '|' || l.line_total FROM public.maintenance_work_order_lines l
           JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
           WHERE wo.vehicle_id = '${MD_DISC_VEHICLE_ID}' AND l.component_id = '${o2.id}' AND l.recommended AND l.voided_at IS NULL
           ORDER BY l.created_at DESC LIMIT 1`),
    ).toBe("before_cat|0.00");
    const call = await api();
    const list = await call("GET", `/maintenance-found-work?vehicleId=${encodeURIComponent(MD_DISC_VEHICLE_ID)}`);
    const item = (list.json.items as Array<{ jobId: string; positions?: string[] }>).find((i) => i.jobId === o2.id);
    expect(item?.positions).toEqual(["before_cat"]);

    // Log it now → the job opens with Front already picked.
    await gotoHub(page);
    await page.getByRole("row").filter({ hasText: MD_DISC_PLATE }).first().getByTestId("found-to-do-chip").click();
    const drawer = page.getByTestId("found-by-inspection");
    await expect(drawer).toBeVisible({ timeout: 30_000 });
    await drawer.getByTestId("found-card").filter({ hasText: o2.name }).getByTestId("found-log-it-now").click();
    const odo = page.locator("#svc-odo");
    await expect(odo).toBeVisible({ timeout: 30_000 });
    await odo.fill("199100");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByTestId("log-service-job-header")).toContainText(o2.name, { timeout: 30_000 });
    await expect(
      page.getByTestId("where-on-car").getByRole("button", { name: "Front (Air fuel ratio sensor)" }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  });
});
