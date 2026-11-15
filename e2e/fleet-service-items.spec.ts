/**
 * Service items — Fleet done-tests 20, 21, 22 (math), 24, 25, 27, 28, 31, 36 on the real local stack.
 * Nothing faked: real Fleet app, real fleet-ops routes, real local database. The only stand-ins are
 * things a test can't wait for: a Business Finance outage is a temporary database rule on the test
 * company's ledger rows, and "2 minutes passed" moves the saved time back.
 *
 * Start `pnpm testcopy`, then:
 * FLEET_BASE_URL=http://127.0.0.1:5181 node node_modules/@playwright/test/cli.js test e2e/fleet-service-items.spec.ts \
 *   --project=fleet --reporter=list --max-failures=1 --retries=0
 *
 * Screenshots go to the git-ignored test-results/service-items-fleet/ (never docs/).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
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

/** Local database only (the helper refuses anything else). Drops psql's status lines ("INSERT 0 1"…). */
function sql(q: string): string {
  return queryMaintenanceDiscountDb(q)
    .split(/\r?\n/)
    .filter((l) => !/^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SET|CREATE \w+|DROP \w+|DO)$/.test(l.trim()))
    .join("\n")
    .trim();
}

const shotsDir = join(process.cwd(), "test-results", "service-items-fleet");
mkdirSync(shotsDir, { recursive: true });

const FLAG_KEY = "feature_flag:service_items";
/** The server keeps flags for 30 s; wait that out after each switch change. */
const FLAG_CACHE_WAIT_MS = 31_000;

type Fixture = { jobId: string; jobName: string; cleanerLink: string; gasketLink: string; gasketTypeId: string; gasketName: string };
let fx: Fixture;
let savedFlag: string | null = null;

function setServiceItems(on: boolean) {
  const value = JSON.stringify({ enabled: false, enabledForOrgs: on ? [MD_DISC_ORG] : [], updatedAt: new Date().toISOString() });
  sql(`
    INSERT INTO public.kv_store_37f42386 (key, value) VALUES ('${FLAG_KEY}', '${value}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `);
}

/** Throttle Body Cleaning may need: cleaner (seeded, usually) + one gasket part type (sometimes). */
function setupFixture(): Fixture {
  const job = sql(`SELECT id || '|' || name FROM public.maintenance_service_categories WHERE code = 'throttle_body_cleaning'`);
  const [jobId, jobName] = job.split("|");
  const cleanerLink = sql(`
    SELECT ji.id FROM public.maintenance_job_item ji JOIN public.maintenance_supply s ON s.id = ji.supply_id
    WHERE ji.job_id = '${jobId}' AND ji.removed_at IS NULL AND lower(s.name) = 'throttle body cleaner' LIMIT 1`);
  sql(`DELETE FROM public.maintenance_job_item WHERE job_id = '${jobId}' AND supply_id IS NULL`);
  const pt = sql(`
    SELECT id || '|' || name FROM public.maintenance_service_categories
    WHERE kind = 'component' AND is_part IS TRUE AND coalesce(status, 'active') = 'active' AND id <> '${jobId}'
    ORDER BY (name ILIKE '%gasket%') DESC, name LIMIT 1`);
  const [gasketTypeId, gasketName] = pt.split("|");
  const gasketLink = sql(`
    INSERT INTO public.maintenance_job_item (job_id, part_type_id, need, sort_order)
    VALUES ('${jobId}', '${gasketTypeId}', 'sometimes', 20) RETURNING id`);
  if (!jobId || !cleanerLink || !gasketTypeId || !gasketLink) throw new Error(`fixture incomplete: ${job} / ${cleanerLink} / ${pt}`);
  return { jobId, jobName, cleanerLink, gasketLink, gasketTypeId, gasketName };
}

function blockBooks(on: boolean) {
  if (on) {
    sql(`
      CREATE OR REPLACE FUNCTION public.e2e_si_block_books() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.organization_id::text = '${MD_DISC_ORG}' THEN RAISE EXCEPTION 'e2e: books service down'; END IF;
        RETURN NEW;
      END $$;
      -- public.ledger_entries / fleet.ledger_entries are views over ledger.entries.
      DROP TRIGGER IF EXISTS e2e_si_block_books ON ledger.entries;
      CREATE TRIGGER e2e_si_block_books BEFORE INSERT ON ledger.entries
        FOR EACH ROW EXECUTE FUNCTION public.e2e_si_block_books();`);
  } else {
    sql(`
      DROP TRIGGER IF EXISTS e2e_si_block_books ON ledger.entries;
      DROP FUNCTION IF EXISTS public.e2e_si_block_books();`);
  }
}

async function api() {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const { access_token } = await signInPlatformAal2(base, anonKey, MD_DISC_OWNER_EMAIL, MD_DISC_PASSWORD);
  const url = `${base}/functions/v1/fleet-ops`;
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { apikey: anonKey, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
}

function jobLine(extra: Record<string, unknown> = {}) {
  return {
    categoryId: fx.jobId,
    categoryCode: "throttle_body_cleaning",
    categoryName: fx.jobName,
    action: "clean",
    labor: 3000,
    values: { cost_mode: "total", service_amount: 3000, labor: 3000 },
    ...extra,
  };
}

async function snap(page: Page, id: string, el?: Locator) {
  if (el) {
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: join(shotsDir, `live-${id}.png`) });
  } else {
    await page.screenshot({ path: join(shotsDir, `live-${id}.png`), fullPage: true });
  }
}

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

/** A saved Log service draft with Throttle Body Cleaning (J$ 3,000): the wizard opens on Review. */
async function writeDraft(page: Page, line: Record<string, unknown> = jobLine()) {
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
            type: "Throttle Body Cleaning",
            currency: "JMD",
            odo: 197486,
            provider: "Kingston Auto Care",
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
    { userId, vehicleId: MD_DISC_VEHICLE_ID, line },
  );
}

async function openWizardOnReview(page: Page, line?: Record<string, unknown>) {
  await writeDraft(page, line);
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Log service$/i }).click();
  const carPicker = page.getByRole("heading", { name: /which car/i });
  const review = page.getByRole("heading", { name: /review and save/i });
  await expect(carPicker.or(review)).toBeVisible({ timeout: 30_000 });
  if (await carPicker.isVisible()) {
    await page.getByPlaceholder(/search plate/i).fill(MD_DISC_PLATE);
    await page.getByText(MD_DISC_PLATE, { exact: false }).first().click();
    await page.getByRole("button", { name: /continue/i }).click();
  }
  await expect(review).toBeVisible({ timeout: 30_000 });
}

/** Review → Edit the job → Step 3 details. */
async function openJobDetails(page: Page, jobName: string = fx.jobName) {
  await page.getByTestId("log-service-review-job").filter({ hasText: jobName }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: /line details/i })).toBeVisible({ timeout: 30_000 });
}

function itemRow(page: Page, linkId: string) {
  return page.getByTestId(`may-need-row-${linkId}`);
}

async function logAndWait(page: Page) {
  await page.getByRole("button", { name: /^Log service$/i }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("Fleet service items", () => {
  test.beforeAll(() => {
    teardownMaintenanceDiscountDone();
    applyMaintenanceDiscountDoneSeed();
    savedFlag = sql(`SELECT value::text FROM public.kv_store_37f42386 WHERE key = '${FLAG_KEY}'`) || null;
    fx = setupFixture();
    blockBooks(false);
  });

  test.afterAll(() => {
    blockBooks(false);
    if (savedFlag) sql(`UPDATE public.kv_store_37f42386 SET value = '${savedFlag}'::jsonb WHERE key = '${FLAG_KEY}'`);
    else sql(`DELETE FROM public.kv_store_37f42386 WHERE key = '${FLAG_KEY}'`);
    // Saved items point at the May-need link, so the test company goes first.
    teardownMaintenanceDiscountDone();
    if (fx) sql(`DELETE FROM public.maintenance_job_item WHERE id = '${fx.gasketLink}'`);
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

  test("20 — switch off: no Items used block", async ({ page }) => {
    setServiceItems(false);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    await openWizardOnReview(page);
    await openJobDetails(page);
    await expect(page.locator("#service-amount")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("items-used")).toHaveCount(0);
    await expect(page.getByTestId("log-service-review-items-total")).toHaveCount(0);
  });

  test("21 + 24 + 25 — tick items, blank cost, type a part in; line total 5,000; saved and shown in history", async ({ page }) => {
    setServiceItems(true);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    await openWizardOnReview(page);
    await openJobDetails(page);

    const block = page.getByTestId("items-used");
    await expect(block).toBeVisible({ timeout: 30_000 });
    // Stitch screen 1 job card: name + action pill, Service charge block; no internal codes (6a).
    const header = page.getByTestId("log-service-job-header");
    await expect(header).toContainText(fx.jobName);
    await expect(header).not.toContainText("throttle_body_cleaning");
    await expect(page.getByText(/Bay Session/i)).toHaveCount(0);
    await expect(page.getByTestId("log-service-service-charge")).toContainText("Service charge");
    await expect(page.getByTestId("log-service-service-charge")).toContainText("No charge (free)");
    await expect(page.getByRole("heading", { name: /line details/i })).toHaveCount(1);
    // Nothing is ticked for you.
    await expect(block.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await expect(block.getByText("Usually used")).toBeVisible();
    await expect(block.getByText("Sometimes used")).toBeVisible();
    await snap(page, "01-step3-unticked", block);

    const cleaner = itemRow(page, fx.cleanerLink);
    await cleaner.getByRole("checkbox").check();
    await cleaner.getByLabel(/^Cost each — /).fill("1200");
    await cleaner.getByLabel(/^Brand — /).fill("CRC");
    await expect(cleaner.getByLabel("Quantity")).toHaveValue("1");
    await expect(cleaner).toContainText("can");
    await expect(cleaner).toContainText("J$ 1,200");

    const gasket = itemRow(page, fx.gasketLink);
    await gasket.getByRole("checkbox").check();
    await gasket.getByLabel(/^Cost each — /).fill("800");
    await gasket.getByRole("button", { name: "Pick a part" }).click();
    const picker = page.getByTestId("pick-part-dialog");
    await expect(picker.getByText("Pick a part")).toBeVisible();
    await expect(picker.getByText(/Type it in instead/)).toBeVisible({ timeout: 30_000 });
    await snap(page, "02-pick-a-part", picker);
    await picker.getByRole("button", { name: /Type it in instead/ }).click();
    await picker.getByLabel("Brand").fill("Toyota genuine");
    await picker.getByLabel(/Part number/).fill("22271-B1010");
    await picker.getByRole("button", { name: /Use this part/ }).click();
    await expect(gasket).toContainText("Toyota genuine");
    await expect(gasket.getByRole("button", { name: "Change" })).toBeVisible();

    // 24: an Other item with no cost.
    await page.getByTestId("items-used-add-other").click();
    const other = page.getByTestId("other-item-block");
    await other.getByLabel("What was it?").fill("Shop rags");
    await expect(other).toContainText("Cost not recorded");

    await expect(block.getByText("3 Selected")).toBeVisible();
    // 21: job 3,000 + cleaner 1,200 + gasket 800 = 5,000 (rags blank = 0).
    await expect(page.getByTestId("items-used-total")).toContainText("Job J$ 3,000 + items J$ 2,000 = J$ 5,000");
    await snap(page, "03-step3-ticked", block);
    await header.scrollIntoViewIfNeeded();
    await page.getByRole("dialog").screenshot({ path: join(shotsDir, "live-01-job-card-top.png") });

    // Screen 9 (phone): compact header, thin step bars, total pinned above the footer.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("log-service-step-caption")).toHaveText("Step 3 of 4 · Details");
    await expect(page.getByTestId("log-service-step-segments")).toBeVisible();
    const pinned = page.getByTestId("log-service-mobile-summary");
    await expect(pinned).toBeVisible();
    await expect(pinned).toContainText("Job J$ 3,000 + items J$ 2,000");
    await expect(pinned).toContainText("= J$ 5,000");
    await expect(page.getByTestId("items-used-total")).toBeHidden();
    await expect(cleaner.getByText("Brand (optional)")).toBeVisible();
    await page.screenshot({ path: join(shotsDir, "live-09-phone-step3.png") });
    await cleaner.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shotsDir, "live-09-phone-items.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(pinned).toBeHidden();

    await page.getByRole("button", { name: /^Save line$/ }).click();
    await expect(page.getByRole("heading", { name: /review and save/i })).toBeVisible({ timeout: 30_000 });
    const job = page.getByTestId("log-service-review-job").filter({ hasText: fx.jobName });
    await expect(job).toContainText("Throttle body cleaner · 1 can");
    await expect(job).toContainText("Shop rags · 1 piece");
    await expect(job).toContainText("Cost not recorded (excluded from total)");
    await expect(page.getByTestId("log-service-review-jobs-total")).toContainText("J$ 3,000");
    await expect(page.getByTestId("log-service-review-items-total")).toContainText("J$ 2,000");
    await expect(page.getByTestId("log-service-review-total")).toContainText("J$ 5,000");
    await snap(page, "04-review", page.getByTestId("log-service-review-jobs"));
    await snap(page, "04-review-totals", page.getByTestId("log-service-review-totals"));

    await logAndWait(page);
    await expect(page.getByText(/service log saved|posted to business finance/i).first()).toBeVisible({ timeout: 90_000 });

    const saved = sql(`
      SELECT wo.status || '|' || wo.total_cost || '|' || l.line_total || '|' || l.items_amount || '|' || count(i.id)
      FROM public.maintenance_work_orders wo
      JOIN public.maintenance_work_order_lines l ON l.work_order_id = wo.id
      LEFT JOIN public.maintenance_work_order_line_item i ON i.work_order_line_id = l.id
      WHERE wo.organization_id = '${MD_DISC_ORG}'
      GROUP BY wo.id, l.id ORDER BY wo.created_at DESC LIMIT 1`);
    expect(saved).toBe("completed|5000.00|5000.00|2000.00|3");
    const items = sql(`
      SELECT string_agg(i.item_name || ':' || coalesce(i.unit_cost::text, 'null') || ':' || coalesce(i.brand, '') || ':' || coalesce(i.part_number, ''), ',' ORDER BY i.item_name)
      FROM public.maintenance_work_order_line_item i
      JOIN public.maintenance_work_orders wo ON wo.id = i.work_order_id
      WHERE wo.organization_id = '${MD_DISC_ORG}'`);
    expect(items).toContain("Shop rags:null:");
    expect(items).toContain("Throttle body cleaner:1200.00:CRC:");
    expect(items).toContain(`${fx.gasketName}:800.00:Toyota genuine:22271-B1010`);

    await page.getByRole("tab", { name: /service history/i }).click();
    await expect(page.getByText("Maintenance Audit Trail")).toBeVisible({ timeout: 30_000 });
    await page.locator("tr").filter({ hasText: MD_DISC_PLATE }).first().click();
    const used = page.getByTestId("service-history-items-used").first();
    await expect(used).toContainText("Items used:");
    await expect(used).toContainText("Throttle body cleaner (1 can, J$ 1,200)");
    await expect(used).toContainText("Shop rags (1 piece, cost not recorded)");
    await snap(page, "05-history-items-used", page.locator("table"));
  });

  test("25 + 27 + 36 — server: part not for this car refused; old version → 409; two finishes at once", async () => {
    const call = await api();
    const notForCar = await call("POST", "/maintenance-work-orders", {
      vehicleId: MD_DISC_VEHICLE_ID,
      status: "draft",
      lines: [jobLine({ items: [{ source: "suggested", jobItemId: fx.gasketLink, itemKind: "part_type", partTypeId: fx.gasketTypeId, partId: crypto.randomUUID(), qty: "1" }] })],
    });
    expect(notForCar.status).toBe(400);
    expect(notForCar.json.code).toBe("line_item_part_not_for_car");

    const draft = await call("POST", "/maintenance-work-orders", { vehicleId: MD_DISC_VEHICLE_ID, status: "draft", lines: [jobLine()] });
    expect(draft.status).toBe(200);
    const item = draft.json.item as { id: string; version: number };
    const first = await call("PATCH", `/maintenance-work-orders/${item.id}`, { notes: "first save", expectedVersion: item.version });
    expect(first.status).toBe(200);
    const stale = await call("PATCH", `/maintenance-work-orders/${item.id}`, { notes: "second save", expectedVersion: item.version });
    expect(stale.status).toBe(409);
    expect(stale.json.code).toBe("stale_edit");
    const noVersion = await call("PATCH", `/maintenance-work-orders/${item.id}`, { notes: "no version" });
    expect(noVersion.status).toBe(428);

    const today = new Date().toISOString().slice(0, 10);
    const wip = await call("POST", "/maintenance-work-orders", {
      vehicleId: MD_DISC_VEHICLE_ID,
      status: "in_progress",
      performedAtDate: today,
      odometer: 197500,
      lines: [jobLine()],
    });
    expect(wip.status).toBe(200);
    const wipId = (wip.json.item as { id: string }).id;
    const [a, b] = await Promise.all([
      call("POST", `/maintenance-work-orders/${wipId}/complete`, {}),
      call("POST", `/maintenance-work-orders/${wipId}/complete`, {}),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    if (statuses[1] === 409) expect([a, b].find((r) => r.status === 409)!.json.code).toBe("completion_in_progress");
    await new Promise((r) => setTimeout(r, 3000));
    const again = await call("POST", `/maintenance-work-orders/${wipId}/complete`, {});
    expect(again.status).toBe(200);
    expect(again.json.idempotentReplay).toBe(true);
    expect(sql(`SELECT count(*) FROM public.maintenance_records WHERE work_order_id = '${wipId}'`)).toBe("1");
  });

  // Business Finance outage = a rule on ledger.entries for the test company (S4 made a failed books write stop completion).
  test("31 — a failed step: wizard shows Not finished saving; Finish saving completes it", async ({ page }) => {
    blockBooks(true);
    try {
      await openWizardOnReview(page);
      await logAndWait(page);
      const banner = page.getByTestId("not-finished-banner");
      await expect(banner).toBeVisible({ timeout: 90_000 });
      await expect(banner).toContainText("This service saved but didn't finish. Nothing is lost.");
      await expect(banner).toContainText("Couldn't finish: the books service isn't answering. Try again later.");
      await snap(page, "06-wizard-not-finished", banner);
    } finally {
      blockBooks(false);
    }
    await page.getByTestId("finish-saving").click();
    await expect(page.getByText(/service log saved|posted to business finance/i).first()).toBeVisible({ timeout: 90_000 });
    expect(sql(`SELECT count(*) FROM public.maintenance_work_orders WHERE organization_id = '${MD_DISC_ORG}' AND status = 'in_progress'`)).toBe("0");
    // The books got this service exactly once (the failed try left nothing; Finish saving posted once).
    const recordId = sql(`SELECT maintenance_record_id FROM public.maintenance_work_orders WHERE organization_id = '${MD_DISC_ORG}' AND status = 'completed' ORDER BY closed_at DESC NULLS LAST LIMIT 1`);
    expect(sql(`SELECT count(*) FROM ledger.entries WHERE reference_id::text = '${recordId}'`)).toBe("1");
  });

  test("31 — history: Not finished saving card; Finish saving → Completed; void keeps items (28)", async ({ page }) => {
    // A service saved as in progress (what a failed finish leaves behind), with one item.
    const call = await api();
    const wip = await call("POST", "/maintenance-work-orders", {
      vehicleId: MD_DISC_VEHICLE_ID,
      status: "in_progress",
      performedAtDate: new Date().toISOString().slice(0, 10),
      odometer: 197700,
      provider: "Kingston Auto Care",
      lines: [jobLine({ items: [{ source: "suggested", jobItemId: fx.cleanerLink, itemKind: "supply", supplyId: sql(`SELECT supply_id FROM public.maintenance_job_item WHERE id = '${fx.cleanerLink}'`), qty: "1", unitCost: "1200" }] })],
    });
    expect(wip.status).toBe(200);
    const wipId = (wip.json.item as { id: string }).id;
    // "In progress for more than 2 minutes": move the saved time back instead of waiting.
    sql(`SET session_replication_role = replica; UPDATE public.maintenance_work_orders SET updated_at = now() - interval '5 minutes' WHERE id = '${wipId}';`);

    await page.goto("/maintenance");
    await page.getByRole("tab", { name: /service history/i }).click();
    const card = page.getByTestId("not-finished-card").first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Not finished saving");
    await expect(card).toContainText("Kingston Auto Care");
    await expect(card).toContainText("J$ 4,200");
    await expect(card).toContainText("Items used:");
    await snap(page, "05-history-not-finished", card);
    await card.getByTestId("finish-saving").click();
    await expect(card).toContainText("Completed", { timeout: 90_000 });
    await expect(card.getByRole("button", { name: /View details/ })).toBeVisible();
    await snap(page, "06-history-finished", card);
    expect(sql(`SELECT status FROM public.maintenance_work_orders WHERE id = '${wipId}'`)).toBe("completed");

    // 28: void the job; its items stay (read-only).
    const lineId = sql(`SELECT id FROM public.maintenance_work_order_lines WHERE work_order_id = '${wipId}' LIMIT 1`);
    const voided = await call("POST", `/maintenance-work-order-lines/${lineId}/void`, { reason: "Entered by mistake" });
    expect(voided.status).toBe(200);
    expect(sql(`SELECT count(*) FROM public.maintenance_work_order_line_item WHERE work_order_line_id = '${lineId}'`)).toBe("1");
    // A completed log is read-only.
    const edit = await call("PATCH", `/maintenance-work-orders/${wipId}`, { notes: "late edit", expectedVersion: 99 });
    expect(edit.status).toBe(409);
    expect(edit.json.code).toBe("immutable");
  });

  // Screen 8 states — a picture check against Stitch, not a done-test. Loading, couldn't-load and
  // save-failed need a slow or failed answer, so those network answers are held or faked here only.
  test("8 States: loading, couldn't load + Try again, no items, save failed (pictures)", async ({ page }) => {
    setServiceItems(true);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    // Loading → couldn't load: only this job's own group list is held, then refused (the other
    // groups still answer, so the screen knows service items are on).
    const groupId = sql(`SELECT parent_id FROM public.maintenance_service_categories WHERE id = '${fx.jobId}'`);
    const groupRoute = `**/maintenance-categories/systems/${groupId}/sections`;
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(groupRoute, async (route) => {
      await held;
      await route.abort("failed");
    });
    await openWizardOnReview(page);
    await openJobDetails(page);
    await expect(page.getByTestId("items-used-loading")).toBeVisible({ timeout: 30_000 });
    await snap(page, "08a-loading", page.getByTestId("items-used"));
    release();
    const block = page.getByTestId("items-used");
    await expect(block.getByText("Couldn't load standard parts for this job")).toBeVisible({ timeout: 30_000 });
    await expect(block.getByTestId("items-used-add-other")).toBeVisible();
    await snap(page, "08b-couldnt-load", block);
    // Try again with the real server: the May-need list appears.
    await page.unroute(groupRoute);
    await block.getByRole("button", { name: "Try again" }).click();
    await expect(itemRow(page, fx.cleanerLink)).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("log-service-cancel").click();

    // No items: a job with no May-need list.
    const leak = sql(`SELECT id || '|' || name FROM public.maintenance_service_categories WHERE code = 'leak_inspection'`);
    const [leakId, leakName] = leak.split("|");
    sql(`DELETE FROM public.maintenance_job_item WHERE job_id = '${leakId}'`);
    await openWizardOnReview(page, jobLine({ categoryId: leakId, categoryCode: "leak_inspection", categoryName: leakName, action: "inspect" }));
    await openJobDetails(page, leakName);
    const empty = page.getByTestId("items-used-empty");
    await expect(empty).toContainText("No standard items suggested for this service.");
    await snap(page, "08c-no-items", page.getByTestId("items-used"));
    await page.getByRole("button", { name: /^Save line$/ }).click();
    await expect(page.getByRole("heading", { name: /review and save/i })).toBeVisible({ timeout: 30_000 });

    // Save failed: the save is refused once.
    await page.route("**/maintenance-work-orders", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The server is busy. Try again." }) })
        : route.continue(),
    );
    await logAndWait(page);
    const banner = page.getByTestId("save-failed-banner");
    await expect(banner).toContainText("Couldn't log this service.");
    await expect(banner).toContainText("Nothing was saved.");
    await snap(page, "08d-save-failed", banner);
    await page.unroute("**/maintenance-work-orders");
    await page.getByTestId("log-service-cancel").click();
  });
});
