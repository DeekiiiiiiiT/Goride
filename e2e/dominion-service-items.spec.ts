/**
 * Service items (May need + Supplies) — Dominion done-tests 16–19 + read-only + tablet, on the real local stack.
 * Nothing faked: real fleet-ops routes, real local database (made-up names, cleaned up before each run).
 *
 * Owner starts `pnpm testcopy` first, then:
 * ADMIN_BASE_URL=http://127.0.0.1:5180 node node_modules/@playwright/test/cli.js test e2e/dominion-service-items.spec.ts \
 *   --project=dominion-admin --reporter=list --max-failures=1 --retries=0
 *
 * Screenshots go to the git-ignored test-results/service-items-dominion/ (never docs/).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyMmP01HttpSeed,
  buildMmP01StoredSession,
  seedMmP01AnalystSession,
  seedMmP01Session,
} from "./helpers/mmP01Auth";

const shotsDir = join(process.cwd(), "test-results", "service-items-dominion");
mkdirSync(shotsDir, { recursive: true });

const RUN = Date.now().toString(36);
const SUPPLY_NAME = `SI-UI1 Test Cleaner ${RUN}`;

function psql(sql: string): string {
  return execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At`, {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/** Puts Throttle Body Cleaning back to its seeded May need (cleaner only) and drops earlier test supplies. */
function resetFixture() {
  psql(`
    DELETE FROM public.maintenance_job_item ji
      USING public.maintenance_service_categories job
      WHERE ji.job_id = job.id AND job.code = 'throttle_body_cleaning' AND ji.supply_id IS NULL;
    DELETE FROM public.maintenance_job_item WHERE supply_id IN (SELECT id FROM public.maintenance_supply WHERE name LIKE 'SI-UI1 Test Cleaner %');
    DELETE FROM public.maintenance_supply WHERE name LIKE 'SI-UI1 Test Cleaner %';
  `);
}

async function gotoJobs(page: Page) {
  await page.goto("/?page=maintenance-templates");
  await expect(page.getByRole("heading", { name: /Maintenance templates/i })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Jobs/ }).click();
  await expect(page.getByPlaceholder("Search jobs, codes…")).toBeVisible({ timeout: 30_000 });
}

async function openThrottleJob(page: Page): Promise<Locator> {
  await gotoJobs(page);
  await page.getByPlaceholder("Search jobs, codes…").fill("Throttle Body Cleaning");
  const row = page.locator("li").filter({ hasText: "Throttle Body Cleaning" }).filter({ has: page.getByRole("button", { name: "Edit", exact: true }) }).first();
  await row.getByRole("button", { name: /^Edit$/ }).click();
  const drawer = page.getByRole("dialog", { name: /Throttle Body Cleaning/ });
  await expect(drawer).toBeVisible();
  return drawer;
}

async function mayNeedNames(drawer: Locator): Promise<string[]> {
  const rows = drawer.getByRole("list", { name: "May need items" }).getByRole("listitem");
  const n = await rows.count();
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    names.push((await rows.nth(i).locator("span.font-semibold").first().innerText()).trim());
  }
  return names;
}

async function snap(page: Page, id: string) {
  await page.screenshot({ path: join(shotsDir, `live-${id}.png`), fullPage: true });
}

/** Close-up of one drawer part or dialog (scrolled into view), for the side-by-side Stitch check. */
async function snapEl(el: Locator, id: string) {
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: join(shotsDir, `live-${id}.png`) });
}

test.describe.configure({ mode: "serial" });

test.describe("Dominion service items (real stack)", () => {
  test.beforeAll(() => {
    applyMmP01HttpSeed();
    resetFixture();
  });

  test.afterAll(() => {
    resetFixture();
  });

  test("16 May need: cleaner shown, add the gasket, order holds, keyboard move", async ({ page }) => {
    await seedMmP01Session(page);
    const drawer = await openThrottleJob(page);
    const section = drawer.getByTestId("may-need-section");
    await expect(section.getByText("Throttle body cleaner")).toBeVisible();
    await snap(page, "02-edit-job-drawer");

    await section.getByRole("button", { name: "Add item" }).click();
    const dialog = page.getByRole("dialog", { name: "Add to May need" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("searchbox", { name: "Search parts" }).fill("intake manifold");
    await dialog.getByRole("option", { name: /Intake Manifold Gasket/ }).click();
    await dialog.getByRole("button", { name: "Sometimes" }).click();
    await dialog.getByLabel("Usual quantity").fill("1");
    await dialog.getByLabel("Note").fill("Only if the old gasket tears.");
    await snap(page, "03-add-part-types");
    await snapEl(dialog, "03b-add-part-types-dialog");
    await dialog.getByRole("button", { name: /^(add\s*)?Add$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(section.getByText("Intake Manifold Gasket")).toBeVisible();

    // Reload: order holds (cleaner first, gasket second).
    await page.reload();
    let d2 = await openThrottleJob(page);
    expect(await mayNeedNames(d2)).toEqual(["Throttle body cleaner", "Intake Manifold Gasket"]);
    await snapEl(d2.getByTestId("may-need-section"), "02b-may-need-section");

    // Keyboard move: focus "Move … up" and press Enter.
    const up = d2.getByRole("button", { name: "Move Intake Manifold Gasket up" });
    await up.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => mayNeedNames(d2)).toEqual(["Intake Manifold Gasket", "Throttle body cleaner"]);
    await page.reload();
    d2 = await openThrottleJob(page);
    expect(await mayNeedNames(d2)).toEqual(["Intake Manifold Gasket", "Throttle body cleaner"]);

    // Jobs list pill.
    await d2.getByRole("button", { name: "Close" }).first().click();
    await expect(page.getByTestId("may-need-pill-throttle_body_cleaning")).toHaveText(/May need · 2$/);
    await snap(page, "01-jobs-tab");
  });

  test("17 Supplies: add, link, retire, restore, name clash", async ({ page }) => {
    await seedMmP01Session(page);
    await page.goto("/?page=maintenance-templates");
    await page.getByRole("button", { name: /^Supplies/ }).click();
    const tab = page.getByTestId("supplies-tab");
    await expect(tab.getByText("Standard consumables")).toBeVisible({ timeout: 30_000 });
    await snap(page, "05-supplies-tab");

    // Add a supply.
    await tab.getByRole("button", { name: "Add supply" }).click();
    let drawer = page.getByRole("dialog", { name: "Add supply" });
    await drawer.getByLabel("Name").fill(SUPPLY_NAME);
    await drawer.getByLabel("Description").fill("Made-up supply for the service items done-test.");
    await drawer.getByRole("button", { name: "Save supply" }).click();
    await expect(drawer).toBeHidden();
    await tab.getByRole("searchbox", { name: "Search supplies" }).fill(SUPPLY_NAME);
    await expect(tab.getByText(SUPPLY_NAME)).toBeVisible();

    // Link it to Throttle Body Cleaning through the Add dialog's Supplies tab.
    const supplyId = psql(`SELECT id FROM public.maintenance_supply WHERE name = '${SUPPLY_NAME}'`);
    const jd = await openThrottleJob(page);
    await jd.getByTestId("may-need-section").getByRole("button", { name: "Add item" }).click();
    const add = page.getByRole("dialog", { name: "Add to May need" });
    await add.getByRole("tab", { name: /Supplies/ }).click();
    await add.getByRole("searchbox", { name: "Search supplies" }).fill(SUPPLY_NAME);
    await expect(add.getByText(/1 result/)).toBeVisible();
    await add.getByRole("option", { name: new RegExp(SUPPLY_NAME) }).click();
    await snap(page, "04-add-supplies");
    await snapEl(add, "04b-add-supplies-dialog");
    await add.getByRole("button", { name: /^Add/ }).click();
    await expect(add).toBeHidden();
    await expect(jd.getByText(SUPPLY_NAME)).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: /^Supplies/ }).click();
    await tab.getByRole("searchbox", { name: "Search supplies" }).fill(SUPPLY_NAME);
    await expect(tab.getByText("On 1 job")).toBeVisible();

    // Retire from the drawer.
    await tab.getByRole("button", { name: `Edit ${SUPPLY_NAME}` }).click();
    drawer = page.getByRole("dialog", { name: SUPPLY_NAME });
    await expect(drawer.getByText(/Used on 1 job/)).toBeVisible();
    await snap(page, "06-edit-supply-drawer");
    await snapEl(drawer, "06b-edit-supply-drawer");
    await drawer.getByRole("button", { name: "Retire" }).click();
    const retire = page.getByRole("dialog", { name: `Retire ${SUPPLY_NAME}?` });
    await expect(retire.getByText("This item can be restored at any time.")).toBeVisible();
    await snap(page, "07-retire-supply");
    await retire.getByRole("button", { name: "Retire supply" }).click();
    await expect(page.getByText(/retired — hidden from May need on 1 job/)).toBeVisible();

    // The drawer row greys out.
    let jobDrawer = await openThrottleJob(page);
    await expect(jobDrawer.getByText("Retired · hidden while logging")).toBeVisible();
    await jobDrawer.getByRole("button", { name: "Close" }).first().click();

    // Name clash: a new active supply takes the name, then Restore is refused.
    await page.getByRole("button", { name: /^Supplies/ }).click();
    await tab.getByRole("button", { name: "Add supply" }).click();
    drawer = page.getByRole("dialog", { name: "Add supply" });
    await drawer.getByLabel("Name").fill(SUPPLY_NAME);
    await drawer.getByLabel("Description").fill("Second made-up supply with the same name.");
    await drawer.getByRole("button", { name: "Save supply" }).click();
    await expect(drawer).toBeHidden();
    await tab.getByRole("button", { name: /Retired/ }).click();
    await tab.getByRole("button", { name: `Restore ${SUPPLY_NAME}` }).click();
    await expect(tab.getByText("Another active supply uses this name. Rename one of them first.")).toBeVisible();
    await snap(page, "08-retired-restore-clash");

    // Retire the second one, then Restore the first works.
    psql(`UPDATE public.maintenance_supply SET status = 'retired' WHERE name = '${SUPPLY_NAME}' AND id <> '${supplyId}'`);
    await page.reload();
    await page.getByRole("button", { name: /^Supplies/ }).click();
    await tab.getByRole("button", { name: /Retired/ }).click();
    await tab.getByRole("searchbox", { name: "Search supplies" }).fill(SUPPLY_NAME);
    await tab.getByTestId(/supply-row-/).first().waitFor();
    await page.getByRole("button", { name: `Restore ${SUPPLY_NAME}` }).first().click();
    await expect.poll(() => psql(`SELECT status FROM public.maintenance_supply WHERE id = '${supplyId}'`)).toBe("active");
    jobDrawer = await openThrottleJob(page);
    await expect(jobDrawer.getByText("Retired · hidden while logging")).toHaveCount(0);
  });

  test("18 Remove a link: row goes, count drops, link row kept with removed_at", async ({ page }) => {
    await seedMmP01Session(page);
    const drawer = await openThrottleJob(page);
    const before = (await mayNeedNames(drawer)).length;
    await drawer.getByRole("button", { name: "Remove Intake Manifold Gasket" }).click();
    const confirm = page.getByRole("dialog", { name: /Remove Intake Manifold Gasket/ });
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(drawer.getByText("Intake Manifold Gasket")).toHaveCount(0);
    expect((await mayNeedNames(drawer)).length).toBe(before - 1);
    const kept = psql(`
      SELECT count(*) FROM public.maintenance_job_item ji
      JOIN public.maintenance_service_categories job ON job.id = ji.job_id
      JOIN public.maintenance_service_categories pt ON pt.id = ji.part_type_id
      WHERE job.code = 'throttle_body_cleaning' AND pt.code = 'intake_manifold_gasket' AND ji.removed_at IS NOT NULL`);
    expect(Number(kept)).toBe(1);
  });

  test("19 Old supply link gone: route 404, checklist has no supplies", async () => {
    const { stored, base, anonKey } = await buildMmP01StoredSession();
    const res = await fetch(`${base}/functions/v1/fleet-core/make-server-37f42386/admin/catalog/related-supplies`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${stored.access_token as string}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    const anyCatalog = psql(`SELECT id FROM public.vehicle_catalog LIMIT 1`) || "00000000-0000-4000-8000-000000000000";
    const keys = psql(`SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.variant_parts_checklist('${anyCatalog}')) k`);
    expect(keys.split(",")).not.toContain("supplies");
  });

  test("Read-only analyst sees May need and Supplies, no change buttons", async ({ page }) => {
    await seedMmP01AnalystSession(page);
    await gotoJobs(page);
    await page.getByPlaceholder("Search jobs, codes…").fill("Throttle Body Cleaning");
    await expect(page.getByTestId("may-need-pill-throttle_body_cleaning")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^Supplies/ }).click();
    const tab = page.getByTestId("supplies-tab");
    await expect(tab.getByText("Standard consumables")).toBeVisible({ timeout: 30_000 });
    await expect(tab.getByRole("button", { name: "Add supply" })).toHaveCount(0);
    await expect(tab.getByRole("button", { name: /^Edit / })).toHaveCount(0);
    await tab.getByRole("button", { name: /^View / }).first().click();
    const drawer = page.getByRole("dialog").filter({ has: page.getByLabel("Name") });
    await expect(drawer.getByLabel("Name")).toBeDisabled();
    await expect(drawer.getByRole("button", { name: "Save supply" })).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Retire" })).toHaveCount(0);
  });

  test("10 Tablet: May need cards at 820 × 1180", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await seedMmP01Session(page);
    const drawer = await openThrottleJob(page);
    await expect(drawer.getByTestId("may-need-section")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Add item" })).toBeVisible();
    await snap(page, "10-tablet");
    await snapEl(drawer.getByTestId("may-need-section"), "10b-tablet-may-need");
  });
});
