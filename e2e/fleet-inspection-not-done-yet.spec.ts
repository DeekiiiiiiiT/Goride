/**
 * Inspection "Not done yet" — LC-10 … LC-16 (docs/log-service-parts-gaps-audit.md section 3) on the real local stack:
 * real Fleet app, real fleet-ops / fleet-core routes and the real local database.
 *
 *  N1 Logging an inspection: a Not done yet job shows the parts to buy, gets its own quote card (the same job form),
 *     and the review names the place. Saved: J$ 0 found line with the quote; the service total is only the fee.
 *  N2 The Not done yet tab (old Work orders link lands there): place, quote, total quoted, parts to buy, From
 *     inspection + View inspection (Service details offers Add a job to this inspection).
 *  N3 Add a job to the saved inspection: the real Log service window in add mode, Also do: Relearn, quotes, Review →
 *     two J$ 0 found lines on that inspection; what was paid unchanged.
 *  N4 Done: Date & mileage → the quote filled in, Also done on this visit ticks the other job → one service in
 *     Service history; both jobs leave Not done yet.
 *
 * Start `pnpm testcopy`, then:
 * FLEET_BASE_URL=http://127.0.0.1:5181 node node_modules/@playwright/test/cli.js test \
 *   e2e/fleet-inspection-not-done-yet.spec.ts --project=fleet --reporter=list --max-failures=1 --retries=0
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
  MD_DISC_OWNER_EMAIL,
  MD_DISC_ORG,
  MD_DISC_PLATE,
  MD_DISC_VEHICLE_ID,
  queryMaintenanceDiscountDb,
  teardownMaintenanceDiscountDone,
} from "./helpers/maintenanceDiscountDoneTestDb";
import { getLocalSupabaseKeys, signInPlatformAal2 } from "./helpers/mmP01Auth";

function sql(q: string): string {
  return queryMaintenanceDiscountDb(q)
    .split(/\r?\n/)
    .filter((l) => !/^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SET|CREATE \w+|DROP \w+|DO|BEGIN|COMMIT)$/.test(l.trim()))
    .join("\n")
    .trim();
}

// ── A made-up Roomy and its front oxygen sensor (what Dominion → Add a part writes) ──
const CAT = "e2a50000-0000-4000-8000-0000000000d1";
const FRONT = { group: "e2a5000d-0000-4000-8000-000000000001", part: "e2a5000d-0000-4000-8000-000000000002", listing: "e2a5000d-0000-4000-8000-000000000003", number: "89467-NDY01" };
// Two made-up service jobs: cleaning, and the relearn Dominion says to do after it.
const CLEAN = { id: "e2a5000d-0000-4000-8000-0000000000a1", code: "fx_ndy_throttle_clean", name: "Fx Throttle Clean" };
const RELEARN = { id: "e2a5000d-0000-4000-8000-0000000000a2", code: "fx_ndy_throttle_relearn", name: "Fx Throttle Relearn" };
const RELEARN_NOTE = "Needed after cleaning or the idle will be rough";

type Job = { id: string; name: string; code: string };
let o2: Job;
let insp: Job;

function seedCatalogue() {
  sql(`
    INSERT INTO public.vehicle_catalog (id, make, model, year, model_code, engine_displacement_l)
    VALUES ('${CAT}', 'Toyota', 'Roomy', 2019, 'M900A', 1.0) ON CONFLICT (id) DO NOTHING;
    UPDATE fleet.vehicles SET payload_json = payload_json || jsonb_build_object('vehicle_catalog_id', '${CAT}')
      WHERE id = '${MD_DISC_VEHICLE_ID}';
    INSERT INTO public.part_interchange_group (id, code, label, fit_scope)
    VALUES ('${FRONT.group}', 'FX-NDY-${FRONT.number}', 'Fx NDY front sensor', 'body') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.part_master (id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
                                    maintenance_component_id, evidence_url, catalog_decision, source_type, verified_at, updated_at)
    VALUES ('${FRONT.part}', (SELECT id FROM public.part_category ORDER BY sort_order NULLS LAST, id LIMIT 1), 'Front oxygen sensor',
            '${FRONT.number}', 'Toyota', 'oem', '${FRONT.group}', '${o2.id}', 'https://fx-evidence.example/ndy', 'confirmed', 'other', now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.part_listing (id, interchange_group_id, vehicle_catalog_id, position, evidence_url, origin, verified_at,
                                     trust, trust_set_by, trust_set_at)
    VALUES ('${FRONT.listing}', '${FRONT.group}', '${CAT}', 'before_cat', 'https://fx-listing.example/ndy', 'manual', now(),
            'confirmed', 'owner', now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.maintenance_service_categories (id, code, name, plain_name, kind, status, is_part, parent_id, default_action,
                                                       position_scheme, quick_job_eligible, records_findings, field_schema)
    SELECT v.id::uuid, v.code, v.name, v.name, 'component', 'active', false, sys.id, 'clean', 'none', true, false, '{"fields":[]}'::jsonb
    FROM (VALUES ('${CLEAN.id}', '${CLEAN.code}', '${CLEAN.name}'), ('${RELEARN.id}', '${RELEARN.code}', '${RELEARN.name}')) v(id, code, name)
    CROSS JOIN (SELECT id FROM public.maintenance_service_categories WHERE code = 'sys_engine' LIMIT 1) sys
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.maintenance_job_relations (from_category_id, to_category_id, relation_type, note)
    VALUES ('${CLEAN.id}', '${RELEARN.id}', 'recommended_with', '${RELEARN_NOTE}') ON CONFLICT DO NOTHING;`);
}

function teardownCatalogue() {
  sql(`
    UPDATE public.maintenance_work_order_lines SET part_id = NULL WHERE part_id = '${FRONT.part}';
    DELETE FROM public.part_listing WHERE interchange_group_id = '${FRONT.group}';
    DELETE FROM public.part_master WHERE id = '${FRONT.part}';
    DELETE FROM public.part_interchange_group WHERE id = '${FRONT.group}';
    DELETE FROM public.maintenance_job_relations WHERE from_category_id IN ('${CLEAN.id}', '${RELEARN.id}');`);
}

function teardownAll() {
  teardownMaintenanceDiscountDone();
  teardownCatalogue();
  // The made-up jobs go after the test company's services are gone (lines point at them).
  sql(`DELETE FROM public.maintenance_service_categories WHERE id IN ('${CLEAN.id}', '${RELEARN.id}');
       DELETE FROM public.vehicle_catalog WHERE id = '${CAT}';`);
}

// ── Switches ──
const FLAGS = ["feature_flag:service_items", "feature_flag:inspection_findings", "feature_flag:log_service_parts_gaps"];
const FLAG_CACHE_WAIT_MS = 31_000;
const savedFlags: Record<string, string | null> = {};
function setFlag(key: string, on: boolean) {
  const value = JSON.stringify({ enabled: false, enabledForOrgs: on ? [MD_DISC_ORG] : [], updatedAt: new Date().toISOString() });
  sql(`INSERT INTO public.kv_store_37f42386 (key, value) VALUES ('${key}', '${value}'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`);
}

// ── Real routes ──
type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;
let ops: Call;
async function caller(fn: string): Promise<Call> {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const { access_token } = await signInPlatformAal2(base, anonKey, MD_DISC_OWNER_EMAIL, MD_DISC_PASSWORD);
  return async (method, path, body) => {
    const res = await fetch(`${base}/functions/v1/${fn}${path}`, {
      method,
      headers: { apikey: anonKey, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
}

// ── Screens ──
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

async function gotoHub(page: Page, query = "") {
  await page.goto(`/maintenance${query}`);
  await expect(page.getByRole("heading", { name: /fleet maintenance/i })).toBeVisible({ timeout: 60_000 });
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
          formMeta: { date: new Date().toISOString().slice(0, 10), type: line.categoryName, currency: "JMD", odo: 198807, provider: "Whol-Hearted Car Service Ltd", notes: "", invoiceUrl: "" },
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
      line: { categoryId: insp.id, categoryCode: insp.code, categoryName: insp.name, action: "inspect", labor: 8000, values: { cost_mode: "total", service_amount: 8000 } },
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
}

const saveLine = (page: Page) => page.getByRole("button", { name: /^Save line/ }).first();
const tabSection = (page: Page) => page.getByTestId("found-by-inspection");

async function openNotDoneYetTab(page: Page) {
  await gotoHub(page, "?tab=work-orders"); // the old Work orders link lands on the new tab (LC-11)
  const section = tabSection(page);
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section.getByTestId("found-loading")).toHaveCount(0, { timeout: 30_000 });
  return section;
}

const foundLines = () =>
  sql(`SELECT l.id || '|' || l.component_id || '|' || l.line_total::numeric::int || '|' || coalesce(l.values_json->>'quote_amount', '') || '|'
              || coalesce(array_to_string(l.positions, ','), '') || '|' || l.work_order_id
       FROM public.maintenance_work_order_lines l JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
       WHERE wo.vehicle_id = '${MD_DISC_VEHICLE_ID}' AND l.recommended = true AND l.voided_at IS NULL
         AND public.maintenance_found_line_is_open(l.id)
       ORDER BY l.created_at`)
    .split("\n")
    .filter(Boolean)
    .map((r) => {
      const [id, jobId, lineTotal, quote, places, woId] = r.split("|");
      return { id, jobId, lineTotal: Number(lineTotal), quote: quote ? Number(quote) : null, places, woId };
    });

let inspectionWo = "";
let odo = 199_500;

test.describe.configure({ mode: "serial" });

test.describe("Inspection Not done yet — quotes, Add a job, Done (LC-10 … LC-16)", () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    for (const k of FLAGS) savedFlags[k] = sql(`SELECT value::text FROM public.kv_store_37f42386 WHERE key = '${k}'`) || null;
    const job = (where: string): Job => {
      const [id, name, code] = sql(`SELECT id || '|' || name || '|' || code FROM public.maintenance_service_categories
                                    WHERE kind = 'component' AND ${where} ORDER BY name LIMIT 1`).split("|");
      if (!id) throw new Error(`job missing: ${where}`);
      return { id, name, code };
    };
    o2 = job("code = 'oxygen_sensor'");
    insp = job("records_findings = true AND coalesce(status, 'active') = 'active'");
    teardownAll();
    applyMaintenanceDiscountDoneSeed();
    seedCatalogue();
    for (const k of FLAGS) setFlag(k, true);
    ops = await caller("fleet-ops");
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

  test("N1 — logging an inspection: parts to buy, a quote card with the same form, the place on Review; J$ 0 + quote saved", async ({ page }) => {
    await openWizardWithInspection(page);
    await page.getByTestId("log-service-review-job").filter({ hasText: insp.name }).getByRole("button", { name: "Edit" }).click();
    await expect(page.getByTestId("found-work-section")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("found-add-job").click();
    const picker = page.getByTestId("found-picker");
    await picker.getByTestId("found-picker-search").fill("oxygen");
    await picker.getByTestId("found-picker-row").filter({ hasText: o2.name }).first().getByTestId("found-picker-add").click();
    const row = page.getByTestId("found-work-row").filter({ hasText: o2.name });
    await row.getByTestId("found-where-on-car").getByRole("button", { name: "Front (Air fuel ratio sensor)" }).click();
    // LC-10: the parts to buy under the row, read-only.
    const toBuy = row.getByTestId("parts-fit-panel");
    await expect(toBuy).toHaveAttribute("data-mode", "to-buy", { timeout: 30_000 });
    await expect(toBuy.getByTestId("parts-fit-number")).toHaveText(FRONT.number);
    await expect(toBuy.getByTestId("parts-fit-skip")).toHaveCount(0);

    // LC-16: saving the inspection gives the Not done yet job its own (optional) quote card.
    await saveLine(page).click();
    const quoteRow = page.getByText("Not done yet · add the garage's quote (optional)");
    await expect(quoteRow).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Quote", exact: true }).click();
    await expect(page.getByTestId("quote-mode-banner")).toContainText("Garage's quote — not paid yet");
    await expect(page.getByText(/Quote total/).first()).toBeVisible();
    await page.locator("#labor-hours").fill("1");
    await page.locator("#labor-rate").fill("12000");
    await page.getByTestId("quote-mode-note").fill("Front sensor slow");
    await saveLine(page).click();
    await expect(page.getByText("Garage quote saved · not done yet")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /continue to review/i }).click();
    await expect(page.getByTestId("review-found-name")).toHaveText("Oxygen sensor · Front (Air fuel ratio sensor)".replace("Oxygen sensor", o2.name));
    await page.getByRole("button", { name: /^Log service$/i }).click();
    await expect(page.getByTestId("log-service-review-summary")).toBeHidden({ timeout: 60_000 });

    const found = foundLines();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ jobId: o2.id, lineTotal: 0, quote: 12000, places: "before_cat" });
    inspectionWo = found[0].woId;
    expect(sql(`SELECT total_cost::numeric::int FROM public.maintenance_work_orders WHERE id = '${inspectionWo}'`)).toBe("8000");
    expect(sql(`SELECT values_json->'quote'->>'laborRate' FROM public.maintenance_work_order_lines WHERE id = '${found[0].id}'`)).toBe("12000");
    expect(sql(`SELECT notes FROM public.maintenance_work_order_lines WHERE id = '${found[0].id}'`)).toBe("Front sensor slow");
  });

  test("N2 — the Not done yet tab: place, quote, total quoted, parts to buy, From inspection + View inspection", async ({ page }) => {
    const section = await openNotDoneYetTab(page);
    await expect(page.locator('[data-maintenance-tab="work-orders"], [data-maintenance-tab="inspections"]')).toHaveCount(0);
    const card = section.getByTestId("found-card").filter({ hasText: o2.name });
    await expect(card.getByTestId("found-card-title")).toHaveText(`${o2.name} · Front (Air fuel ratio sensor)`);
    await expect(card.getByTestId("found-card-car")).toContainText(MD_DISC_PLATE);
    await expect(card.getByTestId("found-card-quote")).toContainText("Garage quote J$ 12,000");
    await expect(section.getByTestId("found-quoted-total")).toHaveText("J$ 12,000 quoted, waiting");
    await expect(card.getByTestId("parts-fit-number")).toHaveText(FRONT.number, { timeout: 30_000 });
    await expect(card.getByTestId("found-from-inspection")).toContainText(insp.name);
    await expect(card.getByTestId("found-status-pending")).toHaveAttribute("aria-checked", "true");
    await card.getByTestId("found-view-inspection").click();
    await expect(page.getByRole("dialog").getByText("Service details")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("service-details-add-found")).toBeVisible({ timeout: 30_000 });
  });

  test("N3 — Add a job to the saved inspection: Log service in add mode, Also do, quotes → two J$ 0 found lines", async ({ page }) => {
    const section = await openNotDoneYetTab(page);
    await section.getByTestId("found-card").filter({ hasText: o2.name }).getByTestId("found-add-to-inspection").click();
    await expect(page.getByTestId("add-to-inspection-banner")).toContainText(insp.name, { timeout: 30_000 });
    // Starts on Work done: same search as Log service.
    const search = page.getByTestId("log-service-job-search").getByRole("searchbox");
    await search.fill(CLEAN.name);
    await page.getByRole("button", { name: new RegExp(CLEAN.name) }).first().click();
    await expect(page.getByTestId("log-service-job-header")).toContainText(CLEAN.name, { timeout: 30_000 });
    await expect(page.getByTestId("quote-mode-banner")).toBeVisible();
    // Also do: Relearn (picked from search, so it's on the card).
    const alsoDo = page.getByTestId("details-also-do");
    await expect(alsoDo).toContainText(`Also do: ${RELEARN.name}`);
    await expect(alsoDo).toContainText(RELEARN_NOTE);
    await alsoDo.getByTestId("details-also-do-add").click();
    await page.locator("#service-amount").fill("6800");
    await saveLine(page).click();
    await expect(page.getByTestId("log-service-job-header")).toContainText(RELEARN.name, { timeout: 15_000 });
    await page.locator("#service-amount").fill("2000");
    await saveLine(page).click();
    await page.getByRole("button", { name: /continue to review/i }).click();
    const review = page.getByTestId("add-to-inspection-review");
    await expect(review.getByTestId("add-to-inspection-quote")).toHaveText(["Quote J$ 6,800", "Quote J$ 2,000"]);
    await page.getByRole("button", { name: "Add 2 jobs to this inspection" }).click();
    await expect(page.getByText("2 jobs added to the inspection")).toBeVisible({ timeout: 30_000 });

    const found = foundLines();
    expect(found).toHaveLength(3);
    const byJob = new Map(found.map((f) => [f.jobId, f]));
    expect(byJob.get(CLEAN.id)).toMatchObject({ lineTotal: 0, quote: 6800, woId: inspectionWo });
    expect(byJob.get(RELEARN.id)).toMatchObject({ lineTotal: 0, quote: 2000, woId: inspectionWo });
    expect(sql(`SELECT total_cost::numeric::int FROM public.maintenance_work_orders WHERE id = '${inspectionWo}'`)).toBe("8000");
    expect(sql(`SELECT count(*) FROM public.maintenance_work_order_line_item WHERE work_order_id = '${inspectionWo}'`)).toBe("0");
    // The list shows them from the same inspection.
    const list = await ops("GET", `/maintenance-found-work?vehicleId=${MD_DISC_VEHICLE_ID}`);
    const items = list.json.items as Array<{ jobId: string; workOrderId: string; quoteAmount: number | null }>;
    expect(items.filter((i) => i.workOrderId === inspectionWo).map((i) => i.quoteAmount).sort()).toEqual([12000, 2000, 6800].sort());
  });

  test("N4 — Done: date + mileage, the quote filled in, Also done on this visit → one service; both leave the list", async ({ page }) => {
    const before = foundLines();
    const clean = before.find((f) => f.jobId === CLEAN.id)!;
    const relearn = before.find((f) => f.jobId === RELEARN.id)!;
    const section = await openNotDoneYetTab(page);
    await section.getByTestId("found-card").filter({ hasText: CLEAN.name }).getByTestId("found-log-it-now").click();
    const odoBox = page.locator("#svc-odo");
    await expect(odoBox).toBeVisible({ timeout: 30_000 });
    odo += 100;
    await odoBox.fill(String(odo));
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByTestId("found-banner-quote")).toContainText("Garage quote: J$ 6,800", { timeout: 30_000 });
    await expect(page.locator("#service-amount")).toHaveValue("6800");
    const also = page.getByTestId("also-done-on-visit");
    await also.getByRole("checkbox", { name: RELEARN.name }).check();
    await page.locator("#service-amount").fill("7000"); // the real bill was a little more
    await saveLine(page).click();
    await expect(page.getByTestId("log-service-job-header")).toContainText(RELEARN.name, { timeout: 15_000 });
    await expect(page.locator("#service-amount")).toHaveValue("2000");
    await saveLine(page).click();
    await page.getByRole("button", { name: /continue to review/i }).click();
    await expect(page.getByTestId("log-service-review-summary")).toContainText("J$ 9,000", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Log service$/i }).click();
    await expect(page.getByTestId("log-service-review-summary")).toBeHidden({ timeout: 60_000 });

    const done = sql(`SELECT d.work_order_id || '|' || wo.status || '|' || wo.total_cost::numeric::int
                      FROM public.maintenance_work_order_lines d JOIN public.maintenance_work_orders wo ON wo.id = d.work_order_id
                      WHERE d.from_found_line_id IN ('${clean.id}', '${relearn.id}') AND d.voided_at IS NULL`)
      .split("\n");
    expect(done).toHaveLength(2);
    expect(new Set(done).size).toBe(1); // one service
    expect(done[0].split("|").slice(1)).toEqual(["completed", "9000"]);
    expect(sql(`SELECT public.maintenance_found_line_is_open('${clean.id}')`)).toBe("f");
    expect(sql(`SELECT public.maintenance_found_line_is_open('${relearn.id}')`)).toBe("f");
    const after = foundLines();
    expect(after.map((f) => f.jobId)).toEqual([o2.id]);
  });

  test("N5 — Edit quote on a waiting job: opens its form filled in; Save quote changes only the quote", async ({ page }) => {
    const o2Line = foundLines().find((f) => f.jobId === o2.id)!;
    const section = await openNotDoneYetTab(page);
    const card = section.getByTestId("found-card").filter({ hasText: o2.name });
    await expect(card.getByTestId("found-card-quote")).toContainText("J$ 12,000");
    await card.getByTestId("found-edit-quote").click();
    await expect(page.getByTestId("add-to-inspection-banner")).toContainText("Garage's quote for this job", { timeout: 30_000 });
    await expect(page.getByTestId("log-service-job-header")).toContainText(o2.name, { timeout: 30_000 });
    await expect(page.locator("#labor-rate")).toHaveValue("12000");
    await expect(page.getByTestId("quote-mode-note")).toHaveValue("Front sensor slow");
    await page.locator("#labor-rate").fill("15000");
    await page.getByRole("button", { name: /^Save line/ }).first().click();
    await page.getByRole("button", { name: /continue to review/i }).click();
    await page.getByRole("button", { name: "Save quote" }).click();
    await expect(page.getByText(`Quote saved for ${o2.name}`)).toBeVisible({ timeout: 30_000 });
    const row = sql(`SELECT (values_json->>'quote_amount')::numeric::int || '|' || line_total::numeric::int || '|' || (values_json->'quote'->>'laborRate')
                     FROM public.maintenance_work_order_lines WHERE id = '${o2Line.id}'`);
    expect(row).toBe("15000|0|15000");
    expect(sql(`SELECT total_cost::numeric::int FROM public.maintenance_work_orders WHERE id = '${inspectionWo}'`)).toBe("8000");
    await expect(tabSection(page).getByTestId("found-card").filter({ hasText: o2.name }).getByTestId("found-card-quote"))
      .toContainText("J$ 15,000", { timeout: 30_000 });
  });
});
