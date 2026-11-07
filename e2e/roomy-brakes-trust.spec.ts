/**
 * Phase 3b — Dominion trust UI (Trusted sources tab + add-a-part per-car trust).
 * Real local stack: real login (mm-p01 owner, aal2), real fleet-core routes, real database.
 * No catalog route mocks. Fixture car: FxToyota FxRoomy (mm_p01_http_seed.sql).
 *
 * Prerequisites: `pnpm testcopy` running, fleet-core bundle built (node scripts/build-edge-bundle.mjs fleet-core).
 * Run once:
 *   $env:ADMIN_BASE_URL='http://127.0.0.1:5180'; $env:FLEET_BASE_URL='http://127.0.0.1:5181';
 *   node node_modules/@playwright/test/cli.js test e2e/roomy-brakes-trust.spec.ts --project=dominion-admin --reporter=list --max-failures=1 --retries=0
 */
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyMmP01HttpSeed,
  buildMmP01AnalystStoredSession,
  buildMmP01StoredSession,
} from "./helpers/mmP01Auth";

const VIEWPORT = { width: 1440, height: 900 };
const TEST_DOMAIN = "e2e-roomy-trust.example";
const FX_MAKER_NAME = "FxTrustMaker6";
const FX_MAKER_DOMAIN = "e2e-roomy-trust-fxmaker.example";

/** Fixed listing ids — must match e2e/fixtures/roomy_brakes_trust_seed.sql */
const LISTING_ROOMY_ID = "e200000f-0000-4000-8000-000000000011";
const LISTING_YARIS_ID = "e200000f-0000-4000-8000-000000000012";

const E2E_3B09_NUM_A = "E2E-3B09-EX";
const E2E_3B09_NUM_B = "E2E-3B09-TRUST";

const shotsDir = join(process.cwd(), "docs", "stitch", "roomy-brakes-dominion", "screenshots");
mkdirSync(shotsDir, { recursive: true });

function sql(query: string): string {
  return execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -At -v ON_ERROR_STOP=1`, {
    input: query,
    encoding: "utf8",
  }).trim();
}

function applyRoomyBrakesTrustSeed() {
  const path = join(process.cwd(), "e2e", "fixtures", "roomy_brakes_trust_seed.sql");
  const sqlFile = readFileSync(path, "utf8");
  execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
    input: sqlFile,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Real signed-in owner session. Only the browser's auth calls are answered locally; every API call hits the real server. */
async function signInOwner(page: Page, dark = false) {
  const { stored } = await buildMmP01StoredSession();
  await page.route("**/auth/v1/**", async (route) => {
    if (route.request().url().includes("/user")) {
      await route.fulfill({ json: stored.user });
      return;
    }
    await route.fulfill({ json: stored });
  });
  await page.addInitScript(({ s, useDark }) => {
    const json = JSON.stringify(s);
    localStorage.setItem("sb-127-auth-token", json);
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", json);
    localStorage.setItem("preference_dark_mode", useDark ? "true" : "false");
    if (useDark) document.documentElement.classList.add("dark");
  }, { s: stored, useDark: dark });
}

async function signInAnalyst(page: Page, dark = false) {
  const { stored } = await buildMmP01AnalystStoredSession();
  await page.route("**/auth/v1/**", async (route) => {
    if (route.request().url().includes("/user")) {
      await route.fulfill({ json: stored.user });
      return;
    }
    await route.fulfill({ json: stored });
  });
  await page.addInitScript(({ s, useDark }) => {
    const json = JSON.stringify(s);
    localStorage.setItem("sb-127-auth-token", json);
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", json);
    localStorage.setItem("preference_dark_mode", useDark ? "true" : "false");
    if (useDark) document.documentElement.classList.add("dark");
  }, { s: stored, useDark: dark });
}

test.describe.configure({ mode: "serial" });

test.describe("Roomy brakes trust (real stack)", () => {
  test.beforeAll(() => {
    applyMmP01HttpSeed();
    applyRoomyBrakesTrustSeed();
    sql(`DELETE FROM public.trusted_source WHERE domain = '${TEST_DOMAIN}';`);
    sql(`DELETE FROM public.trusted_source WHERE domain = '${FX_MAKER_DOMAIN}';`);
  });

  test.afterAll(() => {
    sql(
      `DELETE FROM public.part_listing WHERE interchange_group_id IN (SELECT interchange_group_id FROM public.part_master WHERE oem_part_number IN ('${E2E_3B09_NUM_A}','${E2E_3B09_NUM_B}'));`,
    );
    sql(`DELETE FROM public.part_master WHERE oem_part_number IN ('${E2E_3B09_NUM_A}','${E2E_3B09_NUM_B}');`);
    sql(`DELETE FROM public.trusted_source WHERE domain IN ('${TEST_DOMAIN}', '${FX_MAKER_DOMAIN}');`);
    sql(`UPDATE public.part_listing SET trust = 'confirmed', trust_reason = NULL, trust_set_by = 'owner', trust_set_at = now(), year_from = 2018, year_to = 2022 WHERE id = '${LISTING_ROOMY_ID}'::uuid;`);
    sql(`UPDATE public.part_listing SET trust = 'needs_checking', trust_reason = 'Fx note for automated trust check', trust_set_by = 'owner', trust_set_at = now(), year_from = 2019, year_to = 2023 WHERE id = '${LISTING_YARIS_ID}'::uuid;`);
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test("Dominion 1: Full database drawer shows per-car trust; edit updates DB", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/?page=parts-catalog&tab=database&q=FX-PAD-1");
    await page.waitForTimeout(400);

    const openRow = page.locator("tbody tr").filter({ hasText: /FX-PAD-1/ }).first();
    await expect(openRow).toBeVisible({ timeout: 30_000 });
    await openRow.click();

    await expect(page.getByText("Cars it fits", { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: /FX-PAD-1/ })).toBeVisible({ timeout: 15_000 });

    const carBlock = (model: string, trust: "Confirmed" | "Needs checking") =>
      page
        .locator(".find-parts-sheet div.p-space-sm.rounded-xl")
        .filter({ hasText: `FxToyota ${model}` })
        .filter({ has: page.getByText(trust, { exact: true }) })
        .first();

    const roomyRow = carBlock("FxRoomy", "Confirmed");
    await expect(roomyRow).toBeVisible({ timeout: 15_000 });
    const yarisRow = carBlock("FxYaris", "Needs checking");
    await expect(yarisRow).toBeVisible();
    await expect(page.getByText("Fx note for automated trust check", { exact: true })).toBeVisible();

    await page.screenshot({
      path: join(shotsDir, "part_drawer_cars_it_fits_with_per_car_trust_light_mode-live.png"),
      fullPage: true,
    });

    await roomyRow.getByRole("button", { name: "Car actions" }).click();
    await page.getByRole("button", { name: "Mark needs checking…" }).click();
    await page.locator('[role="dialog"] textarea').fill("Fx Dominion 1 e2e reason");
    await page.locator('[role="dialog"]').getByRole("button", { name: "Save" }).click();
    await expect(page.locator("li").filter({ hasText: /Marked needs checking/i })).toBeVisible({ timeout: 15_000 });

    let row = sql(
      `SELECT trust||'|'||coalesce(trust_reason,'') FROM public.part_listing WHERE id='${LISTING_ROOMY_ID}'::uuid;`,
    );
    expect(row.startsWith("needs_checking|")).toBe(true);

    const roomyNeeds = carBlock("FxRoomy", "Needs checking");
    await roomyNeeds.getByRole("button", { name: "Car actions" }).click();
    await page.getByRole("button", { name: "Change years" }).click();
    await page.locator('[role="dialog"] input[inputmode="numeric"]').first().fill("2017");
    await page.locator('[role="dialog"] input[inputmode="numeric"]').nth(1).fill("2021");
    await page.locator('[role="dialog"]').getByRole("button", { name: "Save" }).click();
    await expect(page.locator("li").filter({ hasText: /Years updated/i })).toBeVisible({ timeout: 15_000 });

    row = sql(`SELECT year_from||'|'||year_to FROM public.part_listing WHERE id='${LISTING_ROOMY_ID}'::uuid;`);
    expect(row).toBe("2017|2021");
  });

  test("Dominion 1 (dark): part drawer screenshot", async ({ page }) => {
    await signInOwner(page, true);
    await page.goto(`/?page=parts-catalog&tab=database&q=FX-PAD-1`);
    await page.waitForTimeout(400);
    await page.locator("tbody tr").filter({ hasText: /FX-PAD-1/ }).first().click();
    await expect(page.getByText("Cars it fits", { exact: false })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: join(shotsDir, "part_drawer_cars_it_fits_with_per_car_trust_light_mode-live-dark.png"),
      fullPage: true,
    });
  });

  test("Dominion 1: platform twin row has Add this car, no car menu", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/?page=parts-catalog&tab=database&q=FX-PAD-1");
    await page.waitForTimeout(400);
    await page.locator("tbody tr").filter({ hasText: /FX-PAD-1/ }).first().click();
    await expect(page.getByText("Cars it fits", { exact: false })).toBeVisible({ timeout: 20_000 });
    const twinRow = page
      .locator(".find-parts-sheet div.p-space-sm.rounded-xl")
      .filter({ hasText: "FxToyota FxTwin" })
      .first();
    await expect(twinRow).toBeVisible({ timeout: 20_000 });
    await expect(twinRow.getByRole("button", { name: "Add this car" })).toBeVisible();
    await expect(twinRow.getByRole("button", { name: "Car actions" })).toHaveCount(0);
    const roomyRow = page
      .locator(".find-parts-sheet div.p-space-sm.rounded-xl")
      .filter({ hasText: "FxToyota FxRoomy" })
      .first();
    await expect(roomyRow.getByRole("button", { name: "Car actions" })).toBeVisible();
  });

  test("Dominion 4: trust state frames and error UI", async ({ page }) => {
    await signInOwner(page);
    await page.goto(`/?page=parts-catalog&tab=database&q=${encodeURIComponent("FX-PAD-EMPTY")}`);
    await page.waitForTimeout(400);
    await page.locator("tbody tr").filter({ hasText: /FX-PAD-EMPTY/ }).first().click();
    await expect(page.getByText("No car listing yet.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: join(shotsDir, "parts_database_trust_states_exceptions_frames_a_d-live.png"),
      fullPage: true,
    });
    await page.locator('.find-parts-sheet button[title="Close"]').first().click();

    sql(
      `UPDATE public.part_listing SET trust='needs_checking', trust_reason='Fx temp all need check', trust_set_by='owner', trust_set_at=now() WHERE id IN ('${LISTING_ROOMY_ID}'::uuid,'${LISTING_YARIS_ID}'::uuid);`,
    );
    await page.goto(`/?page=parts-catalog&tab=database&q=FX-PAD-1`);
    await page.waitForTimeout(400);
    await page.locator("tbody tr").filter({ hasText: /FX-PAD-1/ }).first().click();
    await expect(page.getByText("None of these cars are confirmed yet.", { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    const roomyBlock = page
      .locator(".find-parts-sheet div.p-space-sm.rounded-xl")
      .filter({ hasText: "FxToyota FxRoomy" })
      .first();
    await roomyBlock.getByRole("button", { name: "Car actions" }).click();
    await page.getByRole("button", { name: "Mark confirmed" }).click();
    await expect(page.locator("li").filter({ hasText: /Marked Confirmed/i })).toBeVisible({ timeout: 15_000 });

    await page.route("**/admin/catalog/parts/master/**", (route) => route.abort("failed"));
    await page.reload();
    await page.waitForTimeout(400);
    await page.locator("tbody tr").filter({ hasText: /FX-PAD-1/ }).first().click();
    await expect(page.getByText("Could not load this part. Nothing was changed.", { exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await page.unroute("**/admin/catalog/parts/master/**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Cars it fits", { exact: false })).toBeVisible({ timeout: 25_000 });
  });

  test("Dominion 4 (dark): states screenshot", async ({ page }) => {
    await signInOwner(page, true);
    sql(
      `UPDATE public.part_listing SET trust='needs_checking', trust_reason='Fx temp all need check', trust_set_by='owner', trust_set_at=now() WHERE id IN ('${LISTING_ROOMY_ID}'::uuid,'${LISTING_YARIS_ID}'::uuid);`,
    );
    await page.goto(`/?page=parts-catalog&tab=database&q=FX-PAD-1`);
    await page.waitForTimeout(400);
    await page.locator("tbody tr").filter({ hasText: /FX-PAD-1/ }).first().click();
    await expect(page.getByText("None of these cars are confirmed yet.", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: join(shotsDir, "parts_database_trust_states_exceptions_frames_a_d-live-dark.png"),
      fullPage: true,
    });
  });

  test("Dominion 6: Add a car maker, remove maker, DB checks", async ({ page }) => {
    sql(`DELETE FROM public.trusted_source WHERE maker_norm=lower('${FX_MAKER_NAME}');`);
    await signInOwner(page);
    await page.goto("/?page=parts-catalog&tab=trusted-sources");
    await expect(page.getByRole("heading", { name: "Trusted sources", exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Add a car maker" }).click();
    await expect(page.getByRole("dialog", { name: "Add trusted site" })).toBeVisible();
    await page.locator("#trusted-add-maker").fill(FX_MAKER_NAME);
    await page.locator("#trusted-add-domain").fill(FX_MAKER_DOMAIN);
    await page.screenshot({
      path: join(shotsDir, "trusted_sources_add_remove_dialog_workflows_screen_2-live.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Add site" }).click();
    await expect(page.getByRole("dialog", { name: "Add trusted site" })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(new RegExp(`${FX_MAKER_DOMAIN.replace(/\./g, "\\.")} added to ${FX_MAKER_NAME}`))).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { name: FX_MAKER_NAME, exact: true })).toBeVisible({ timeout: 20_000 });
    expect(
      sql(
        `SELECT count(*) FROM public.trusted_source WHERE kind='car_maker' AND maker_norm=lower('${FX_MAKER_NAME}') AND domain='${FX_MAKER_DOMAIN}';`,
      ),
    ).toBe("1");

    await page.getByRole("heading", { name: FX_MAKER_NAME, exact: true }).locator("xpath=ancestor::article[1]").getByRole("button", { name: "Maker options" }).click();
    await page.getByRole("menuitem", { name: "Remove maker" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove maker" }).click();
    // Wait for the server's answer: while the confirm box is open the card is hidden from the test anyway.
    await expect(page.locator("li").filter({ hasText: /Maker removed/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: FX_MAKER_NAME, exact: true })).toHaveCount(0, { timeout: 15_000 });
    expect(
      sql(
        `SELECT count(*) FROM public.trusted_source WHERE maker_norm=lower('${FX_MAKER_NAME}');`,
      ),
    ).toBe("0");

    await page.goto("/?page=parts-catalog&tab=trusted-sources");
    await page.getByRole("button", { name: "Add a car maker" }).click();
    await page.locator("#trusted-add-maker").fill("Toyota");
    await page.locator("#trusted-add-domain").fill("partsouq.com");
    await page.getByRole("button", { name: "Add site" }).click();
    await expect(
      page.getByRole("dialog", { name: "Add trusted site" }).getByText(/already trusted for Toyota/i),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.locator("#add-domain-car_maker-Toyota").fill("not a domain");
    await page
      .locator("#add-domain-car_maker-Toyota")
      .locator("xpath=ancestor::div[contains(@class,'border-t')][1]")
      .getByRole("button", { name: "Add" })
      .click();
    await expect(
      page
        .locator("#add-domain-car_maker-Toyota")
        .locator("xpath=ancestor::div[contains(@class,'border-t')][1]")
        .getByText(/Type a website address, like amayama.com/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Dominion 6 (dark): add-maker dialog screenshot", async ({ page }) => {
    await signInOwner(page, true);
    await page.goto("/?page=parts-catalog&tab=trusted-sources");
    await expect(page.getByRole("heading", { name: "Trusted sources", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Add a car maker" }).click();
    await page.locator("#trusted-add-maker").fill("FxDarkMaker");
    await page.locator("#trusted-add-domain").fill("fx-dark.example");
    await page.screenshot({
      path: join(shotsDir, "trusted_sources_add_remove_dialog_workflows_screen_2-live-dark.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel" }).click();
    sql(`DELETE FROM public.trusted_source WHERE domain='fx-dark.example';`);
  });

  test("Dominion 7: analyst cannot add or remove trusted sources", async ({ page }) => {
    await signInAnalyst(page);
    await page.goto("/?page=parts-catalog&tab=trusted-sources");
    await expect(page.getByRole("heading", { name: "Trusted sources", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Add a car maker" })).toBeDisabled();
    await expect(page.locator("#add-domain-car_maker-Toyota")).toBeDisabled();

    await page.screenshot({
      path: join(shotsDir, "trusted_sources_system_states_edge_cases_screen_3-live.png"),
      fullPage: true,
    });
  });

  test("Dominion 7 (dark): analyst trusted sources", async ({ page }) => {
    await signInAnalyst(page, true);
    await page.goto("/?page=parts-catalog&tab=trusted-sources");
    await expect(page.getByRole("heading", { name: "Trusted sources", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: join(shotsDir, "trusted_sources_system_states_edge_cases_screen_3-live-dark.png"),
      fullPage: true,
    });
  });

  test("Dominion 5: trusted sources list, add a site, remove it", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/?page=parts-catalog&tab=trusted-sources");
    await expect(page.getByRole("heading", { name: "Trusted sources", exact: true })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("heading", { name: "Toyota", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "SB Nagamochi", exact: true })).toBeVisible();
    await expect(page.getByText("sbparts.jp", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "FxToyota", exact: true }).locator("xpath=ancestor::article[1]"),
    ).toContainText("No trusted sites yet — links for this maker are saved as Needs checking.");
    await page.screenshot({
      path: join(shotsDir, "trusted_sources_maker_directory_screen_1-live.png"),
      fullPage: true,
    });

    await page.locator("#add-domain-car_maker-Toyota").fill(TEST_DOMAIN);
    const addBtn = page
      .locator("#add-domain-car_maker-Toyota")
      .locator("xpath=ancestor::div[contains(@class,'border-t')][1]")
      .getByRole("button", { name: "Add" });
    await addBtn.click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: TEST_DOMAIN }).getByRole("button", { name: "Undo" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(TEST_DOMAIN, { exact: true })).toBeVisible({ timeout: 15_000 });
    expect(
      sql(
        `SELECT count(*) FROM public.trusted_source WHERE kind='car_maker' AND maker_norm='toyota' AND domain='${TEST_DOMAIN}';`,
      ),
    ).toBe("1");

    const siteRow = page.getByText(TEST_DOMAIN, { exact: true }).locator("xpath=ancestor::div[.//button[contains(., 'Remove')]][1]");
    await siteRow.getByRole("button", { name: /Remove/ }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("alertdialog")).toContainText(TEST_DOMAIN);
    await expect(page.getByRole("alertdialog")).toContainText("Toyota");
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText(TEST_DOMAIN, { exact: true })).toHaveCount(0, { timeout: 15_000 });
    expect(sql(`SELECT count(*) FROM public.trusted_source WHERE domain='${TEST_DOMAIN}';`)).toBe("0");
  });

  test("Dominion 5 (dark): trusted sources list", async ({ page }) => {
    await signInOwner(page, true);
    await page.goto("/?page=parts-catalog&tab=trusted-sources");
    await expect(page.getByRole("heading", { name: "Toyota", exact: true })).toBeVisible({ timeout: 30_000 });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg, "dark background").not.toBe("rgb(255, 255, 255)");
    await page.screenshot({
      path: join(shotsDir, "trusted_sources_maker_directory_screen_1-live-dark.png"),
      fullPage: true,
    });
  });

  test("Dominion 2–3: add a part per-car trust shows on review", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/?page=parts-catalog&tab=add-parts");
    await expect(page.getByRole("heading", { name: "Add parts" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Start/i }).click();
    await page.getByRole("button", { name: /Brake pads/ }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByLabel("Brand", { exact: true }).fill("MK Kashiyama");
    await page.getByLabel("Part number", { exact: true }).fill("E2E-ROOMY-1");
    await page.getByRole("button", { name: /No — another brand/ }).click();
    await page.getByLabel("Source page link", { exact: true }).fill("https://example.com/src");
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { name: /How does it fit/i })).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder("Make, model or chassis code…").fill("FxRoomy");
    const row = page.locator("label", { has: page.locator('input[type="checkbox"]') }).filter({ hasText: "FxRoomy" }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Front Axle" }).click();
    await page.getByRole("button", { name: "Needs checking", exact: true }).click();
    await page.getByPlaceholder("Short reason…").fill("Only a shop listing so far");
    await page.screenshot({
      path: join(shotsDir, "add_parts_step_2a_specific_cars_per_car_trust_year_editor-live.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: /Next: replaces \(optional\)/i }).click();
    await page.getByRole("button", { name: /Next: Review in plain words/i }).click();
    await expect(page.getByText(/Per-car trust:/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Needs checking \(1\)/ })).toBeVisible();
    await expect(page.locator("table").filter({ hasText: "FxRoomy" })).toContainText(/2018[\u2013\-]2022/);
    await page.screenshot({
      path: join(shotsDir, "add_parts_step_4_review_trust_breakdown-live.png"),
      fullPage: true,
    });
  });

  test("3b-09: example.com save — part pending, car needs checking", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/?page=parts-catalog&tab=add-parts");
    await expect(page.getByRole("heading", { name: "Add parts" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Start/i }).click();
    await page.getByRole("button", { name: /Brake pads/ }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByLabel("Brand", { exact: true }).fill("E2E Brand");
    await page.getByLabel("Part number", { exact: true }).fill(E2E_3B09_NUM_A);
    await page.getByRole("button", { name: /No — another brand/ }).click();
    await page.getByLabel("Source page link", { exact: true }).fill("https://example.com/x");
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { name: /How does it fit/i })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("Make, model or chassis code…").fill("FxRoomy");
    const row = page.locator("label", { has: page.locator('input[type="checkbox"]') }).filter({ hasText: "FxRoomy" }).first();
    await row.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Front Axle" }).click();
    await page.getByRole("button", { name: "Needs checking", exact: true }).click();
    await page.getByPlaceholder("Short reason…").fill("E2E example.com link");
    await page.getByRole("button", { name: /Next: replaces \(optional\)/i }).click();
    await page.getByRole("button", { name: /Next: Review in plain words/i }).click();
    const saveResp = page.waitForResponse(
      (r) => r.url().includes("/admin/catalog/parts/add") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "Save part ✓" }).click();
    const saveResult = await saveResp;
    expect(saveResult.ok(), await saveResult.text()).toBeTruthy();
    await expect(page.getByText("Workflow complete")).toBeVisible({ timeout: 30_000 });
    const dec = sql(`SELECT catalog_decision FROM public.part_master WHERE oem_part_number='${E2E_3B09_NUM_A}' LIMIT 1;`);
    expect(dec).toBe("pending");
    const lt = sql(`SELECT trust FROM public.part_listing pl JOIN public.part_master pm ON pm.interchange_group_id=pl.interchange_group_id WHERE pm.oem_part_number='${E2E_3B09_NUM_A}' LIMIT 1;`);
    expect(lt).toBe("needs_checking");
  });

  test("3b-09: trusted car-maker site — part and listing confirmed", async ({ page }) => {
    sql(
      `INSERT INTO public.trusted_source (kind, maker, domain) VALUES ('car_maker', '${FX_MAKER_NAME}', '${FX_MAKER_DOMAIN}') ON CONFLICT ON CONSTRAINT trusted_source_unique_triplet DO NOTHING;`,
    );
    await signInOwner(page);
    await page.goto("/?page=parts-catalog&tab=add-parts");
    await expect(page.getByRole("heading", { name: "Add parts" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Start/i }).click();
    await page.getByRole("button", { name: /Brake pads/ }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByLabel("Brand", { exact: true }).fill("E2E Brand");
    await page.getByLabel("Part number", { exact: true }).fill(E2E_3B09_NUM_B);
    await page.getByRole("button", { name: /No — another brand/ }).click();
    await page.getByLabel("Source type").getByText("Car maker's parts catalogue").click();
    await page.locator("#catalog-car-maker-select").selectOption(FX_MAKER_NAME);
    await page.getByLabel("Source page link", { exact: true }).fill(`https://${FX_MAKER_DOMAIN}/e2e`);
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { name: /How does it fit/i })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder("Make, model or chassis code…").fill("FxRoomy");
    const row = page.locator("label", { has: page.locator('input[type="checkbox"]') }).filter({ hasText: "FxRoomy" }).first();
    await row.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Front Axle" }).click();
    await page.getByRole("button", { name: "Confirmed", exact: true }).click();
    await page.getByRole("button", { name: /Next: replaces \(optional\)/i }).click();
    await page.getByRole("button", { name: /Next: Review in plain words/i }).click();
    const saveResp = page.waitForResponse(
      (r) => r.url().includes("/admin/catalog/parts/add") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "Save part ✓" }).click();
    const saveResult = await saveResp;
    expect(saveResult.ok(), await saveResult.text()).toBeTruthy();
    await expect(page.getByText("Workflow complete")).toBeVisible({ timeout: 30_000 });
    expect(sql(`SELECT catalog_decision FROM public.part_master WHERE oem_part_number='${E2E_3B09_NUM_B}' LIMIT 1;`)).toBe("confirmed");
    expect(sql(`SELECT trust FROM public.part_listing pl JOIN public.part_master pm ON pm.interchange_group_id=pl.interchange_group_id WHERE pm.oem_part_number='${E2E_3B09_NUM_B}' LIMIT 1;`)).toBe(
      "confirmed",
    );
    sql(`DELETE FROM public.trusted_source WHERE domain='${FX_MAKER_DOMAIN}';`);
  });

  test("Dominion 2–3 (dark): add a part screenshots", async ({ page }) => {
    await signInOwner(page, true);
    await page.goto("/?page=parts-catalog&tab=add-parts");
    await expect(page.getByRole("heading", { name: "Add parts" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Start/i }).click();
    await page.getByRole("button", { name: /Brake pads/ }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByLabel("Brand", { exact: true }).fill("MK Kashiyama");
    await page.getByLabel("Part number", { exact: true }).fill("E2E-ROOMY-DARK");
    await page.getByRole("button", { name: /No — another brand/ }).click();
    await page.getByLabel("Source page link", { exact: true }).fill("https://example.com/src-dark");
    await page.getByRole("button", { name: /^Next/ }).click();
    await expect(page.getByRole("heading", { name: /How does it fit/i })).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: join(shotsDir, "add_parts_step_2a_specific_cars_per_car_trust_year_editor-live-dark.png"),
      fullPage: true,
    });
    await page.getByPlaceholder("Make, model or chassis code…").fill("FxRoomy");
    const row = page.locator("label", { has: page.locator('input[type="checkbox"]') }).filter({ hasText: "FxRoomy" }).first();
    await row.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Front Axle" }).click();
    await page.getByRole("button", { name: "Needs checking", exact: true }).click();
    await page.getByPlaceholder("Short reason…").fill("Dark mode step");
    await page.getByRole("button", { name: /Next: replaces \(optional\)/i }).click();
    await page.getByRole("button", { name: /Next: Review in plain words/i }).click();
    await expect(page.getByText(/Per-car trust:/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: join(shotsDir, "add_parts_step_4_review_trust_breakdown-live-dark.png"),
      fullPage: true,
    });
  });
});
