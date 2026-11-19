/**
 * Log service — unknown parts reach Dominion: Slice B done-tests 8–21 (docs/log-service-parts-gaps-audit.md section 3)
 * on the real local stack. Nothing faked: real Fleet app, real fleet-ops / fleet-core / platform-catalog routes, the real
 * parts-sourcing-drain edge function (served by `pnpm testcopy` with a local-only test secret) and the real local database.
 * Done-test 8 also proves the pg_cron relay end to end. The other tests call the drain over HTTP right away instead of
 * waiting for the minute tick, so each test controls when the drain runs.
 *
 * The only stand-ins are things a test can't wait for: "31 days ago", "tomorrow" and "5 minutes later" move saved
 * times, and the 30 requests for the daily limit are filler rows.
 *
 * Start `pnpm testcopy`, then:
 * FLEET_BASE_URL=http://127.0.0.1:5181 ADMIN_BASE_URL=http://127.0.0.1:5180 node node_modules/@playwright/test/cli.js test \
 *   e2e/fleet-log-service-unknown-parts.spec.ts --project=fleet --reporter=list --max-failures=1 --retries=0
 *
 * Set LS_SHOTS_DIR to a folder outside the repo to also save screen pictures for a Stitch check (never commit them).
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
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
import { applyMmP01HttpSeed, getLocalSupabaseKeys, seedMmP01Session, signInPlatformAal2 } from "./helpers/mmP01Auth";

function sql(q: string): string {
  return queryMaintenanceDiscountDb(q)
    .split(/\r?\n/)
    .filter((l) => !/^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SET|CREATE \w+|DROP \w+|DO|BEGIN|COMMIT)$/.test(l.trim()))
    .join("\n")
    .trim();
}

// ── Company B: the same test company, cloned under other ids (its own owner, car and plate). ──
const B_ORG = "d6010000-0000-4000-8000-000000000089";
const B_OWNER_ID = "d6010001-0000-4000-8000-000000000002";
const B_OWNER_EMAIL = "md-disc-b-owner@local.test";
const B_VEHICLE_ID = "md-disc-veh-b01";
function companyBSql(file: string): string {
  return readFileSync(join(process.cwd(), "e2e", "fixtures", file), "utf8")
    .replaceAll(MD_DISC_ORG, B_ORG)
    .replaceAll("d6010001-0000-4000-8000-000000000001", B_OWNER_ID)
    .replaceAll(MD_DISC_OWNER_EMAIL, B_OWNER_EMAIL)
    .replaceAll("test-org-md-disc", "test-org-md-disc-b")
    .replaceAll(MD_DISC_VEHICLE_ID, B_VEHICLE_ID)
    .replaceAll(MD_DISC_PLATE, "MD-DISC-B01")
    .replaceAll("Maintenance Discount Done Test", "Maintenance Discount Done Test B");
}
const seedCompanyB = () => queryMaintenanceDiscountDb(companyBSql("maintenance-discount-done-test-seed.sql"));
const teardownCompanyB = () => queryMaintenanceDiscountDb(companyBSql("maintenance-discount-done-test-teardown.sql"));

/** A made-up Roam car both companies' cars link to. */
const CAT = "e2a50000-0000-4000-8000-0000000000a1";

function linkCar(vehicleId: string, on: boolean) {
  sql(`UPDATE fleet.vehicles SET payload_json = ${
    on ? `payload_json || jsonb_build_object('vehicle_catalog_id', '${CAT}')` : `payload_json - 'vehicle_catalog_id'`
  } WHERE id = '${vehicleId}'`);
}

function cleanupResearch() {
  sql(`
    DELETE FROM public.catalog_research_event WHERE job_id IN (SELECT id FROM public.catalog_research_job WHERE vehicle_catalog_id = '${CAT}');
    DELETE FROM pgmq.q_catalog_research WHERE message->>'jobId' IN (SELECT id::text FROM public.catalog_research_job WHERE vehicle_catalog_id = '${CAT}');
    UPDATE public.parts_sourcing_requests SET catalog_research_job_id = NULL
      WHERE catalog_research_job_id IN (SELECT id FROM public.catalog_research_job WHERE vehicle_catalog_id = '${CAT}');
    DELETE FROM public.catalog_research_job WHERE vehicle_catalog_id = '${CAT}';`);
}

function teardownAll() {
  teardownMaintenanceDiscountDone();
  teardownCompanyB();
  cleanupResearch();
  sql(`DELETE FROM public.vehicle_catalog WHERE id = '${CAT}'`);
}

// ── Switches ──
const ITEMS = "feature_flag:service_items";
const GAPS = "feature_flag:log_service_parts_gaps";
const FLAGS = [ITEMS, GAPS];
const FLAG_CACHE_WAIT_MS = 31_000;
const savedFlags: Record<string, string | null> = {};
function setFlag(key: string, on: boolean) {
  const value = JSON.stringify({ enabled: false, enabledForOrgs: on ? [MD_DISC_ORG, B_ORG] : [], updatedAt: new Date().toISOString() });
  sql(`INSERT INTO public.kv_store_37f42386 (key, value) VALUES ('${key}', '${value}'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`);
}

// ── Real routes ──
type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;
async function caller(email: string, password: string, fn: string, aal2 = false): Promise<Call> {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const { access_token } = aal2
    ? await signInPlatformAal2(base, anonKey)
    : await signInPlatformAal2(base, anonKey, email, password);
  return async (method, path, body) => {
    const res = await fetch(`${base}/functions/v1/${fn}${path}`, {
      method,
      headers: { apikey: anonKey, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
}
let fleetA: Call;
let fleetB: Call;
let findPartsA: Call;
let dominion: Call;

const DRAIN_SECRET = "testcopy-local-drain-secret";
async function drain(): Promise<Record<string, number>> {
  const { base } = await getLocalSupabaseKeys();
  const res = await fetch(`${base}/functions/v1/parts-sourcing-drain`, {
    method: "POST",
    headers: { "X-Parts-Sourcing-Drain-Secret": DRAIN_SECRET },
  });
  const json = (await res.json()) as Record<string, number>;
  expect(res.status, JSON.stringify(json)).toBe(200);
  expect(json.errors, "drain row errors").toBe(0);
  return json;
}

type Job = { id: string; name: string; code: string };
let o2: Job;

type Item = { name?: string; partNumber?: string | null; brand?: string | null; cost?: string };
function otherItem(it: Item) {
  return {
    source: "other",
    itemKind: "other",
    itemName: it.name ?? "Front oxygen sensor",
    partNumber: it.partNumber ?? null,
    brand: it.brand ?? null,
    qty: "1",
    unitCost: it.cost ?? "9500",
  };
}
function o2Line(items: unknown[]) {
  return {
    categoryId: o2.id,
    categoryCode: o2.code,
    categoryName: o2.name,
    action: "replace",
    labor: 4000,
    values: { cost_mode: "total", service_amount: 4000 },
    positions: ["before_cat"],
    items,
  };
}
let odo = 199_000;
function serviceBody(vehicleId: string, items: unknown[], extra: Record<string, unknown> = {}) {
  odo += 100;
  return {
    vehicleId,
    status: "in_progress",
    completeNow: true,
    idempotencyKey: crypto.randomUUID(),
    performedAtDate: new Date().toISOString().slice(0, 10),
    odometer: odo,
    provider: "Northside Auto",
    currency: "JMD",
    logMode: "quick_job",
    lines: [o2Line(items)],
    ...extra,
  };
}
/** Log and finish one service through the real API; returns its id. */
async function finishService(call: Call, vehicleId: string, items: unknown[]): Promise<string> {
  const res = await call("POST", "/maintenance-work-orders", serviceBody(vehicleId, items));
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  const id = String((res.json.item as { id: string }).id);
  expect(sql(`SELECT status FROM public.maintenance_work_orders WHERE id = '${id}'`)).toBe("completed");
  return id;
}

function outbox(woId: string): Array<{ state: string; reason: string; requestId: string; nextTryAt: string }> {
  const rows = sql(`SELECT state || '|' || coalesce(reason_code, '') || '|' || coalesce(request_id::text, '') || '|' || next_try_at::text
                    FROM public.parts_sourcing_outbox WHERE work_order_id = '${woId}' ORDER BY created_at, id`);
  return rows ? rows.split("\n").map((r) => { const [state, reason, requestId, nextTryAt] = r.split("|"); return { state, reason, requestId, nextTryAt }; }) : [];
}
const requestsFor = (pn: string) =>
  Number(sql(`SELECT count(*) FROM public.parts_sourcing_requests WHERE old_part_number = '${pn}' AND kind = 'add_part_info'`));

type Group = {
  groupId: string; vehicleCatalogId: string | null; requestIds: string[]; origins: string[];
  positionScheme: string | null; positionCodes: string[] | null; requestedName: string | null; requestedPartNumber: string | null;
  componentId: string | null;
};
async function dominionGroups(): Promise<{ groups: Group[]; raw: string }> {
  const res = await dominion("GET", "/make-server-37f42386/admin/pending-catalog/parts-queue");
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  return { groups: (res.json.items as Group[]).filter((g) => g.vehicleCatalogId === CAT), raw: JSON.stringify(res.json) };
}
async function groupsWithRequest(requestId: string): Promise<Group[]> {
  return (await dominionGroups()).groups.filter((g) => g.requestIds.includes(requestId));
}

async function readItems(call: Call, woId: string): Promise<Array<Record<string, unknown>>> {
  const read = await call("GET", `/maintenance-work-orders/${woId}`);
  expect(read.status).toBe(200);
  const lines = ((read.json.item as { lines?: Array<{ items?: Array<Record<string, unknown>> }> })?.lines ?? []);
  return lines.flatMap((l) => l.items ?? []);
}

// ── Screens ──
const shotsDir = process.env.LS_SHOTS_DIR?.trim() || "";
async function shot(page: Page, name: string, el?: import("@playwright/test").Locator) {
  if (!shotsDir) return;
  if (el) await el.screenshot({ path: join(shotsDir, `${name}.png`) });
  else await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });
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

/** A saved draft holding the Oxygen sensor job: the wizard opens on Review, then Edit opens the job's details. */
async function openO2FromDraft(page: Page) {
  const userId = await authUserId(page);
  expect(userId).toBeTruthy();
  odo += 100;
  await page.evaluate(
    ({ userId, vehicleId, line, odo }) => {
      localStorage.setItem(
        `roam:fleet:log-service-draft:${userId}:${vehicleId}`,
        JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          step: "review",
          formMeta: { date: new Date().toISOString().slice(0, 10), type: line.categoryName, currency: "JMD", odo, provider: "Northside Auto", notes: "", invoiceUrl: "" },
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
      odo,
      line: { categoryId: o2.id, categoryCode: o2.code, categoryName: o2.name, action: "replace", labor: 4000, values: { cost_mode: "total", service_amount: 4000 } },
    },
  );
  await gotoHub(page);
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
  await page.getByTestId("log-service-review-job").filter({ hasText: o2.name }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByTestId("log-service-job-header")).toContainText(o2.name, { timeout: 30_000 });
  await expect(page.getByTestId("items-used")).toBeVisible({ timeout: 30_000 });
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

async function pickFront(page: Page) {
  await page.getByTestId("where-on-car").getByRole("button", { name: "Front (Air fuel ratio sensor)" }).click();
}

const saveLine = (page: Page) => page.getByRole("button", { name: /^Save line/ }).first();

async function logIt(page: Page) {
  await page.getByRole("button", { name: /^Log service$/i }).click();
  await expect(page.getByTestId("log-service-review-summary")).toBeHidden({ timeout: 60_000 });
}

async function gotoHub(page: Page) {
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({ timeout: 60_000 });
}

/**
 * Service history → View service on one service. Services logged the same day have no fixed order, so the car's other
 * services are hidden first (set as deleted in the database; their outbox rows are already final).
 */
async function openServiceDetails(page: Page, woId: string) {
  sql(`UPDATE public.maintenance_work_orders SET voided_at = now()
       WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND id <> '${woId}' AND voided_at IS NULL`);
  await gotoHub(page);
  await page.getByRole("tab", { name: /service history/i }).click();
  const row = page.getByTestId("service-history-job").filter({ hasText: o2.name }).first();
  const groupRow = page.getByRole("row").filter({ hasText: o2.name }).first();
  await expect(groupRow.or(row).first()).toBeVisible({ timeout: 30_000 });
  if (!(await row.isVisible().catch(() => false))) await groupRow.click();
  await row.getByRole("button", { name: "View service" }).click();
  const part = page.getByTestId("service-details-unknown-part").first();
  await expect(part).toBeVisible({ timeout: 30_000 });
  return part;
}

async function openDominionPendingParts(browser: Browser, width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const dpage = await ctx.newPage();
  await seedMmP01Session(dpage);
  const admin = process.env.ADMIN_BASE_URL?.trim() || "http://127.0.0.1:5180";
  await dpage.goto(`${admin}/?page=pending-motor-vehicles`);
  await dpage.getByRole("button", { name: /Parts\s+\d/i }).click({ timeout: 60_000 });
  return { ctx, dpage };
}

// ── Shared state between the serial tests ──
let firstRequestA = "";
const tempLinks: string[] = []; // done-test 8's request (89467-TEST1, company A)

test.describe.configure({ mode: "serial" });

test.describe("Log service — unknown parts reach Dominion (Slice B)", () => {
  test.beforeAll(async () => {
    teardownAll();
    applyMaintenanceDiscountDoneSeed();
    seedCompanyB();
    applyMmP01HttpSeed();
    for (const k of FLAGS) savedFlags[k] = sql(`SELECT value::text FROM public.kv_store_37f42386 WHERE key = '${k}'`) || null;
    const row = sql(`SELECT id || '|' || name || '|' || code FROM public.maintenance_service_categories
                     WHERE kind = 'component' AND code = 'oxygen_sensor' LIMIT 1`);
    const [id, name, code] = row.split("|");
    if (!id) throw new Error("Oxygen sensor job missing");
    o2 = { id, name, code };
    sql(`INSERT INTO public.vehicle_catalog (id, make, model, year, model_code, engine_displacement_l)
         VALUES ('${CAT}', 'Toyota', 'Roomy', 2019, 'M900A', 1.0) ON CONFLICT (id) DO NOTHING`);
    linkCar(MD_DISC_VEHICLE_ID, true);
    linkCar(B_VEHICLE_ID, true);
    // The cron stays quiet until its secret exists (it is only added inside done-test 8).
    sql(`DELETE FROM private.fleet_ops_secrets WHERE name IN ('parts_sourcing_drain_secret', 'functions_base_url')`);
    setFlag(ITEMS, true);
    setFlag(GAPS, true);
    fleetA = await caller(MD_DISC_OWNER_EMAIL, MD_DISC_PASSWORD, "fleet-ops");
    fleetB = await caller(B_OWNER_EMAIL, MD_DISC_PASSWORD, "fleet-ops");
    findPartsA = await caller(MD_DISC_OWNER_EMAIL, MD_DISC_PASSWORD, "fleet-core");
    dominion = await caller("", "", "platform-catalog", true);
    await new Promise((r) => setTimeout(r, FLAG_CACHE_WAIT_MS));
  });

  test.afterAll(() => {
    sql(`DELETE FROM private.fleet_ops_secrets WHERE name IN ('parts_sourcing_drain_secret', 'functions_base_url')`);
    for (const k of FLAGS) {
      if (savedFlags[k]) sql(`UPDATE public.kv_store_37f42386 SET value = '${savedFlags[k]}'::jsonb WHERE key = '${k}'`);
      else sql(`DELETE FROM public.kv_store_37f42386 WHERE key = '${k}'`);
    }
    teardownAll();
    for (const id of tempLinks) sql(`DELETE FROM public.maintenance_job_item WHERE id = '${id}'`);
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

  test("done-test 8 — Other item (no number asked, LC-04), Front: the cron sends it within 2 minutes; Dominion + history", async ({ page, browser }) => {
    await openO2FromDraft(page);
    await pickFront(page);
    await fillJobAmount(page, "4000");
    await page.getByTestId("items-used-add-other").first().click();
    const other = page.getByTestId("other-item-block");
    await other.getByLabel("What was it?").fill("Front oxygen sensor");
    await other.getByLabel(/^Cost each — other item/).fill("9500");
    await other.getByPlaceholder("e.g. CRC").fill("Denso");
    // Slice C (LC-04): no Part number box — Roam looks the item up by its name.
    await expect(other.getByTestId("other-item-part-number")).toHaveCount(0);
    await expect(other).not.toContainText("Part number");
    await expect(other.getByTestId("roam-looks-it-up")).toContainText("Roam will look this part up and add it to the parts list.");
    await shot(page, "F2-other-item", other);
    await saveLine(page).click();

    const job = page.getByTestId("log-service-review-job").filter({ hasText: o2.name });
    await expect(job).toContainText("Front oxygen sensor · Denso · 1 piece", { timeout: 30_000 });
    await expect(job.getByTestId("roam-looks-it-up")).toBeVisible();
    await shot(page, "F7-review", job);
    await logIt(page);

    const woId = sql(`SELECT id FROM public.maintenance_work_orders WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND voided_at IS NULL
                      ORDER BY created_at DESC LIMIT 1`);
    expect(outbox(woId).map((o) => o.state)).toEqual(["pending"]);
    // Gate 1: the finish step talked to nothing outside the database — the request only appears once the drain runs.
    expect(Number(sql(`SELECT count(*) FROM public.parts_sourcing_requests WHERE organization_id = '${MD_DISC_ORG}'
                       AND vehicle_catalog_id = '${CAT}' AND kind = 'add_part_info'`))).toBe(0);

    // The real cron: give the local database the drain's address and secret, then wait for the minute tick.
    sql(`INSERT INTO private.fleet_ops_secrets (name, value) VALUES
           ('functions_base_url', 'http://kong:8000/functions/v1'),
           ('parts_sourcing_drain_secret', '${DRAIN_SECRET}')
         ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`);
    try {
      await expect.poll(() => outbox(woId)[0]?.state, { timeout: 120_000, intervals: [5_000] }).toBe("sent");
    } finally {
      sql(`DELETE FROM private.fleet_ops_secrets WHERE name IN ('parts_sourcing_drain_secret', 'functions_base_url')`);
    }
    firstRequestA = outbox(woId)[0].requestId;
    expect(sql(`SELECT origin || '|' || coalesce(old_part_number, '') || '|' || position_scheme || '|' || array_to_string(position_codes, ',') || '|' || vehicle_catalog_id
                FROM public.parts_sourcing_requests WHERE id = '${firstRequestA}'`))
      .toBe(`service_log||before_after_catalyst|before_cat|${CAT}`);

    // One Dominion row: Roomy, the name, the position, "Service log" (no number was asked).
    const groups = await groupsWithRequest(firstRequestA);
    expect(groups).toHaveLength(1);
    expect(groups[0].requestedName).toBe("Front oxygen sensor");
    expect(groups[0].requestedPartNumber ?? null).toBeNull();
    expect(groups[0].positionCodes).toEqual(["before_cat"]);
    expect(groups[0].origins).toEqual(["service_log"]);

    const { ctx, dpage } = await openDominionPendingParts(browser);
    try {
      const row = dpage.getByRole("row").filter({ hasText: "Front oxygen sensor" });
      await expect(row).toHaveCount(1, { timeout: 60_000 });
      await expect(row).toContainText("Toyota Roomy");
      await expect(row.getByTestId("pending-part-detail-line")).toHaveText("Front");
      await expect(row.getByTestId("pending-part-source")).toHaveText("Service log");
      await shot(dpage, "D1-table");
      await row.click();
      const details = dpage.getByTestId("pending-part-details");
      await expect(details).toBeVisible({ timeout: 30_000 });
      for (const t of ["Front", "Service log"]) await expect(details).toContainText(t);
      await shot(dpage, "D2-drawer");
    } finally {
      await ctx.close();
    }

    const part = await openServiceDetails(page, woId);
    await expect(part).toContainText("Front oxygen sensor");
    await expect(part.getByTestId("sourcing-line")).toHaveText(/Sent to Roam to add to the parts list/);
    await shot(page, "F8-history", page.getByRole("dialog"));
  });

  test("done-test 9 — a typed-in part (brand only, LC-04): one row titled with the part type", async ({ page }) => {
    // The Oxygen sensor job "may need" one part type (made for this test, deleted after the run).
    const [ptId, ptName] = sql(`SELECT id || '|' || name FROM public.maintenance_service_categories
      WHERE kind = 'component' AND is_part IS TRUE AND coalesce(status, 'active') = 'active' AND id <> '${o2.id}'
      ORDER BY (name ILIKE '%sensor%') DESC, name LIMIT 1`).split("|");
    const link = sql(`INSERT INTO public.maintenance_job_item (job_id, part_type_id, need, sort_order)
                      VALUES ('${o2.id}', '${ptId}', 'usually', 10) RETURNING id`);
    tempLinks.push(link);
    try {
      await openO2FromDraft(page);
      await pickFront(page);
      await fillJobAmount(page, "4000");
      const row = page.getByTestId(`may-need-row-${link}`);
      await row.getByRole("checkbox").check();
      await row.getByLabel(/^Cost each — /).fill("9000");
      await row.getByRole("button", { name: "Pick a part" }).click();
      const picker = page.getByTestId("pick-part-dialog");
      await picker.getByRole("button", { name: /Type it in instead/ }).click({ timeout: 30_000 });
      await picker.getByLabel("Brand").fill("NGK");
      await expect(picker.getByLabel(/Part number/)).toHaveCount(0);
      await expect(picker.getByTestId("roam-looks-it-up")).toBeVisible();
      await shot(page, "F3-pick-a-part-typed", picker);
      await picker.getByRole("button", { name: /Use this part/ }).click();
      await expect(row.getByTestId("roam-looks-it-up")).toBeVisible();
      await saveLine(page).click();
      await expect(page.getByTestId("log-service-review-job").filter({ hasText: o2.name })).toContainText("NGK", { timeout: 30_000 });
      await logIt(page);
    } finally {
      sql(`UPDATE public.maintenance_job_item SET removed_at = now() WHERE id = '${link}'`);
    }
    const woId = sql(`SELECT id FROM public.maintenance_work_orders WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND voided_at IS NULL
                      ORDER BY created_at DESC LIMIT 1`);
    expect(outbox(woId).map((o) => o.state)).toEqual(["pending"]);
    await drain();
    const [ob] = outbox(woId);
    expect(ob.state).toBe("sent");
    const groups = await groupsWithRequest(ob.requestId);
    expect(groups).toHaveLength(1);
    expect(groups[0].componentId).toBe(ptId);
    expect(groups[0].requestedName).toBe(ptName);
    expect(groups[0].requestedPartNumber ?? null).toBeNull();
    expect(groups[0].requestIds).toEqual([ob.requestId]);
  });

  test("done-test 10 — finishing the same service again: no second outbox row, no second Dominion row", async () => {
    const body = serviceBody(MD_DISC_VEHICLE_ID, [otherItem({ partNumber: "10101-TEST1", name: "Rear oxygen sensor" })]);
    const first = await fleetA("POST", "/maintenance-work-orders", body);
    expect(first.status, JSON.stringify(first.json)).toBe(200);
    const woId = String((first.json.item as { id: string }).id);
    await drain();
    expect(outbox(woId).map((o) => o.state)).toEqual(["sent"]);
    const replay = await fleetA("POST", "/maintenance-work-orders", body);
    expect(replay.status, JSON.stringify(replay.json)).toBe(200);
    expect(replay.json.idempotentReplay).toBe(true);
    const again = await fleetA("POST", `/maintenance-work-orders/${woId}/complete`, {});
    expect(again.status, JSON.stringify(again.json)).toBe(200);
    await drain();
    expect(outbox(woId)).toHaveLength(1);
    expect(requestsFor("10101-TEST1")).toBe(1);
  });

  test("done-test 11 — a second company, same part name, same car model: still one Dominion row", async () => {
    const woB = await finishService(fleetB, B_VEHICLE_ID, [otherItem({ partNumber: null })]);
    await drain();
    const [ob] = outbox(woB);
    expect(ob.state).toBe("sent");
    const { groups } = await dominionGroups();
    const rows = groups.filter((g) => g.requestIds.includes(firstRequestA) || g.requestIds.includes(ob.requestId));
    expect(rows).toHaveLength(1);
    expect(rows[0].requestIds.sort()).toEqual([firstRequestA, ob.requestId].sort());
    expect(Number(sql(`SELECT fleet_count FROM public.catalog_research_job WHERE id = (
                         SELECT catalog_research_job_id FROM public.parts_sourcing_requests WHERE id = '${ob.requestId}')`))).toBe(2);
  });

  test("done-test 12 — unlinked car: saves and waits; sends once linked; after 30 days, not sent", async ({ page }) => {
    linkCar(MD_DISC_VEHICLE_ID, false);
    try {
      const woId = await finishService(fleetA, MD_DISC_VEHICLE_ID, [otherItem({ partNumber: "12121-TEST1" })]);
      await drain();
      expect(outbox(woId)[0]).toMatchObject({ state: "pending", reason: "car_not_linked" });
      const part = await openServiceDetails(page, woId);
      await expect(part.getByTestId("sourcing-line")).toHaveText(
        /Not sent yet: this car isn't linked to a Roam car\. It will send once it is\./,
      );
      await shot(page, "F9-not-linked", part);

      linkCar(MD_DISC_VEHICLE_ID, true);
      sql(`UPDATE public.parts_sourcing_outbox SET next_try_at = now() WHERE work_order_id = '${woId}'`);
      await drain();
      expect(outbox(woId)[0].state).toBe("sent");
      expect(requestsFor("12121-TEST1")).toBe(1);

      linkCar(MD_DISC_VEHICLE_ID, false);
      const old = await finishService(fleetA, MD_DISC_VEHICLE_ID, [otherItem({ partNumber: "12122-TEST1" })]);
      sql(`UPDATE public.parts_sourcing_outbox SET created_at = now() - interval '31 days', next_try_at = now() WHERE work_order_id = '${old}'`);
      await drain();
      expect(outbox(old)[0]).toMatchObject({ state: "not_sent", reason: "car_not_linked" });
      const items = await readItems(fleetA, old);
      expect(items[0]).toMatchObject({ sourcingState: "not_sent", sourcingReason: "car_not_linked" });
      const after = await openServiceDetails(page, old);
      await expect(after.getByTestId("sourcing-line")).toHaveText(/Not sent: this car isn't linked to a Roam car/);
      expect(requestsFor("12122-TEST1")).toBe(0);
    } finally {
      linkCar(MD_DISC_VEHICLE_ID, true);
    }
  });

  test("done-test 13 — daily limit: waits until the next Jamaica day 00:05, then sends", async ({ page }) => {
    sql(`INSERT INTO public.parts_sourcing_requests (organization_id, need_text, kind, status, origin, research_group_key)
         SELECT '${MD_DISC_ORG}', 'e2e daily limit filler', 'add_part_info', 'rejected', 'service_log', 'e2e-filler-' || g
         FROM generate_series(1, 30) g`);
    try {
      const woId = await finishService(fleetA, MD_DISC_VEHICLE_ID, [otherItem({ partNumber: "13131-TEST1" })]);
      await drain();
      const [ob] = outbox(woId);
      expect(ob).toMatchObject({ state: "pending", reason: "daily_limit" });
      expect(sql(`SELECT next_try_at = (date_trunc('day', now() AT TIME ZONE 'America/Jamaica') + interval '1 day 5 minutes') AT TIME ZONE 'America/Jamaica'
                  FROM public.parts_sourcing_outbox WHERE work_order_id = '${woId}'`)).toBe("t");
      const part = await openServiceDetails(page, woId);
      await expect(part.getByTestId("sourcing-line")).toHaveText(/Will send tomorrow \(daily limit reached\)/);

      // "Tomorrow": the 30 belong to yesterday now, and the row is due.
      sql(`UPDATE public.parts_sourcing_requests SET created_at = now() - interval '2 days'
           WHERE organization_id = '${MD_DISC_ORG}' AND kind = 'add_part_info' AND created_at > now() - interval '1 day'`);
      sql(`UPDATE public.parts_sourcing_outbox SET next_try_at = now() WHERE work_order_id = '${woId}'`);
      await drain();
      expect(outbox(woId)[0].state).toBe("sent");
      expect(requestsFor("13131-TEST1")).toBe(1);
    } finally {
      sql(`DELETE FROM public.parts_sourcing_requests WHERE organization_id = '${MD_DISC_ORG}' AND need_text = 'e2e daily limit filler'`);
    }
  });

  test("done-test 14 — a finished service deleted before the drain: cancelled, no Dominion row", async () => {
    const woId = await finishService(fleetA, MD_DISC_VEHICLE_ID, [otherItem({ partNumber: "14141-TEST1" })]);
    const voided = await fleetA("POST", `/maintenance-work-orders/${woId}/void`, { reason: "Entered by mistake" });
    expect(voided.status).toBe(200);
    await drain();
    expect(outbox(woId)[0].state).toBe("cancelled");
    expect(requestsFor("14141-TEST1")).toBe(0);
    const items = await readItems(fleetA, woId);
    expect(items[0]).toMatchObject({ sourcingState: "cancelled" });
  });

  test("done-test 15 — an outbox row for an unfinished service stays pending; finishing it sends once", async () => {
    const wip = await fleetA("POST", "/maintenance-work-orders", {
      ...serviceBody(MD_DISC_VEHICLE_ID, [otherItem({ partNumber: "15151-TEST1" })]),
      status: "in_progress",
      completeNow: false,
    });
    expect(wip.status, JSON.stringify(wip.json)).toBe(200);
    const woId = String((wip.json.item as { id: string }).id);
    expect(sql(`SELECT status FROM public.maintenance_work_orders WHERE id = '${woId}'`)).toBe("in_progress");
    // Only finishing queues a row; this stands in for one that exists early.
    expect(sql(`SELECT public.parts_sourcing_outbox_queue('${woId}')`)).toBe("1");
    sql(`UPDATE public.parts_sourcing_outbox SET next_try_at = now() WHERE work_order_id = '${woId}'`);
    await drain();
    expect(outbox(woId)[0].state).toBe("pending");
    expect(requestsFor("15151-TEST1")).toBe(0);

    const done = await fleetA("POST", `/maintenance-work-orders/${woId}/complete`, {});
    expect(done.status).toBe(200);
    // "5 minutes later": the drain set it to try again in 5 minutes.
    sql(`UPDATE public.parts_sourcing_outbox SET next_try_at = now() WHERE work_order_id = '${woId}'`);
    await drain();
    await drain();
    expect(outbox(woId)).toHaveLength(1);
    expect(outbox(woId)[0].state).toBe("sent");
    expect(requestsFor("15151-TEST1")).toBe(1);
  });

  test("done-test 16 — research paused, then disabled, then at its limit: the part still lands each time", async () => {
    const saved = sql(`SELECT enabled || '|' || paused || '|' || daily_job_limit FROM public.catalog_research_settings WHERE id = 1`);
    const [enabled, paused, limit] = saved.split("|");
    try {
      const cases: Array<[string, string]> = [
        ["16161-TEST1", "paused = true, enabled = true"],
        ["16162-TEST1", "paused = false, enabled = false"],
        ["16163-TEST1", "paused = false, enabled = true, daily_job_limit = 0"],
      ];
      for (const [pn, set] of cases) {
        sql(`UPDATE public.catalog_research_settings SET ${set} WHERE id = 1`);
        const woId = await finishService(fleetA, MD_DISC_VEHICLE_ID, [otherItem({ partNumber: pn })]);
        await drain();
        const [ob] = outbox(woId);
        expect(ob.state, `${pn} (${set})`).toBe("sent");
        expect(await groupsWithRequest(ob.requestId)).toHaveLength(1);
      }
    } finally {
      sql(`UPDATE public.catalog_research_settings SET enabled = ${enabled === "t"}, paused = ${paused === "t"}, daily_job_limit = ${limit} WHERE id = 1`);
    }
  });

  test("done-test 17 — two Other items, different names, no number, same line: two rows", async () => {
    const woId = await finishService(fleetA, MD_DISC_VEHICLE_ID, [
      otherItem({ name: "Sensor wiring clip", partNumber: null }),
      otherItem({ name: "Exhaust gasket ring", partNumber: null }),
    ]);
    await drain();
    const obs = outbox(woId);
    expect(obs.map((o) => o.state)).toEqual(["sent", "sent"]);
    const { groups } = await dominionGroups();
    const rows = groups.filter((g) => obs.some((o) => g.requestIds.includes(o.requestId)));
    expect(rows).toHaveLength(2);
    expect(rows.map((g) => g.requestedName).sort()).toEqual(["Exhaust gasket ring", "Sensor wiring clip"]);
  });

  test("done-test 18 — Find parts (A) + service log (B), same number and car: one row, both Source chips", async () => {
    const asked = await findPartsA("POST", "/make-server-37f42386/parts/request", {
      kind: "add_part_info",
      vehicleId: MD_DISC_VEHICLE_ID,
      maintenanceComponentId: o2.id,
      partName: o2.name,
      needText: "Oxygen sensor",
      oldPartNumber: "18181-TEST1",
      positionCodes: ["before_cat"],
    });
    expect(asked.status, JSON.stringify(asked.json)).toBe(200);
    const findId = String((asked.json.item as { id: string }).id);
    // Code review #1: asking again in other words is the same request, never a second one or a second job.
    const again = await findPartsA("POST", "/make-server-37f42386/parts/request", {
      kind: "add_part_info",
      vehicleId: MD_DISC_VEHICLE_ID,
      maintenanceComponentId: o2.id,
      partName: o2.name,
      needText: "front o2 sensor please",
      oldPartNumber: "18181-TEST1",
      positionCodes: ["before_cat"],
    });
    expect(again.status, JSON.stringify(again.json)).toBe(200);
    expect(again.json.deduped).toBe(true);
    expect(String((again.json.item as { id: string }).id)).toBe(findId);
    const woB = await finishService(fleetB, B_VEHICLE_ID, [otherItem({ name: "Oxygen sensor front", partNumber: "18181-TEST1" })]);
    await drain();
    const [ob] = outbox(woB);
    expect(ob.state).toBe("sent");
    const both = await groupsWithRequest(findId);
    expect(both).toHaveLength(1);
    expect(both[0].requestIds).toContain(ob.requestId);
    expect(both[0].origins).toEqual(["service_log", "find_parts"]);

    // Negative: the Find parts request without a number is its own row.
    const noNumber = await findPartsA("POST", "/make-server-37f42386/parts/request", {
      kind: "add_part_info",
      vehicleId: MD_DISC_VEHICLE_ID,
      maintenanceComponentId: o2.id,
      partName: o2.name,
      needText: "Oxygen sensor",
      positionCodes: ["before_cat"],
    });
    expect(noNumber.status, JSON.stringify(noNumber.json)).toBe(200);
    const noNumberId = String((noNumber.json.item as { id: string }).id);
    const own = await groupsWithRequest(noNumberId);
    expect(own).toHaveLength(1);
    expect(own[0].requestIds).not.toContain(ob.requestId);
    expect(own[0].groupId).not.toBe(both[0].groupId);
  });

  test("done-test 19 — two companies' rows for the same car and part in one drain run: one row, fleet_count 2", async () => {
    const woA = await finishService(fleetA, MD_DISC_VEHICLE_ID, [otherItem({ partNumber: "19191-TEST1" })]);
    const woB = await finishService(fleetB, B_VEHICLE_ID, [otherItem({ partNumber: "19191-TEST1" })]);
    const run = await drain();
    expect(run.sent).toBe(2);
    const a = outbox(woA)[0];
    const b = outbox(woB)[0];
    expect([a.state, b.state]).toEqual(["sent", "sent"]);
    const rows = await groupsWithRequest(a.requestId);
    expect(rows).toHaveLength(1);
    expect(rows[0].requestIds).toContain(b.requestId);
    expect(sql(`SELECT count(DISTINCT catalog_research_job_id) || '|' || max(j.fleet_count)
                FROM public.parts_sourcing_requests r JOIN public.catalog_research_job j ON j.id = r.catalog_research_job_id
                WHERE r.id IN ('${a.requestId}', '${b.requestId}')`)).toBe("1|2");
  });

  test("done-test 21 — Pending parts shows no fleet count anywhere", async ({ browser }) => {
    const { raw } = await dominionGroups();
    expect(raw).not.toMatch(/fleet_?count/i);
    const { ctx, dpage } = await openDominionPendingParts(browser);
    try {
      const table = dpage.locator("table").filter({ hasText: "Front oxygen sensor" });
      await expect(table).toBeVisible({ timeout: 60_000 });
      await expect(dpage.locator("body")).not.toContainText(/\b\d+\s+(fleets?|companies|compan(y|ies) asked)\b/i);
      await dpage.getByRole("row").filter({ hasText: "Front oxygen sensor" }).first().click();
      const details = dpage.getByTestId("pending-part-details");
      await expect(details).toBeVisible({ timeout: 30_000 });
      await expect(dpage.locator("body")).not.toContainText(/\b\d+\s+(fleets?|companies)\b/i);
    } finally {
      await ctx.close();
    }
    const narrow = await openDominionPendingParts(browser, 390);
    try {
      // Stitch D4: phone cards carry the number · where, the Source chip, the status and Open.
      // done-test 8's row (no number since Slice C): name, place only, Service log.
      const card = narrow.dpage
        .getByTestId("pending-part-card")
        .filter({ hasText: "Front oxygen sensor" })
        .filter({ has: narrow.dpage.getByTestId("pending-part-source").filter({ hasText: "Service log" }) })
        .filter({ has: narrow.dpage.getByText("Front", { exact: true }) })
        .first();
      await expect(card).toBeVisible({ timeout: 60_000 });
      await expect(card.getByTestId("pending-part-source")).toHaveText("Service log");
      await expect(card.getByRole("button", { name: "Open" })).toBeVisible();
      await shot(narrow.dpage, "D4-narrow");
    } finally {
      await narrow.ctx.close();
    }
  });

  test("done-test 20 — switch off: no Part number box, no Roam line, no outbox rows", async ({ page }) => {
    setFlag(GAPS, false);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    await openO2FromDraft(page);
    await expect(page.getByTestId("where-on-car")).toHaveCount(0);
    await page.getByTestId("items-used-add-other").first().click();
    const other = page.getByTestId("other-item-block");
    await expect(other).toBeVisible();
    await expect(other.getByTestId("other-item-part-number")).toHaveCount(0);
    await expect(page.getByTestId("roam-looks-it-up")).toHaveCount(0);

    const woId = await finishService(fleetA, MD_DISC_VEHICLE_ID, [otherItem({ name: "Switch-off sensor", partNumber: null })]);
    await drain();
    expect(outbox(woId)).toHaveLength(0);
    const items = await readItems(fleetA, woId);
    expect(items[0]?.sourcingState ?? null).toBeNull();
    const woB = await finishService(fleetB, B_VEHICLE_ID, [otherItem({ name: "Switch-off sensor", partNumber: null })]);
    expect(outbox(woB)).toHaveLength(0);
  });
});

