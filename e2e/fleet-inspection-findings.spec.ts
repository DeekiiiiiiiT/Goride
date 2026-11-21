/**
 * Inspection findings — Fleet done-tests 1–4 (docs/inspection-findings-audit.md section 7) on the real local stack.
 * Nothing faked: real Fleet app, real fleet-ops routes, real local database. UI1 = Log service screens (Stitch 1–5);
 * UI2 = fleet card + "N to do" chip, Due items drawer (Log it now / Not needed) and history (Stitch 6–11).
 *
 * Start `pnpm testcopy`, then:
 * FLEET_BASE_URL=http://127.0.0.1:5181 node node_modules/@playwright/test/cli.js test e2e/fleet-inspection-findings.spec.ts \
 *   --project=fleet --reporter=list --max-failures=1 --retries=0
 *
 * Screenshots go to the git-ignored test-results/inspection-findings-fleet/ (for the Stitch check; delete after).
 */
import { expect, test, type Page } from "@playwright/test";
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

function sql(q: string): string {
  return queryMaintenanceDiscountDb(q)
    .split(/\r?\n/)
    .filter((l) => !/^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SET|CREATE \w+|DROP \w+|DO)$/.test(l.trim()))
    .join("\n")
    .trim();
}

const shotsDir = join(process.cwd(), "test-results", "inspection-findings-fleet");
mkdirSync(shotsDir, { recursive: true });

const FLAGS = ["feature_flag:service_items", "feature_flag:inspection_findings"];
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

let insp: Job;
let wiper: Job;
let rotor: Job;
let shock: Job;

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

/** A saved draft with only the inspection fee (J$ 8,000): the wizard opens on Review. */
async function openWizardWithInspection(page: Page) {
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
            odo: 198807,
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
        categoryId: insp.id,
        categoryCode: insp.code,
        categoryName: insp.name,
        action: "inspect",
        labor: 8000,
        values: { cost_mode: "total", service_amount: 8000 },
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
}

async function addFound(page: Page, query: string, name: string) {
  await page.getByTestId("found-add-job").click();
  const picker = page.getByTestId("found-picker");
  await expect(picker).toBeVisible();
  await picker.getByTestId("found-picker-search").fill(query);
  const row = picker.getByTestId("found-picker-row").filter({ hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByTestId("found-picker-add").click();
  await expect(picker).toBeHidden();
  return page.getByTestId("found-work-row").filter({ hasText: name });
}

async function fillJobAmount(page: Page, amount: string) {
  const service = page.locator("#service-amount");
  if (await service.isVisible().catch(() => false)) {
    await service.fill(amount);
    return;
  }
  const labor = page.locator("#cat-field-labor");
  if (await labor.isVisible().catch(() => false)) {
    await labor.fill(amount);
    return;
  }
  // Jobs without a single cost box (e.g. Brake rotor): 1 hour × the amount.
  await page.locator("#labor-amount").fill(amount);
}

async function gotoHub(page: Page) {
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({ timeout: 60_000 });
}

const carRow = (page: Page) => page.getByRole("row").filter({ hasText: MD_DISC_PLATE }).first();

/** The Due items drawer is open; its "Found by inspection" section has finished loading. */
async function openFoundSection(page: Page) {
  await expect(page.getByTestId("mm-due-drawer")).toBeVisible({ timeout: 30_000 });
  const section = page.getByTestId("found-by-inspection");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section.getByTestId("found-loading")).toHaveCount(0, { timeout: 30_000 });
  await openFoundBlocks(section);
  return section;
}

/** LC-18: the Not done yet list is folded into one block per inspection — open them all. */
async function openFoundBlocks(section: import("@playwright/test").Locator) {
  const toggles = section.getByTestId("found-group-toggle");
  const n = await toggles.count();
  for (let i = 0; i < n; i += 1) {
    if ((await toggles.nth(i).getAttribute("aria-expanded")) === "false") await toggles.nth(i).click();
  }
}


const dialogShot = (page: Page, id: string) =>
  page.getByRole("dialog").first().screenshot({ path: join(shotsDir, `live-${id}.png`) });

test.describe.configure({ mode: "serial" });

test.describe("Fleet inspection findings", () => {
  test.beforeAll(() => {
    teardownMaintenanceDiscountDone();
    applyMaintenanceDiscountDoneSeed();
    for (const k of FLAGS) saved[k] = sql(`SELECT value::text FROM public.kv_store_37f42386 WHERE key = '${k}'`) || null;
    // The live catalogue has "Inspection / diagnostic fee"; the local copy's smaller catalogue has "Leak Inspection".
    // Both are marked records_findings by the D1 migration.
    try {
      insp = job("Inspection / diagnostic fee");
    } catch {
      insp = job("Leak Inspection");
    }
    wiper = job("Wiper Blades");
    rotor = job("Brake rotor");
    shock = job("Shock absorber");
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

  test("gate 9 — switch off: the inspection job looks exactly like today", async ({ page }) => {
    setFlag(FLAGS[0], true);
    setFlag(FLAGS[1], false);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    await openWizardWithInspection(page);
    await page.getByTestId("log-service-review-job").filter({ hasText: insp.name }).getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#service-amount, #cat-field-labor").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("found-work-section")).toHaveCount(0);
  });

  test("done-tests 1 + 2 — found jobs: J$ 0, not in history, on the car's list; Done today is billed", async ({ page }) => {
    setFlag(FLAGS[0], true);
    setFlag(FLAGS[1], true);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    await openWizardWithInspection(page);
    await page.getByTestId("log-service-review-job").filter({ hasText: insp.name }).getByRole("button", { name: "Edit" }).click();

    // Stitch screen 1: empty section with Add job.
    const section = page.getByTestId("found-work-section");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("found-work-empty")).toContainText("Nothing added yet.");
    await dialogShot(page, "01-empty");

    // Stitch screen 2: picker; screen 3: three jobs.
    const wiperRow = await addFound(page, "wiper", wiper.name);
    await page.getByTestId("found-add-job").click();
    await page.getByTestId("found-picker-search").fill("brake");
    await expect(page.getByTestId("found-picker-row").first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("found-picker").screenshot({ path: join(shotsDir, "live-02-picker.png") });
    await page.keyboard.press("Escape");
    await wiperRow.getByTestId("found-mode-today").click();
    const rotorRow = await addFound(page, "brake rotor", rotor.name);
    await rotorRow.getByTestId("found-note").fill("Front rotors worn, replace within 2 weeks");
    const shockRow = await addFound(page, "shock", shock.name);
    await shockRow.getByTestId("found-note").fill("Rear left leaking");
    await expect(page.getByTestId("found-work-summary")).toHaveText("1 done today · 2 not done yet (kept on the car's list)");
    await expect(rotorRow).toContainText("J$ 0 · not charged");
    await dialogShot(page, "03-three-found");

    // Save line → the inspection collapses (screen 4) and Wiper Blades opens with the From inspection chip.
    await page.getByRole("button", { name: /^Save line/ }).first().click();
    await expect(page.getByTestId("found-collapsed-row")).toContainText("2 found, not done yet", { timeout: 15_000 });
    await expect(page.getByTestId("log-service-job-header")).toContainText(wiper.name);
    await expect(page.getByTestId("from-inspection-chip")).toBeVisible();
    await fillJobAmount(page, "1500");
    await dialogShot(page, "04-done-today-card");
    await page.getByRole("button", { name: /^Save line/ }).first().click();
    await page.getByRole("button", { name: /continue to review/i }).click();

    // Screen 5: Review — two billed jobs, amber group with two found jobs at J$ 0.
    const summary = page.getByTestId("log-service-review-summary");
    await expect(summary).toContainText("2 jobs");
    await expect(summary).toContainText("J$ 9,500");
    await expect(page.getByTestId("review-found-not-charged")).toContainText("2 found jobs not charged");
    await expect(page.getByTestId("review-found-row")).toHaveCount(2);
    await dialogShot(page, "05-review");

    await page.getByRole("button", { name: /^Log service$/i }).click();
    await expect(page.getByTestId("log-service-review-summary")).toBeHidden({ timeout: 60_000 });

    // Done-test 1: the bill, the found lines, the history and the schedule.
    const wo = sql(`
      SELECT id || '|' || total_cost || '|' || status FROM public.maintenance_work_orders
      WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`);
    const [woId, total, status] = wo.split("|");
    expect(status).toBe("completed");
    expect(Number(total)).toBe(9500);
    expect(
      sql(`SELECT count(*) || '|' || coalesce(sum(line_total), 0) FROM public.maintenance_work_order_lines
           WHERE work_order_id = '${woId}' AND recommended AND voided_at IS NULL`),
    ).toBe("2|0.00");
    expect(
      sql(`SELECT values_json->>'found_today' FROM public.maintenance_work_order_lines
           WHERE work_order_id = '${woId}' AND component_id = '${wiper.id}'`),
    ).toBe("true");
    const ledgerJobs = sql(`
      SELECT string_agg(DISTINCT category_id::text, ',') FROM public.maintenance_service_ledger
      WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND voided_at IS NULL`);
    expect(ledgerJobs).toContain(wiper.id);
    expect(ledgerJobs).not.toContain(rotor.id);
    expect(ledgerJobs).not.toContain(shock.id);

    // Done-test 2: both found jobs are on the car's list, with their notes.
    const call = await api();
    const list = await call("GET", `/maintenance-found-work?vehicleId=${encodeURIComponent(MD_DISC_VEHICLE_ID)}`);
    expect(list.status).toBe(200);
    const items = list.json.items as Array<{ jobName: string; note: string | null; inspectionJobName: string | null; garage: string | null }>;
    expect(items.map((i) => i.jobName).sort()).toEqual([rotor.name, shock.name].sort());
    expect(items.find((i) => i.jobName === rotor.name)?.note).toBe("Front rotors worn, replace within 2 weeks");
    expect(items[0].inspectionJobName).toBe(insp.name);
    expect(items[0].garage).toBe("Northside Auto");
    const counts = await call("GET", "/maintenance-found-work/counts");
    expect((counts.json.byVehicle as Record<string, number>)[MD_DISC_VEHICLE_ID]).toBe(2);
  });

  test("done-test 2 (screens) — fleet card, \"2 to do\" chip, drawer lists both found jobs", async ({ page }) => {
    await gotoHub(page);
    const card = page.getByTestId("found-kpi-card");
    await expect(card).toContainText("2 jobs waiting", { timeout: 30_000 });
    await expect(card).toContainText("on 1 car");
    const chip = carRow(page).getByTestId("found-to-do-chip");
    await expect(chip).toHaveText(/2 to do/);
    await card.screenshot({ path: join(shotsDir, "live-06-card.png") });
    await chip.screenshot({ path: join(shotsDir, "live-06-chip.png") });

    // LC-11: the card opens the Not done yet tab (every car); each card names its car.
    await card.click();
    const section = page.getByTestId("found-by-inspection");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section.getByTestId("found-loading")).toHaveCount(0, { timeout: 30_000 });
    await expect(section.getByTestId("found-group-summary").first()).toContainText(MD_DISC_PLATE);
    await openFoundBlocks(section);
    await expect(section.getByTestId("found-card")).toHaveCount(2);
    await expect(section.getByTestId("found-by-inspection-count")).toHaveText("2");
    const rotorCard = section.getByTestId("found-card").filter({ hasText: rotor.name });
    await expect(rotorCard).toContainText("Front rotors worn, replace within 2 weeks");
    await expect(section.getByTestId("found-group-title").first()).toContainText(`${insp.name} · `);
    await expect(section.getByTestId("found-group-title").first()).toContainText("Northside Auto");
    await expect(rotorCard.getByTestId("found-log-it-now")).toBeVisible();
    await expect(rotorCard.getByTestId("found-not-needed")).toBeVisible();
    await section.screenshot({ path: join(shotsDir, "live-07-drawer.png") });
  });

  test("done-test 4 (screens) — Not needed: overlay, confirm, leaves the list; a second close is refused", async ({ page }) => {
    await gotoHub(page);
    await carRow(page).getByTestId("found-to-do-chip").click();
    const section = await openFoundSection(page);
    const shockCard = section.getByTestId("found-card").filter({ hasText: shock.name });
    await shockCard.getByTestId("found-not-needed").click();
    const overlay = page.getByTestId("found-not-needed-dialog");
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(`Mark ${shock.name} as not needed?`);
    await expect(overlay).toContainText("Rear left leaking");
    await overlay.screenshot({ path: join(shotsDir, "live-09-not-needed.png") });

    // Cancel first: nothing changes.
    await overlay.getByRole("button", { name: "Cancel" }).click();
    await expect(overlay).toBeHidden();
    await expect(section.getByTestId("found-card")).toHaveCount(2);

    await shockCard.getByTestId("found-not-needed").click();
    await page.getByTestId("found-not-needed-confirm").click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });
    await expect(section.getByTestId("found-card")).toHaveCount(1, { timeout: 15_000 });
    await expect(section.getByTestId("found-card")).toContainText(rotor.name);
    const shockLine = sql(`
      SELECT l.id || '|' || coalesce(l.closed_reason, '') FROM public.maintenance_work_order_lines l
      JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
      WHERE wo.vehicle_id = '${MD_DISC_VEHICLE_ID}' AND l.component_id = '${shock.id}' AND l.recommended AND l.voided_at IS NULL
      ORDER BY l.created_at DESC LIMIT 1`);
    const [shockLineId, reason] = shockLine.split("|");
    expect(reason).toBe("not_needed");

    // The fleet page count follows.
    await page.keyboard.press("Escape");
    await expect(carRow(page).getByTestId("found-to-do-chip")).toHaveText(/1 to do/, { timeout: 15_000 });

    // A second press (someone else's screen) is refused politely.
    const call = await api();
    const again = await call("POST", `/maintenance-found-work/${shockLineId}/not-needed`);
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("found_line_not_open");
  });

  test("done-test 3 (screens) — Log it now: banner on the job, save, leaves the list", async ({ page }) => {
    await gotoHub(page);
    await carRow(page).getByTestId("found-to-do-chip").click();
    const section = await openFoundSection(page);
    await section.getByTestId("found-card").filter({ hasText: rotor.name }).getByTestId("found-log-it-now").click();

    // Step 1 (date + mileage), then Continue goes straight to the job's details.
    const odo = page.locator("#svc-odo");
    await expect(odo).toBeVisible({ timeout: 30_000 });
    await odo.fill("200140");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    const banner = page.getByTestId("found-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText("From inspection on");
    await expect(banner).toContainText("Front rotors worn, replace within 2 weeks");
    await expect(page.getByTestId("log-service-job-header")).toContainText(rotor.name);
    await fillJobAmount(page, "6000");
    await dialogShot(page, "10-log-it-now");
    const saveLine = page.getByRole("button", { name: /^Save line/ }).first();
    if (await saveLine.isVisible().catch(() => false)) await saveLine.click();
    await page.getByRole("button", { name: /continue to review/i }).click();
    await expect(page.getByTestId("log-service-review-summary")).toContainText("J$ 6,000");
    await page.getByRole("button", { name: /^Log service$/i }).click();
    await expect(page.getByTestId("log-service-review-summary")).toBeHidden({ timeout: 60_000 });

    // Closed by that service, with the link back.
    const done = sql(`
      SELECT count(*) FROM public.maintenance_work_order_lines d
      JOIN public.maintenance_work_orders wo ON wo.id = d.work_order_id AND wo.voided_at IS NULL AND wo.status = 'completed'
      JOIN public.maintenance_work_order_lines f ON f.id = d.from_found_line_id
      WHERE wo.vehicle_id = '${MD_DISC_VEHICLE_ID}' AND f.component_id = '${rotor.id}' AND d.voided_at IS NULL`);
    expect(done).toBe("1");

    // Chip and card gone; the drawer says all clear.
    await expect(carRow(page).getByTestId("found-to-do-chip")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("found-kpi-card")).toContainText("0 jobs waiting");
    await carRow(page).getByRole("button", { name: "View due items" }).click();
    const after = await openFoundSection(page);
    await expect(after.getByTestId("found-empty")).toContainText("Nothing waiting from inspections.");
    await after.screenshot({ path: join(shotsDir, "live-08-empty.png") });
  });

  test("history — What the inspection found: Done same day, Done + Open that service, Not needed struck", async ({ page }) => {
    await gotoHub(page);
    await page.getByRole("tab", { name: /service history/i }).click();
    // Wiper Blades was done on the inspection visit, so its row opens that service.
    const inspJob = page.getByTestId("service-history-job").filter({ hasText: wiper.name }).first();
    // Same-day services share one history row ("Brake rotor, Leak Inspection + 1 more"), so Wiper Blades can be
    // folded into "+ N more": open the car's row, not a row that must spell out the job.
    const groupRow = page.getByRole("row").filter({ hasText: MD_DISC_PLATE }).first();
    await expect(groupRow.or(inspJob).first()).toBeVisible({ timeout: 30_000 });
    // IF-16: found jobs never appear as history jobs (Shock absorber was only found, then Not needed).
    await expect(page.getByRole("table")).not.toContainText(shock.name);
    if (!(await inspJob.isVisible().catch(() => false))) await groupRow.click();
    await expect(page.getByTestId("service-history-job").filter({ hasText: shock.name })).toHaveCount(0);
    await expect(inspJob).toBeVisible({ timeout: 30_000 });
    await inspJob.getByRole("button", { name: "View service" }).click();
    const hist = page.getByTestId("found-history");
    await expect(hist).toBeVisible({ timeout: 30_000 });
    const row = (name: string) => hist.getByTestId("found-history-row").filter({ hasText: name });
    await expect(row(wiper.name)).toContainText("Done the same day");
    await expect(row(rotor.name)).toContainText("Done");
    await expect(row(rotor.name)).toContainText("Front rotors worn");
    await expect(row(shock.name)).toContainText("Marked not needed");
    await expect(row(shock.name).getByText(shock.name, { exact: true })).toHaveClass(/line-through/);
    await dialogShot(page, "11-history");

    // "Open that service" shows the Log it now service in the same window.
    await row(rotor.name).getByTestId("found-open-service").click();
    await expect(page.getByRole("dialog").first()).toContainText("J$ 6,000", { timeout: 30_000 });
    await expect(page.getByTestId("found-history")).toHaveCount(0);
  });
});
