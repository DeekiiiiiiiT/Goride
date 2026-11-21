/**
 * Log service — Roam shows the parts that fit: Slice C done-tests C1–C7 (docs/log-service-parts-gaps-audit.md section 3)
 * on the real local stack. Real Fleet + Dominion apps, real fleet-ops / fleet-core / platform-catalog routes, the real
 * parts-sourcing-drain function and the real local database.
 *
 * Stand-ins: the made-up Roomy model and its two oxygen sensors are written straight into the catalogue (what Dominion →
 * Add a part does), so the test controls when "Roam has it".
 *
 * Start `pnpm testcopy`, then:
 * FLEET_BASE_URL=http://127.0.0.1:5181 ADMIN_BASE_URL=http://127.0.0.1:5180 node node_modules/@playwright/test/cli.js test \
 *   e2e/fleet-log-service-parts-that-fit.spec.ts --project=fleet --reporter=list --max-failures=1 --retries=0
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

// ── Company B: the same test company under other ids (own owner, car and plate). ──
const B_ORG = "d6010000-0000-4000-8000-0000000000c9";
const B_OWNER_ID = "d6010001-0000-4000-8000-0000000000c2";
const B_OWNER_EMAIL = "md-disc-c-owner@local.test";
const B_VEHICLE_ID = "md-disc-veh-c01";
function companyBSql(file: string): string {
  return readFileSync(join(process.cwd(), "e2e", "fixtures", file), "utf8")
    .replaceAll(MD_DISC_ORG, B_ORG)
    .replaceAll("d6010001-0000-4000-8000-000000000001", B_OWNER_ID)
    .replaceAll(MD_DISC_OWNER_EMAIL, B_OWNER_EMAIL)
    .replaceAll("test-org-md-disc", "test-org-md-disc-c")
    .replaceAll(MD_DISC_VEHICLE_ID, B_VEHICLE_ID)
    .replaceAll(MD_DISC_PLATE, "MD-DISC-C01")
    .replaceAll("Maintenance Discount Done Test", "Maintenance Discount Done Test C");
}
const seedCompanyB = () => queryMaintenanceDiscountDb(companyBSql("maintenance-discount-done-test-seed.sql"));
const teardownCompanyB = () => queryMaintenanceDiscountDb(companyBSql("maintenance-discount-done-test-teardown.sql"));

/** A made-up Roomy both companies' cars link to, and its two oxygen sensors. */
const CAT = "e2a50000-0000-4000-8000-0000000000c1";
const FRONT = { group: "e2a5000c-0000-4000-8000-000000000001", part: "e2a5000c-0000-4000-8000-000000000002", listing: "e2a5000c-0000-4000-8000-000000000003", number: "89467-FXC01", place: "before_cat", name: "Front oxygen sensor" };
const REAR = { group: "e2a5000c-0000-4000-8000-000000000011", part: "e2a5000c-0000-4000-8000-000000000012", listing: "e2a5000c-0000-4000-8000-000000000013", number: "89465-FXC02", place: "after_cat", name: "Rear oxygen sensor" };

function linkCar(vehicleId: string, on: boolean) {
  sql(`UPDATE fleet.vehicles SET payload_json = ${
    on ? `payload_json || jsonb_build_object('vehicle_catalog_id', '${CAT}')` : `payload_json - 'vehicle_catalog_id'`
  } WHERE id = '${vehicleId}'`);
}

/** What Dominion → Add a part writes: one group, one Toyota part for the oxygen sensor job, one listing on the Roomy. */
function addPart(p: typeof FRONT) {
  sql(`
    INSERT INTO public.part_interchange_group (id, code, label, fit_scope)
    VALUES ('${p.group}', 'FX-LSC-${p.number}', 'Fx Slice C ${p.name}', 'body') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.part_master (id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
                                    maintenance_component_id, evidence_url, catalog_decision, source_type, verified_at, updated_at)
    VALUES ('${p.part}', (SELECT id FROM public.part_category ORDER BY sort_order NULLS LAST, id LIMIT 1), '${p.name}', '${p.number}',
            'Toyota', 'oem', '${p.group}', '${o2.id}', 'https://fx-evidence.example/${p.number}', 'confirmed', 'other', now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.part_listing (id, interchange_group_id, vehicle_catalog_id, position, evidence_url, origin, verified_at,
                                     trust, trust_set_by, trust_set_at)
    VALUES ('${p.listing}', '${p.group}', '${CAT}', '${p.place}', 'https://fx-listing.example/${p.number}', 'manual', now(),
            'confirmed', 'owner', now())
    ON CONFLICT (id) DO NOTHING;`);
}

function removeParts() {
  for (const p of [FRONT, REAR]) {
    sql(`UPDATE public.maintenance_work_order_lines SET part_id = NULL WHERE part_id = '${p.part}';
         DELETE FROM public.part_listing WHERE interchange_group_id = '${p.group}';
         DELETE FROM public.part_master WHERE id = '${p.part}';
         DELETE FROM public.part_interchange_group WHERE id = '${p.group}';`);
  }
}

function cleanupAsks() {
  sql(`
    DELETE FROM public.fleet_parts_notices WHERE vehicle_catalog_id = '${CAT}' OR organization_id IN ('${MD_DISC_ORG}', '${B_ORG}');
    DELETE FROM public.catalog_research_event WHERE job_id IN (SELECT id FROM public.catalog_research_job WHERE vehicle_catalog_id = '${CAT}');
    DELETE FROM pgmq.q_catalog_research WHERE message->>'jobId' IN (SELECT id::text FROM public.catalog_research_job WHERE vehicle_catalog_id = '${CAT}');
    UPDATE public.parts_sourcing_requests SET catalog_research_job_id = NULL
      WHERE catalog_research_job_id IN (SELECT id FROM public.catalog_research_job WHERE vehicle_catalog_id = '${CAT}');
    DELETE FROM public.parts_sourcing_outbox WHERE request_id IN (SELECT id FROM public.parts_sourcing_requests WHERE vehicle_catalog_id = '${CAT}');
    DELETE FROM public.parts_sourcing_requests WHERE vehicle_catalog_id = '${CAT}';
    DELETE FROM public.catalog_research_job WHERE vehicle_catalog_id = '${CAT}';`);
}

function teardownAll() {
  teardownMaintenanceDiscountDone();
  teardownCompanyB();
  cleanupAsks();
  removeParts();
  sql(`DELETE FROM public.vehicle_catalog WHERE id = '${CAT}'`);
}

// ── Switches ──
const ITEMS = "feature_flag:service_items";
const FINDINGS = "feature_flag:inspection_findings";
const GAPS = "feature_flag:log_service_parts_gaps";
const FLAGS = [ITEMS, FINDINGS, GAPS];
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
let opsA: Call;
let coreA: Call;
let coreB: Call;
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

type Group = {
  groupId: string; vehicleCatalogId: string | null; requestIds: string[];
  positionCodes: string[] | null; componentId: string | null; status: string;
};
// Research engine RE-23: Dominion never shows who asked, what they typed or where they asked from.
const DOMINION_PRIVATE = ["requestedName", "requestedPartNumber", "origins", "firstAsked", "lastAsked", "fleetCount"];
async function dominionGroups(): Promise<Group[]> {
  const res = await dominion("GET", "/make-server-37f42386/admin/pending-catalog/parts-queue");
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  const items = res.json.items as Array<Record<string, unknown>>;
  for (const g of items) for (const k of DOMINION_PRIVATE) expect(g, `Dominion row shows ${k}`).not.toHaveProperty(k);
  return (items as unknown as Group[]).filter((g) => g.vehicleCatalogId === CAT);
}
/** What the server keeps for a group (typed name, number, origins stay server-side). */
function storedAsk(requestIds: string[]): { requestedName: string | null; requestedPartNumber: string | null; origins: string[] } {
  const ids = requestIds.map((id) => `'${id}'`).join(",");
  const [name, number, origins] = sql(`SELECT
      coalesce((SELECT j.requested_name FROM public.parts_sourcing_requests r JOIN public.catalog_research_job j ON j.id = r.catalog_research_job_id
                WHERE r.id IN (${ids}) AND j.requested_name IS NOT NULL LIMIT 1), '') || '|' ||
      coalesce((SELECT j.requested_part_number FROM public.parts_sourcing_requests r JOIN public.catalog_research_job j ON j.id = r.catalog_research_job_id
                WHERE r.id IN (${ids}) AND j.requested_part_number IS NOT NULL LIMIT 1), '') || '|' ||
      coalesce((SELECT string_agg(DISTINCT r.origin, ',' ORDER BY r.origin) FROM public.parts_sourcing_requests r WHERE r.id IN (${ids})), '')`).split("|");
  return { requestedName: name || null, requestedPartNumber: number || null, origins: origins ? origins.split(",") : [] };
}
const rearGroups = async () =>
  (await dominionGroups()).filter((g) => g.componentId === o2.id && (g.positionCodes ?? []).join(",") === REAR.place);

async function findFor(call: Call, vehicleId: string, places: string) {
  const res = await call("GET", `/make-server-37f42386/parts/find?vehicleId=${vehicleId}&componentId=${o2.id}&places=${places}`);
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  const parts = ((res.json.plainSections as Array<{ items: Array<{ partId: string; fitLabel?: string }> }>) ?? []).flatMap((s) => s.items);
  return { parts, ask: res.json.ask as { state: string; askedAt: string | null } | undefined, raw: res.json };
}

const latestWo = () =>
  sql(`SELECT id FROM public.maintenance_work_orders WHERE vehicle_id = '${MD_DISC_VEHICLE_ID}' AND voided_at IS NULL
       AND status <> 'planned' ORDER BY created_at DESC LIMIT 1`);

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

let odo = 199_000;
async function gotoHub(page: Page) {
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({ timeout: 60_000 });
}

/** A saved draft holding the Oxygen sensor job: the wizard opens on Review, then Edit opens the job's details. */
async function openO2FromDraft(page: Page, opts: { items?: boolean } = {}) {
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
      line: { categoryId: o2.id, categoryCode: o2.code, categoryName: o2.name, action: "replace", labor: 4000, values: {} },
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
  if (opts.items !== false) await expect(page.getByTestId("items-used")).toBeVisible({ timeout: 30_000 });
  // The group's answer (which carries the switches) arrives just after the form opens.
  await page.waitForTimeout(2000);
}

async function fillLabour(page: Page, amount: string) {
  await page.locator("#labor-amount").fill(amount);
}

const pickPlace = (page: Page, label: string) =>
  page.getByTestId("where-on-car").getByRole("button", { name: label }).click();
const saveLine = (page: Page) => page.getByRole("button", { name: /^Save line/ }).first();

async function logIt(page: Page) {
  await page.getByRole("button", { name: /^Log service$/i }).click();
  await expect(page.getByTestId("log-service-review-summary")).toBeHidden({ timeout: 60_000 });
}

/** No box anywhere in the open window asks for a part number (rule 8). */
async function expectNoPartNumberBox(page: Page) {
  const dialog = page.getByRole("dialog").first();
  await expect(dialog.locator("#part-number")).toHaveCount(0);
  await expect(dialog.getByTestId("other-item-part-number")).toHaveCount(0);
  await expect(dialog.getByText(/Part number/i)).toHaveCount(0);
}

async function openDominionPendingParts(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dpage = await ctx.newPage();
  await seedMmP01Session(dpage);
  const admin = process.env.ADMIN_BASE_URL?.trim() || "http://127.0.0.1:5180";
  await dpage.goto(`${admin}/?page=pending-motor-vehicles&tab=parts`);
  await dpage.getByTestId("pending-tab-parts").click({ timeout: 60_000 });
  await expect(dpage.getByTestId("research-parts-tab")).toBeVisible({ timeout: 60_000 });
  // Nothing waiting for the owner → "You're all caught up"; show the whole list.
  if (await dpage.getByTestId("all-caught-up").isVisible()) {
    await dpage.getByTestId("see-whats-waiting").click();
    await dpage.getByTestId("filter-all").click();
  }
  return { ctx, dpage };
}


/** LC-18: the Not done yet list is folded into one block per inspection — open them all. */
async function openFoundBlocks(section: import("@playwright/test").Locator) {
  const toggles = section.getByTestId("found-group-toggle");
  const n = await toggles.count();
  for (let i = 0; i < n; i += 1) {
    if ((await toggles.nth(i).getAttribute("aria-expanded")) === "false") await toggles.nth(i).click();
  }
}

const carRow = (page: Page) => page.getByRole("row").filter({ hasText: MD_DISC_PLATE }).first();

// ── Shared state between the serial tests ──
let rearRequestA = "";
let plannedLineId = "";

test.describe.configure({ mode: "serial" });

test.describe("Log service — Roam shows the parts that fit (Slice C)", () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    for (const k of FLAGS) savedFlags[k] = sql(`SELECT value::text FROM public.kv_store_37f42386 WHERE key = '${k}'`) || null;
    const row = sql(`SELECT id || '|' || name || '|' || code FROM public.maintenance_service_categories
                     WHERE kind = 'component' AND code = 'oxygen_sensor' LIMIT 1`);
    const [id, name, code] = row.split("|");
    if (!id) throw new Error("Oxygen sensor job missing");
    o2 = { id, name, code };
    teardownAll();
    applyMaintenanceDiscountDoneSeed();
    seedCompanyB();
    applyMmP01HttpSeed();
    sql(`INSERT INTO public.vehicle_catalog (id, make, model, year, model_code, engine_displacement_l)
         VALUES ('${CAT}', 'Toyota', 'Roomy', 2019, 'M900A', 1.0) ON CONFLICT (id) DO NOTHING`);
    linkCar(MD_DISC_VEHICLE_ID, true);
    linkCar(B_VEHICLE_ID, true);
    addPart(FRONT);
    // The cron stays quiet: drains below are run by hand.
    sql(`DELETE FROM private.fleet_ops_secrets WHERE name IN ('parts_sourcing_drain_secret', 'functions_base_url')`);
    for (const k of FLAGS) setFlag(k, true);
    opsA = await caller(MD_DISC_OWNER_EMAIL, MD_DISC_PASSWORD, "fleet-ops");
    coreA = await caller(MD_DISC_OWNER_EMAIL, MD_DISC_PASSWORD, "fleet-core");
    coreB = await caller(B_OWNER_EMAIL, MD_DISC_PASSWORD, "fleet-core");
    dominion = await caller("", "", "platform-catalog", true);
    await new Promise((r) => setTimeout(r, FLAG_CACHE_WAIT_MS));
  });

  test.afterAll(() => {
    for (const k of FLAGS) {
      if (savedFlags[k]) sql(`UPDATE public.kv_store_37f42386 SET value = '${savedFlags[k]}'::jsonb WHERE key = '${k}'`);
      else sql(`DELETE FROM public.kv_store_37f42386 WHERE key = '${k}'`);
    }
    teardownAll();
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

  test("C1 — Front: the Toyota sensor shows Made for your car; tap → the line saves with it; no part number box", async ({ page }) => {
    await openO2FromDraft(page);
    await expect(page.getByTestId("parts-fit-pick-place")).toBeVisible();
    await expectNoPartNumberBox(page);
    await pickPlace(page, "Front (Air fuel ratio sensor)");
    const panel = page.getByTestId("parts-fit-panel");
    await expect(panel.getByTestId("parts-fit-title")).toHaveText("Parts that fit your Toyota Roomy", { timeout: 30_000 });
    const card = panel.locator(`[data-testid="parts-fit-card"][data-part-id="${FRONT.part}"]`);
    await expect(card).toBeVisible();
    // Front only: the rear listing would be filtered out (none is on file yet anyway).
    await expect(panel.getByTestId("parts-fit-card")).toHaveCount(1);
    await expect(card).toContainText(FRONT.name);
    await expect(card).toContainText("Toyota");
    await expect(card.getByTestId("parts-fit-number")).toHaveText(FRONT.number);
    await expect(card.getByTestId("parts-fit-badge").first()).toHaveAttribute("data-fit", "made_for_car");
    await expect(card).toContainText("Made for your car");
    await expect(page.getByText("Link part (optional)")).toHaveCount(0);
    await expectNoPartNumberBox(page);
    await shot(page, "C1-panel", panel);
    await card.click();
    await expect(panel.getByTestId("parts-fit-using")).toContainText("Using Toyota front oxygen sensor");
    await shot(page, "C1-chosen", panel);
    await fillLabour(page, "4000");
    await saveLine(page).click();
    await expect(page.getByTestId("log-service-review-summary")).toBeVisible({ timeout: 30_000 });
    await logIt(page);
    const woId = latestWo();
    expect(sql(`SELECT part_id || '|' || array_to_string(positions, ',') FROM public.maintenance_work_order_lines
                WHERE work_order_id = '${woId}' AND voided_at IS NULL`)).toBe(`${FRONT.part}|${FRONT.place}`);
  });

  test("C2 — Rear, nothing on file: Ask Roam → one Dominion row (Find parts); the panel then reads Roam is looking", async ({ page, browser }) => {
    expect((await findFor(coreA, MD_DISC_VEHICLE_ID, REAR.place)).ask?.state).toBe("none");
    await openO2FromDraft(page);
    await pickPlace(page, "Rear (Oxygen sensor No.2)");
    const none = page.getByTestId("parts-fit-none");
    await expect(none).toBeVisible({ timeout: 30_000 });
    await expect(none).toContainText("Roam doesn't have this part for your Toyota Roomy yet");
    await expect(none).toContainText("You can still save this job now and add the part later.");
    await shot(page, "C2-none", none);
    await none.getByTestId("parts-fit-ask").click();
    const looking = page.getByTestId("parts-fit-looking");
    await expect(looking).toBeVisible({ timeout: 30_000 });
    await expect(looking.getByTestId("parts-fit-asked-on")).toHaveText(/^Asked on \d{1,2} \w{3} \d{4}$/);
    await expect(page.getByTestId("parts-fit-ask")).toHaveCount(0);
    await shot(page, "C2-looking", looking);

    rearRequestA = sql(`SELECT id FROM public.parts_sourcing_requests WHERE organization_id = '${MD_DISC_ORG}'
                        AND vehicle_catalog_id = '${CAT}' AND kind = 'add_part_info'`);
    expect(rearRequestA).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql(`SELECT maintenance_component_id || '|' || array_to_string(position_codes, ',') || '|' || coalesce(old_part_number, '')
                FROM public.parts_sourcing_requests WHERE id = '${rearRequestA}'`)).toBe(`${o2.id}|${REAR.place}|`);
    const groups = await rearGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].requestIds).toEqual([rearRequestA]);
    expect(storedAsk(groups[0].requestIds).origins).toEqual(["find_parts"]);

    const { ctx, dpage } = await openDominionPendingParts(browser);
    try {
      const row = dpage.getByTestId("parts-row").filter({ hasText: o2.name }).filter({ hasText: /Rear/ });
      await expect(row).toHaveCount(1, { timeout: 60_000 });
      await expect(row).toContainText("Toyota Roomy");
      // Where the ask came from ("Find parts") stays server-side (RE-23).
      await expect(row).not.toContainText("Find parts");
    } finally {
      await ctx.close();
    }

    // Opened again later: still looking (the server's answer), never a second Ask button.
    await page.reload();
    await page.getByText(/Loading application/).waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
    await openO2FromDraft(page);
    await pickPlace(page, "Rear (Oxygen sensor No.2)");
    await expect(page.getByTestId("parts-fit-looking")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("parts-fit-ask")).toHaveCount(0);
  });

  test("C3 — a second company asks for the same part: still one Dominion row", async () => {
    const asked = await coreB("POST", "/make-server-37f42386/parts/request", {
      kind: "add_part_info",
      vehicleId: B_VEHICLE_ID,
      maintenanceComponentId: o2.id,
      positionCodes: [REAR.place],
      needText: "oxygen sensor · Rear (Oxygen sensor No.2)",
    });
    expect(asked.status, JSON.stringify(asked.json)).toBe(200);
    const groups = await rearGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].requestIds).toHaveLength(2);
    expect(groups[0].requestIds).toContain(rearRequestA);
    // Company B's panel also reads "looking".
    expect((await findFor(coreB, B_VEHICLE_ID, REAR.place)).ask?.state).toBe("looking");
  });

  test("C4 — Dominion Added — pick the part: both companies get Part on file; the panel lists it", async ({ page, browser }) => {
    addPart(REAR);
    const { ctx, dpage } = await openDominionPendingParts(browser);
    try {
      const row = dpage.getByTestId("parts-row").filter({ hasText: o2.name }).filter({ hasText: /Rear/ });
      await expect(row).toHaveCount(1, { timeout: 60_000 });
      await row.click();
      await dpage.getByTestId("added-pick-part-open").click({ timeout: 30_000 });
      const pick = dpage.getByTestId("added-pick-part");
      const option = pick.locator(`[data-testid="added-pick-part-row"][data-part-id="${REAR.part}"]`);
      await expect(option).toBeVisible({ timeout: 30_000 });
      await expect(option).toContainText(REAR.number);
      // The front sensor is a different place: not offered.
      await expect(pick.locator(`[data-part-id="${FRONT.part}"]`)).toHaveCount(0);
      await shot(dpage, "C4-dominion-pick", pick);
      await option.click();
      await pick.getByTestId("added-pick-part-confirm").click();
      await expect(dpage.getByText("Added. 2 companies were told the part is on file.")).toBeVisible({ timeout: 30_000 });
    } finally {
      await ctx.close();
    }
    expect(sql(`SELECT string_agg(DISTINCT status, ',') FROM public.parts_sourcing_requests WHERE vehicle_catalog_id = '${CAT}'
                AND position_codes = ARRAY['${REAR.place}']`)).toBe("resolved");
    expect(sql(`SELECT count(*) || '|' || count(DISTINCT organization_id) FROM public.fleet_parts_notices
                WHERE vehicle_catalog_id = '${CAT}' AND read_at IS NULL`)).toBe("2|2");

    // The panel now lists it, for both companies.
    for (const [call, car] of [[coreA, MD_DISC_VEHICLE_ID], [coreB, B_VEHICLE_ID]] as const) {
      const found = await findFor(call, car, REAR.place);
      expect(found.parts.map((p) => p.partId)).toEqual([REAR.part]);
    }

    // Company A's bell: the message above the alerts, marked read once opened; tap opens Find parts for that car + job.
    await gotoHub(page);
    await page.getByRole("button", { name: "Maintenance alerts" }).click();
    const note = page.getByTestId("parts-notice-row");
    await expect(note).toHaveCount(1, { timeout: 30_000 });
    await expect(note).toContainText("Roam added the oxygen sensor for your Toyota Roomy");
    await expect(note).toContainText("Tap to see the parts that fit.");
    await shot(page, "C4-bell", page.getByTestId("mm-alerts-menu"));
    await expect.poll(() => sql(`SELECT count(*) FROM public.fleet_parts_notices WHERE organization_id = '${MD_DISC_ORG}' AND read_at IS NULL`),
      { timeout: 15_000 }).toBe("0");
    await note.click();
    await page.waitForURL(/tab=find-parts/, { timeout: 30_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get("vehicle")).toBe(MD_DISC_VEHICLE_ID);
    expect(url.searchParams.get("part")).toBe(o2.id);
    // Company B's message is still unread (each company has its own).
    expect(sql(`SELECT count(*) FROM public.fleet_parts_notices WHERE organization_id = '${B_ORG}' AND read_at IS NULL`)).toBe("1");
  });

  test("C5 — Plan it → Not done yet with Rear + the part, J$ 0; Log it now opens it with the part; saving closes it", async ({ page }) => {
    await openO2FromDraft(page);
    await pickPlace(page, "Rear (Oxygen sensor No.2)");
    const card = page.locator(`[data-testid="parts-fit-card"][data-part-id="${REAR.part}"]`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    await page.getByTestId("parts-fit-plan-it").click();
    const overlay = page.getByTestId("plan-job-dialog");
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("Plan this job for later");
    await expect(overlay.getByTestId("plan-job-line")).toContainText("Oxygen sensor · Rear (Oxygen sensor No.2)");
    await expect(overlay.getByTestId("plan-job-part")).toContainText(REAR.number);
    await expect(overlay).toContainText("J$ 0 · not charged yet");
    await expect(overlay).not.toContainText(/est\.|Pre-allocation|84,210/);
    await overlay.getByTestId("plan-job-note").fill("buy at Northside Auto on Friday");
    await shot(page, "C5-overlay", overlay);
    await overlay.getByTestId("plan-job-confirm").click();
    await expect(page.getByText("Oxygen sensor · Rear (Oxygen sensor No.2) added to Not done yet")).toBeVisible({ timeout: 30_000 });
    // It was the only job: the window closes.
    await expect(page.getByTestId("log-service-job-header")).toHaveCount(0, { timeout: 30_000 });

    const planned = sql(`SELECT l.id || '|' || wo.status || '|' || array_to_string(l.positions, ',') || '|' || l.part_id || '|' || l.recommended
                           || '|' || coalesce(wo.total_cost, 0)::numeric::int
                         FROM public.maintenance_work_order_lines l JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
                         WHERE wo.vehicle_id = '${MD_DISC_VEHICLE_ID}' AND wo.status = 'planned' AND l.voided_at IS NULL`);
    const [lineId, status, places, partId, recommended, total] = planned.split("|");
    plannedLineId = lineId;
    expect([status, places, partId, recommended, total]).toEqual(["planned", REAR.place, REAR.part, "true", "0"]);
    // Never in service history or spend.
    const list = await opsA("GET", `/maintenance-work-orders?vehicleId=${MD_DISC_VEHICLE_ID}`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain(lineId);
    const plannedWo = sql(`SELECT work_order_id FROM public.maintenance_work_order_lines WHERE id = '${lineId}'`);
    expect(JSON.stringify(list.json)).not.toContain(plannedWo);

    // The Not done yet list on the car.
    await gotoHub(page);
    await carRow(page).getByTestId("found-to-do-chip").click();
    await expect(page.getByTestId("mm-due-drawer")).toBeVisible({ timeout: 30_000 });
    const section = page.getByTestId("found-by-inspection");
    await expect(section.getByTestId("found-loading")).toHaveCount(0, { timeout: 30_000 });
    await openFoundBlocks(section);
    const pcard = section.locator('[data-testid="found-card"][data-source="planned"]');
    await expect(pcard).toHaveCount(1);
    await expect(pcard).toContainText("Oxygen sensor · Rear (Oxygen sensor No.2)");
    await expect(pcard.getByTestId("found-card-line")).toHaveText(/^Planned \d{1,2} \w{3} \d{4}$/);
    await expect(pcard.getByTestId("planned-part")).toContainText(REAR.number);
    await expect(pcard).toContainText("buy at Northside Auto on Friday");
    await shot(page, "C5-not-done-yet", section);
    await pcard.getByTestId("found-log-it-now").click();

    const odoBox = page.locator("#svc-odo");
    await expect(odoBox).toBeVisible({ timeout: 30_000 });
    odo += 100;
    await odoBox.fill(String(odo));
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByTestId("found-banner")).toContainText("From your Not done yet list (planned", { timeout: 30_000 });
    await expect(page.getByTestId("parts-fit-using")).toContainText("Using Toyota rear oxygen sensor", { timeout: 30_000 });
    await expect(page.getByTestId("planned-hint-fitting")).toHaveText(/What did the garage charge for fitting it\?/);
    await expect(page.getByTestId("planned-hint-part")).toContainText("What you paid for the part");
    await expect(page.getByTestId("parts-fit-plan-it")).toHaveCount(0);
    await expectNoPartNumberBox(page);
    await shot(page, "C5-log-it-now", page.getByRole("dialog").first());
    await fillLabour(page, "4000");
    await page.getByTestId("items-used-add-other").first().click();
    const other = page.getByTestId("other-item-block");
    await other.getByLabel("What was it?").fill(REAR.name);
    await other.getByLabel(/^Cost each — other item/).fill("9500");
    const save = saveLine(page);
    if (await save.isVisible().catch(() => false)) await save.click();
    await page.getByRole("button", { name: /continue to review/i }).click();
    await expect(page.getByTestId("log-service-review-summary")).toContainText("J$ 13,500", { timeout: 30_000 });
    await logIt(page);

    const done = sql(`SELECT wo.status || '|' || d.part_id FROM public.maintenance_work_order_lines d
                      JOIN public.maintenance_work_orders wo ON wo.id = d.work_order_id
                      WHERE d.from_found_line_id = '${plannedLineId}' AND d.voided_at IS NULL AND wo.voided_at IS NULL`);
    expect(done).toBe(`completed|${REAR.part}`);
    expect(sql(`SELECT public.maintenance_found_line_is_open('${plannedLineId}')`)).toBe("f");
    const found = await opsA("GET", `/maintenance-found-work?vehicleId=${MD_DISC_VEHICLE_ID}`);
    expect((found.json.items as Array<{ lineId: string }>).map((i) => i.lineId)).not.toContain(plannedLineId);
  });

  test("C6 — Other item Exhaust clip, no number asked: one Dominion row by name", async ({ page }) => {
    await openO2FromDraft(page);
    await pickPlace(page, "Front (Air fuel ratio sensor)");
    await expect(page.getByTestId("parts-fit-card").first()).toBeVisible({ timeout: 30_000 });
    // No card tapped (picking a part is optional; there is no Skip button).
    await expect(page.getByTestId("parts-fit-skip")).toHaveCount(0);
    await fillLabour(page, "2000");
    await page.getByTestId("items-used-add-other").first().click();
    const other = page.getByTestId("other-item-block");
    await other.getByLabel("What was it?").fill("Exhaust clip");
    await other.getByLabel(/^Cost each — other item/).fill("800");
    await expect(other.getByTestId("roam-looks-it-up")).toBeVisible();
    await expectNoPartNumberBox(page);
    await shot(page, "C6-other-item", other);
    await saveLine(page).click();
    await expect(page.getByTestId("log-service-review-summary")).toBeVisible({ timeout: 30_000 });
    await logIt(page);
    const woId = latestWo();
    await drain();
    const reqId = sql(`SELECT request_id FROM public.parts_sourcing_outbox WHERE work_order_id = '${woId}' AND state = 'sent'`);
    expect(reqId).toMatch(/^[0-9a-f-]{36}$/);
    const groups = (await dominionGroups()).filter((g) => g.requestIds.includes(reqId));
    expect(groups).toHaveLength(1);
    expect(storedAsk(groups[0].requestIds)).toMatchObject({ requestedName: "Exhaust clip", requestedPartNumber: null });
  });

  test("C7 — switch off: today's screens exactly; Plan it and the bell's messages refuse", async ({ page }) => {
    setFlag(GAPS, false);
    await page.waitForTimeout(FLAG_CACHE_WAIT_MS);
    await openO2FromDraft(page);
    await expect(page.getByTestId("where-on-car")).toHaveCount(0);
    await expect(page.getByTestId("parts-fit-panel")).toHaveCount(0);
    await expect(page.locator("#brand")).toBeVisible();
    await expect(page.locator("#part-number")).toBeVisible();
    await expect(page.getByText("Link part (optional)")).toBeVisible();
    await page.getByTestId("items-used-add-other").first().click();
    await expect(page.getByTestId("other-item-part-number")).toHaveCount(0);
    await expect(page.getByTestId("roam-looks-it-up")).toHaveCount(0);

    const plan = await opsA("POST", "/maintenance-planned-jobs", {
      vehicleId: MD_DISC_VEHICLE_ID, jobId: o2.id, places: [], partId: null, note: null, idempotencyKey: crypto.randomUUID(),
    });
    expect(plan.status).toBe(404);
    expect(plan.json.code).toBe("log_service_parts_gaps_off");
    const notices = await coreA("GET", "/make-server-37f42386/parts/notices");
    expect(notices.status).toBe(404);
    const found = await findFor(coreA, MD_DISC_VEHICLE_ID, REAR.place);
    expect(found.ask).toBeUndefined();
    expect(JSON.stringify(found.raw)).not.toContain("fitLabel");
  });
});
