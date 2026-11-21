/**
 * Research engine layer 3 — the 18 Dominion screens (docs/research-engine-audit.md §4 / §4b, done-test 30).
 * Every research route is answered with made-up fixture data, every button listed in §4b is pressed, and no "Drop"
 * word may appear on any screen. Set RE_SHOTS=<folder> to also save a screenshot of each screen for the Stitch check.
 * Run: node node_modules/@playwright/test/cli.js test -c playwright.dominion.config.ts e2e/dominion-research-engine.spec.ts
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const CAR = "ap900005-0000-4000-8000-000000000002";
const roomy = {
  id: CAR,
  make: "Toyota",
  model: "Roomy",
  production_start_year: 2016,
  production_end_year: 2020,
  chassis_code: "M900A",
  engine_code: "1KR-FE",
  drivetrain: "2WD",
  transmission: "CVT",
};

// Words §4b drops everywhere (bypass wording, invented providers / ids / scores, wrong trust rules, request fields).
const BANNED = [
  "headless", "human proxy", "Bypassed", "403 redirected", "Scraped", "crawler", "Circuit open", "Worker node",
  "sockets", "telemetry", "Engine #04", "SerpAPI", "Serper", "Gemini 1.5", "#VH-", "PROP-", "Part review #",
  "Session #DOM", "Signed Hash", "Confidence:", "% Match", "extraction accuracy", "Strict Dual-Proof",
  "Spec Validation Integrity Rule", "DOM-COR-01", "What they asked", "First asked", "companies told", "fleets notified",
  "Requested by", "Homologation", "Fleet API",
];

function job(over: Record<string, unknown>) {
  return {
    jobType: "part",
    state: "queued",
    vehicleCatalogId: CAR,
    car: roomy,
    partTypeId: "c-1",
    partTypeName: "Part",
    specKey: null,
    specLabel: null,
    fitDescriptor: null,
    resultPartNumber: "—",
    sourceCount: 0,
    trustRoute: null,
    siteDomains: [],
    conflictOpen: false,
    updatedAt: "2026-11-20T10:00:00Z",
    ...over,
  };
}

const PART_JOBS = [
  job({ jobId: "job-auto", state: "auto_added", partTypeName: "Front brake pads", fitDescriptor: "front", resultPartNumber: "SB 00000-T0001", trustRoute: "c", siteDomains: ["sbparts.jp", "jnbk-brakes.com"] }),
  job({ jobId: "job-review", state: "needs_review", partTypeName: "Rear wheel bearing", fitDescriptor: "rear", resultPartNumber: "Masuma 00000-T0002", siteDomains: ["masuma.parts"] }),
  job({ jobId: "job-bc", jobType: "spec", state: "browser_check", partTypeId: null, partTypeName: null, specKey: "battery_jis", specLabel: "Battery size" }),
  job({ jobId: "job-bcp", state: "browser_check", partTypeName: "Spark plugs", resultPartNumber: "Toyota 00000-T0009" }),
  job({ jobId: "job-res", state: "researching", partTypeName: "Wiper blades" }),
  job({ jobId: "job-wait", state: "queued", partTypeName: "Air filter" }),
  job({ jobId: "job-cf", state: "needs_review", partTypeName: "Rear brake shoes", fitDescriptor: "rear", conflictOpen: true }),
];

const VEHICLE_JOBS = [
  job({ jobId: "job-v1", jobType: "vehicle", state: "needs_review", car: null, vehicleCatalogId: null, subject: { make: "Toyota", model: "Roomy", year: 2021 }, vehicleProposals: [{ make: "Toyota", model: "Roomy", production_start_year: 2020, production_end_year: null, chassis_code: "M900A", engine_code: "1KR-VET", drivetrain: "2WD", grade: null, market: "JP", action: "new", status: "open" }] }),
  job({ jobId: "job-m1", jobType: "vehicle_model", state: "needs_review", car: null, vehicleCatalogId: null, subject: { make: "Toyota", model: "Roomy", year: null }, vehicleProposals: [] }),
  job({ jobId: "job-v3", jobType: "vehicle_identity", state: "researching" }),
];

function vprop(id: string, over: Record<string, unknown>) {
  return {
    id, job_id: "job-m1", make: "Toyota", model: "Roomy", production_start_year: 2016, production_end_year: 2020,
    chassis_code: "M900A", engine_code: "1KR-FE", drivetrain: "2WD", transmission: "CVT", market: "JP", grade: null,
    chassis_serial_from: null, chassis_serial_to: null, existing_vehicle_catalog_id: null, action: "new", status: "open",
    rejected_reason: null, sources: [], checks: { trust: "needs_checking" }, evidence_read_ids: [], ...over,
  };
}

function proposal(id: string, jobId: string, over: Record<string, unknown>) {
  return {
    id, job_id: jobId, brand: "Masuma", part_number: "00000-T0002", part_name: "Rear wheel bearing", match_kind: "aftermarket",
    position_key: "rear", fits: { listings: [{ vehicleId: CAR, position: "rear" }] },
    sources: [{ url: "https://masuma.parts/x", domain: "masuma.parts", readId: "r-1", block: "Roomy M900A rear hub bearing 00000-T0002" }],
    checks: { trust: "needs_checking", passes: [{ domain: "masuma.parts", kind: "part_maker", maker: "masuma" }] },
    route: "review", status: "open", trust_route: null, evidence_read_ids: ["r-1"], promoted_part_id: null, rejected_reason: null, ...over,
  };
}

function detail(jobId: string) {
  const base = {
    car: { ...roomy, engine_words: "regular engine (not turbo)" }, partType: null as unknown, spec: null as unknown, browserCheckUrl: null as string | null,
    reads: [{ id: "r-1", domain: "masuma.parts", path: "direct", read_at: "2026-11-20T14:22:00Z" }, { id: "r-2", domain: "sbparts.jp", path: "direct", read_at: "2026-11-20T14:22:00Z" }],
    proposals: [] as unknown[], vehicleProposals: [] as unknown[], specProposals: [] as unknown[], conflicts: [] as unknown[], events: [],
  };
  const j = (state: string, extra: Record<string, unknown> = {}) => ({ id: jobId, job_type: "part", state, vehicle_catalog_id: CAR, maintenance_component_id: "c-1", fit_descriptor: "rear", spec_key: null, attempts: 1, last_error: null, updated_at: "2026-11-20T10:00:00Z", ...extra });
  switch (jobId) {
    case "job-review":
      return { ...base, job: j("needs_review"), partType: { id: "c-1", name: "Rear wheel bearing" }, proposals: [proposal("p-1", jobId, {})] };
    case "job-auto":
      return { ...base, job: j("auto_added", { fit_descriptor: "front" }), partType: { id: "c-2", name: "Front brake pads" }, proposals: [proposal("p-2", jobId, { brand: "SB", part_number: "00000-T0001", position_key: "front", status: "promoted", trust_route: "c", checks: { trust: "confirmed" }, sources: [{ domain: "sbparts.jp", readId: "r-2", block: "M900A front pad 00000-T0001", url: "https://sbparts.jp/x" }] })] };
    case "job-bc":
      return { ...base, sisterEngines: [{ code: "1KR-VET", turbo: true }], job: j("browser_check", { job_type: "spec", spec_key: "battery_jis", maintenance_component_id: null, fit_descriptor: null }), spec: { key: "battery_jis", label: "Battery size", unit: null }, browserCheckUrl: "https://www.amayama.com/en/part/toyota/roomy-m900a" };
    case "job-bcp":
      return {
        ...base,
        job: j("browser_check", { fit_descriptor: null }),
        partType: { id: "c-9", name: "Spark plugs" },
        browserCheckUrl: "https://www.amayama.com/en/part/toyota/roomy-m900a-plugs",
        knownVersion: { domain: "amayama.com", code: "M900A-AGBVE", url: "https://www.amayama.com/en/part/toyota/roomy-m900a-plugs" },
        proposals: [proposal("p-9", jobId, { brand: "Toyota", part_number: "00000-T0009" })],
      };
    case "job-cf":
      return {
        ...base,
        job: j("needs_review"),
        partType: { id: "c-3", name: "Rear brake shoes" },
        proposals: [
          proposal("p-a", jobId, { brand: "SB", part_number: "00000-A0001", sources: [{ domain: "sbparts.jp", readId: "r-2", block: "M900A rear shoe 00000-A0001", url: "https://sbparts.jp/a" }] }),
          proposal("p-b", jobId, { brand: "NiBK", part_number: "00000-B0002", sources: [{ domain: "jnbk-brakes.com", readId: "r-1", block: "M900A rear shoe 00000-B0002", url: "https://jnbk-brakes.com/b" }] }),
        ],
        conflicts: [{ id: "cf-1", proposal_ids: ["p-a", "p-b"], position: "rear", opened_at: "2026-11-20T10:00:00Z", closed_at: null, resolution: null }],
      };
    case "job-v1":
      return { ...base, car: null, job: j("needs_review", { job_type: "vehicle", vehicle_catalog_id: null }), vehicleProposals: [vprop("vp-1", { job_id: "job-v1", production_start_year: 2020, production_end_year: null, engine_code: "1KR-VET" })] };
    case "job-m1":
      return {
        ...base,
        car: null,
        job: j("needs_review", { job_type: "vehicle_model", vehicle_catalog_id: null }),
        vehicleProposals: [
          vprop("m-1", { action: "same", existing_vehicle_catalog_id: CAR }),
          vprop("m-2", { action: "same", drivetrain: "4WD", chassis_code: "M910A", existing_vehicle_catalog_id: CAR }),
          vprop("m-3", { action: "update", production_start_year: 2020, production_end_year: null, chassis_serial_from: "M900A-0000001", chassis_serial_to: "M900A-0000999", existing_vehicle_catalog_id: CAR }),
          vprop("m-4", { action: "new", production_start_year: 2020, production_end_year: null, engine_code: "1KR-VET", grade: "Custom G-T" }),
          vprop("m-5", { action: "new", production_start_year: 2020, production_end_year: null, drivetrain: "4WD", chassis_code: "M910A" }),
        ],
      };
    default:
      return { ...base, job: j("queued") };
  }
}

function summary(over: Record<string, unknown> = {}) {
  return {
    needsReview: 2, browserCheckOpen: 7, browserCheckWaiting: 3, browserCheckMax: 25, researching: 1, waiting: 14,
    addedThisWeek: 12, addedAutoThisWeek: 5, vehiclesNeedsReview: 2, conflictsOpen: 1, spendTodayUsd: 0.31,
    dailySpendUsd: 1.35, costPerJob7dUsd: 0.075, jobsDone7d: 40, remainingJobs: 21, fillTargetDate: "2027-02-18",
    expectedFinishDate: "2027-01-30", carsWithoutFrameCode: 763, shadowMode: true, shadowStreak: 6, paused: false,
    pausedReason: null, autoResumeAt: null, enabled: true, researchingCar: "Toyota Roomy 2016–2020",
    fillPlan: { cars: 200, ready: 38, inProgress: 121, waiting: 41 }, fillingFirst: [], ...over,
  };
}

const SITES = [
  { domain: "sbparts.jp", automated_read: "allowed", automated_read_checked_at: "2026-11-20", automated_read_note: null, blocked_at: null, backoff_until: null, pages_confirmed: 14, makers: [{ kind: "part_maker", maker: "SB Nagamochi" }], recipeCount: 2 },
  { domain: "jnbk-brakes.com", automated_read: "allowed", automated_read_checked_at: "2026-11-20", automated_read_note: null, blocked_at: null, backoff_until: null, pages_confirmed: 8, makers: [{ kind: "part_maker", maker: "NiBK" }], recipeCount: 1 },
  { domain: "amayama.com", automated_read: "blocked", automated_read_checked_at: "2026-11-20", automated_read_note: null, blocked_at: "2026-11-20T16:35:00Z", backoff_until: null, pages_confirmed: 3, makers: [{ kind: "car_maker", maker: "Toyota" }, { kind: "car_maker", maker: "Daihatsu" }], recipeCount: 1 },
  { domain: "rockauto.com", automated_read: "allowed", automated_read_checked_at: "2026-11-20", automated_read_note: null, blocked_at: null, backoff_until: null, pages_confirmed: 0, makers: [{ kind: "reference", maker: "All makers" }], recipeCount: 0 },
];

const RECIPES = [
  { id: "rc-1", domain: "sbparts.jp", maker_norm: null, name: "Search by car, then open the result", kind: "search_then_page", search_url_template: "https://sbparts.jp/search?q={chassis}", result_link_rule: "/catalog/", block_rule: null, active: true, notes: null, updated_at: "2026-11-20T10:00:00Z", worked: 14, lastWorkedAt: "2026-11-20T10:00:00Z" },
  { id: "rc-2", domain: "sbparts.jp", maker_norm: null, name: "Search by part number", kind: "by_part_number", search_url_template: "https://sbparts.jp/search?n={number}", result_link_rule: null, block_rule: null, active: true, notes: null, updated_at: "2026-11-20T10:00:00Z", worked: 0, lastWorkedAt: null },
];

function coverage(identityMissing = false) {
  const p = (componentId: string, opCode: string, name: string, cell: string, jobState: string | null, extra: Record<string, unknown> = {}) => ({
    componentId, opCode, name, cell, partNumber: null, maker: null, sourceUrl: null, jobId: jobState ? `job-${componentId}` : null, jobState, conflictId: null, ...extra,
  });
  const s = (specKey: string, label: string, value: string | null, trust: string | null, jobState: string | null = null) => ({
    specKey, label, value, unit: null, trust, sourceNote: trust === "needs_checking" ? "CSV import" : null, sourceUrl: trust === "confirmed" ? "https://sbparts.jp/x" : null, trustRoute: trust === "confirmed" ? "b" : null, checkedAt: trust === "confirmed" ? "2026-11-20T10:00:00Z" : null, jobId: jobState ? `job-${specKey}` : null, jobState,
  });
  return {
    vehicleCatalogId: CAR, make: "Toyota", model: "Roomy", chassisCode: identityMissing ? null : "M900A", engineCode: "1KR-FE", partsReady: 4,
    parts: [
      p("c1", "BRK-PADS", "Brake pads", "verified", null, { partNumber: "00000-T0001", maker: "SB", sourceUrl: "https://sbparts.jp/x" }),
      p("c2", "ENG-OIL", "Engine oil & filter", "verified", null, { partNumber: "00000-T0003", maker: "Toyota" }),
      p("c3", "FILT-AIR", "Engine air filter", "verified", null, { partNumber: "00000-T0004", maker: "Masuma" }),
      p("c4", "SUS-SHOCK", "Shock absorbers", "verified", null, { partNumber: "00000-T0005", maker: "KYB" }),
      p("c5", "HVAC-CABIN", "Cabin filter", "unverified", "needs_review", { partNumber: "00000-T0006", maker: "Denso" }),
      p("c6", "ENG-SPARK", "Spark plugs", "missing", "browser_check"),
      p("c7", "BRK-ROTOR", "Brake rotors", "missing", "needs_review", { conflictId: "cf-1" }),
      p("c8", "ENG-THERM", "Thermostat", "missing", "researching"),
      p("c9", "BELT-SERP", "Drive belt", "missing", "not_found"),
      p("c10", "LGT-WIPER", "Wiper blades", "not_applicable", null),
    ],
    specs: [
      s("battery_jis", "Battery size", "M-42", "confirmed"),
      s("engine_oil_grade", "Engine oil grade", null, null),
      s("tire_size", "Tire size", "165/65R14", "needs_checking"),
      s("brake_fluid", "Brake fluid", null, null, "queued"),
    ],
    allSpecs: [
      s("battery_jis", "Battery size", "M-42", "confirmed"),
      s("tire_size", "Tire size", "165/65R14", "needs_checking"),
    ],
  };
}

type Calls = Array<{ method: string; path: string; body: unknown }>;
type Mode = { caughtUp?: boolean; identityMissing?: boolean; paused?: boolean };

function token() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ aal: "aal2", sub: "11111111-1111-4111-8111-111111111111", role: "authenticated", exp: 4_000_000_000, app_metadata: { role: "platform_owner" } })}.sig`;
}

async function install(page: Page, calls: Calls, mode: Mode = {}) {
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: { role: "platform_owner" }, user_metadata: {} };
  const session = { access_token: token(), refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.addInitScript((s) => localStorage.setItem("sb-example-auth-token", JSON.stringify(s)), session);
  await page.route("**/auth/v1/**", (route) =>
    route.request().url().includes("/mfa/") ? route.fulfill({ json: { currentLevel: "aal2", nextLevel: "aal2" } }) : route.fulfill({ json: session }),
  );
  const handler = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const R = "/admin/catalog-research";
    if (method !== "GET" && path.includes(R)) {
      calls.push({ method, path: path.slice(path.indexOf(R) + R.length), body: req.postDataJSON?.() ?? null });
      if (path.endsWith("/browser-checks/job-bcp/preview")) {
        const b = (req.postDataJSON() as { pasted?: string; number?: string }) ?? {};
        const pasted = String(b.pasted ?? "");
        const num = String(b.number ?? "");
        const gate = !/M900A/i.test(pasted)
          ? { ok: false, reason: "no_car" }
          : num
            ? pasted.includes(num) ? { ok: true, detected: num } : { ok: false, reason: "number_not_on_line" }
            : pasted.includes("00000-T0009") ? { ok: true, detected: "00000-T0009" } : { ok: false, reason: "no_number" };
        return route.fulfill({ json: { gate } });
      }
      if (path.endsWith("/preview")) {
        const pasted = String((req.postDataJSON() as { pasted?: string })?.pasted ?? "");
        return route.fulfill({ json: { gate: /M900A/i.test(pasted) && /M-42/i.test(pasted) ? { ok: true, detected: "M-42" } : { ok: false, reason: /M900A/i.test(pasted) ? "no_value" : "no_car" } } });
      }
      if (path.endsWith("/test")) return route.fulfill({ json: { found: true, block: "M900A front pad 00000-T0001", url: "https://sbparts.jp/x" } });
      if (path.endsWith("/fill/car")) return route.fulfill({ json: { result: { identityFirst: Boolean(mode.identityMissing), newJobs: 6, joined: 0 } } });
      if (path.endsWith("/reprocess-queued")) return route.fulfill({ json: { requeued: 14 } });
      return route.fulfill({ json: { ok: true, result: {} } });
    }
    if (path.includes(`${R}/summary`)) return route.fulfill({ json: mode.caughtUp ? summary({ needsReview: 0, browserCheckOpen: 0, conflictsOpen: 0 }) : summary({ paused: Boolean(mode.paused), pausedReason: mode.paused ? "Google's daily search limit reached" : null, autoResumeAt: mode.paused ? "2026-11-21T00:05:00Z" : null }) });
    if (path.includes(`${R}/notices`)) {
      return route.fulfill({ json: { items: [
        { id: "n1", kind: "engine_paused", subject: "", reason: "Google's daily search limit reached", resumeAt: null, openedAt: "2026-11-20T10:00:00Z" },
        { id: "n2", kind: "site_blocked", subject: "amayama.com", reason: null, resumeAt: null, openedAt: "2026-11-20T16:35:00Z" },
      ] } });
    }
    if (path.includes(`${R}/coverage/`)) return route.fulfill({ json: coverage(Boolean(mode.identityMissing)) });
    if (path.includes(`${R}/jobs/`)) return route.fulfill({ json: detail(path.split("/jobs/")[1]) });
    if (path.endsWith(`${R}/jobs`)) {
      const types = url.searchParams.get("types") ?? "";
      if (mode.caughtUp && types.includes("part")) return route.fulfill({ json: { items: PART_JOBS.filter((j) => ["auto_added", "queued"].includes(String(j.state))) } });
      return route.fulfill({ json: { items: types.includes("vehicle") ? VEHICLE_JOBS : PART_JOBS } });
    }
    if (path.includes(`${R}/settings`)) {
      return route.fulfill({ json: { settings: { enabled: true, shadow_mode: true, paused: Boolean(mode.paused), paused_reason: mode.paused ? "Google's daily search limit reached" : null, auto_resume_at: null, shadow_approve_streak: 6, daily_spend_usd: 1.35 }, status: "NOMINAL" } });
    }
    if (path.includes(`${R}/incidents`)) return route.fulfill({ json: { items: [{ id: "job-inc", state: "failed", last_error: "Google error 503", attempts: 2, updated_at: "2026-11-20T10:00:00Z" }] } });
    if (path.endsWith("/reads")) return route.fulfill({ json: { items: [{ id: "rd1", purpose: "job", path: "direct", url: "https://sbparts.jp/catalog/m900a", httpStatus: 200, foundRow: true, readAt: "2026-11-20T10:00:00Z" }] } });
    if (path.endsWith("/recipes")) return route.fulfill({ json: { items: RECIPES } });
    if (path.includes(`${R}/trusted-sites`)) return route.fulfill({ json: { items: SITES } });
    if (path.includes(`${R}/browser-checks/summary`)) return route.fulfill({ json: { open: 7, waiting: 3, max: 25 } });
    if (path.includes("pending-catalog/parts-queue")) return route.fulfill({ json: { items: [], total: 0, weeklyTarget: 0 } });
    if (path.includes("admin/catalog/parts/browse")) return route.fulfill({ json: { systems: [], common: [] } });
    if (path.includes("parts-auto-match") || path.includes("auto-match")) return route.fulfill({ json: { rows: [], totalsByStatus: { open: 3 }, filteredCount: 0 } });
    if (path.includes("vehicle-catalog") && url.searchParams.get("picker") === "1") return route.fulfill({ json: { items: [roomy], total: 1 } });
    if (path.includes("platform-status")) return route.fulfill({ json: { maintenanceMode: false, maintenanceMessage: "", platformName: "Dominion" } });
    if (path.includes("settings/preferences")) return route.fulfill({ json: { darkMode: false } });
    if (path.includes("/admin/quality") || path.includes("/admin/changes") || path.includes("/admin/consumers")) return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: {} });
  };
  await page.route("**/functions/v1/**", handler);
  await page.route("**/__sb/functions/v1/**", handler);
}

const SHOTS = process.env.RE_SHOTS?.trim();
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

async function noDropWords(page: Page) {
  const text = await page.locator("body").innerText();
  for (const w of BANNED) expect(text, `"${w}" must not appear`).not.toContain(w);
}

async function openParts(page: Page) {
  await page.goto("/?page=pending-motor-vehicles&tab=parts");
  await expect(page.getByTestId("research-parts-tab")).toBeVisible({ timeout: 60_000 });
}

test.describe("Research engine screens (layer 3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test("Screen 1 + 16 — parts list, cards, filters, banners; Export + Re-run", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openParts(page);
    await expect(page.getByTestId("card-needs-review")).toContainText("2");
    await expect(page.getByTestId("card-browser-checks")).toContainText("7 of 25");
    await expect(page.getByTestId("card-researching")).toContainText("Toyota Roomy 2016–2020");
    await expect(page.getByTestId("parts-row")).toHaveCount(7);
    await expect(page.getByTestId("row-route-line").first()).toContainText("Two makers agree");
    await expect(page.getByTestId("filter-browser_check")).toContainText("7 of 25 open");
    await expect(page.getByTestId("notice-engine_paused")).toContainText("Open research settings");
    await expect(page.getByTestId("notice-site_blocked")).toContainText("Amayama blocks Roam. Its items are now browser checks.");
    await page.getByTestId("filter-waiting").click();
    await expect(page.getByTestId("parts-row")).toHaveCount(1);
    await page.getByTestId("filter-all").click();
    await page.keyboard.press("/");
    await page.getByTestId("parts-search").fill("bearing");
    await expect(page.getByTestId("parts-row")).toHaveCount(1);
    await page.getByTestId("parts-search").fill("");
    await page.getByTestId("rerun-waiting").click();
    await expect.poll(() => calls.some((c) => c.path === "/reprocess-queued")).toBe(true);
    await noDropWords(page);
    await shot(page, "01-pending-parts-list");
  });

  test("Screen 2 — Roam found: checks, saved text, Looks right, Edit and add, Research again, Couldn't find", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openParts(page);
    await page.getByTestId("parts-row").filter({ hasText: "Rear wheel bearing" }).getByTestId("row-review").click();
    const d = page.getByTestId("research-drawer");
    await expect(d.getByTestId("roam-found-card")).toBeVisible();
    await expect(d.getByTestId("found-number")).toHaveText("Masuma 00000-T0002");
    await expect(d.getByTestId("how-sure")).toHaveText("One part maker lists it. Two makers, or the car maker's catalogue, would confirm it.");
    await expect(d).toContainText("Read on 20 Nov 2026");
    await expect(d.getByTestId("checks-list")).toContainText("Rear position is in the same row");
    await d.getByTestId("see-saved-text").click();
    await expect(d.getByTestId("saved-page-text")).toContainText("Roomy M900A rear hub bearing");
    await shot(page, "02-request-drawer-roam-found");
    await d.getByTestId("edit-and-add").click();
    await expect(d.getByTestId("edit-and-add-form")).toBeVisible();
    await d.getByTestId("edit-and-add").click();
    await noDropWords(page);
    await d.getByTestId("looks-right").click();
    await expect.poll(() => calls.find((c) => c.path === "/jobs/job-review/looks-right")?.body).toEqual({ proposalId: "p-1" });
    await expect(page.getByTestId("research-toast")).toContainText("Added Rear wheel bearing (00000-T0002)");
    await expect(page.getByTestId("research-toast").getByRole("button", { name: "Undo" })).toBeVisible();
    await page.getByTestId("parts-row").filter({ hasText: "Rear wheel bearing" }).click();
    await page.getByRole("button", { name: "Research again" }).click();
    await expect.poll(() => calls.some((c) => c.path === "/jobs/job-review/retry")).toBe(true);
    await page.getByTestId("parts-row").filter({ hasText: "Rear wheel bearing" }).click();
    await page.getByTestId("couldnt-find").click();
    await expect.poll(() => calls.some((c) => c.path === "/jobs/job-review/not-found")).toBe(true);
  });

  test("Auto-added row — Undo auto-add", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openParts(page);
    await page.getByTestId("parts-row").filter({ hasText: "Front brake pads" }).click();
    await expect(page.getByTestId("research-drawer").getByTestId("how-sure")).toHaveText("Two part makers name the same factory number.");
    await page.getByTestId("undo-auto-add").click();
    await expect.poll(() => calls.some((c) => c.path === "/jobs/job-auto/undo")).toBe(true);
  });

  test("Screen 3 — browser check (RE-68): unknown version → type the Model; answer, then Confirm; Not on this page", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openParts(page);
    await page.getByTestId("parts-row").filter({ hasText: "Battery size" }).getByTestId("row-open-browser-check").click();
    const d = page.getByTestId("research-drawer");
    await expect(d.getByTestId("open-catalogue-page")).toHaveAttribute("href", "https://www.amayama.com/en/part/toyota/roomy-m900a");
    await expect(d.getByTestId("open-catalogue-page")).toContainText("Open Amayama");
    // No remembered version: the row to click in the catalogue's own column words, never a frame code to read.
    await expect(d.getByTestId("browser-check-instruction")).toContainText("Click the row with:");
    await expect(d.getByTestId("guide-version-row")).toContainText("Engine: 1KRFE");
    await expect(d.getByTestId("guide-version-row")).toContainText("Prod period:");
    await expect(d.getByTestId("browser-check-counter")).toContainText("7 of 25");
    await expect(d.getByTestId("browser-check-confirm")).toBeDisabled();
    await d.getByTestId("q-version-code").fill("M900A-AGBVE");
    await d.getByTestId("q-part-yes").click();
    await d.getByTestId("q-value").fill("M-42");
    // Typed (not tapped) → typed twice.
    await d.getByTestId("q-value-again").fill("M-42");
    await expect(d.getByTestId("browser-check-confirm")).toBeDisabled();
    // A "No" stops Confirm and says what to do.
    await d.getByTestId("q-dates-no").click();
    await expect(d.getByTestId("q-no-hint")).toHaveText("Then press Not on this page.");
    await expect(d.getByTestId("browser-check-confirm")).toBeDisabled();
    await d.getByTestId("q-dates-yes").click();
    await expect(d.getByTestId("q-no-hint")).toHaveCount(0);
    await shot(page, "03-request-drawer-browser-check");
    await noDropWords(page);
    await d.getByTestId("browser-check-confirm").click();
    await expect.poll(() => calls.find((c) => c.path === "/browser-checks/job-bc/confirm")?.body).toEqual({
      url: "https://www.amayama.com/en/part/toyota/roomy-m900a",
      answers: { versionOk: null, versionCode: "M900A-AGBVE", partFound: true, value: "M-42", valueAgain: "M-42", datesOk: true, sideOk: null },
      rowName: "Battery size",
      buildText: "2016 – 2020",
      knownCode: null,
    });
    await page.getByTestId("parts-row").filter({ hasText: "Battery size" }).click();
    await page.getByTestId("not-on-page").click();
    await expect.poll(() => calls.some((c) => c.path === "/browser-checks/job-bc/not-on-page")).toBe(true);
  });

  test("RE-68 — part check with a remembered version: Yes, Yes, tap Roam's number, Yes → Confirm", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openParts(page);
    await page.getByTestId("parts-row").filter({ hasText: "Spark plugs" }).getByTestId("row-open-browser-check").click();
    const d = page.getByTestId("research-drawer");
    await expect(d.getByTestId("browser-check-instruction")).toContainText("Check it's this one:");
    await expect(d.getByTestId("guide-version-row")).toContainText("Model: M900A-AGBVE");
    await expect(d.getByTestId("guide-find-part")).toContainText("Search spark plug. Do you see PLUG, SPARK?");
    await d.getByTestId("q-version-yes").click();
    await d.getByTestId("q-part-yes").click();
    await d.getByTestId("q-suggestion").filter({ hasText: "00000-T0009" }).click();
    await expect(d.getByTestId("browser-check-confirm")).toBeDisabled();
    await d.getByTestId("q-dates-yes").click();
    await d.getByTestId("browser-check-confirm").click();
    await expect.poll(() => calls.find((c) => c.path === "/browser-checks/job-bcp/confirm")?.body).toEqual({
      url: "https://www.amayama.com/en/part/toyota/roomy-m900a-plugs",
      answers: { versionOk: true, versionCode: null, partFound: true, value: "00000-T0009", valueAgain: null, datesOk: true, sideOk: null },
      rowName: "PLUG, SPARK",
      buildText: "2016 – 2020",
      knownCode: "M900A-AGBVE",
    });
  });

  test("Screen 18 — browser check on a phone is a full-screen sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, []);
    await openParts(page);
    await page.getByTestId("parts-card").filter({ hasText: "Battery size" }).click();
    const d = page.getByTestId("research-drawer");
    await expect(d.getByTestId("open-catalogue-page")).toBeVisible();
    await expect(d.getByTestId("q-part-yes")).toBeVisible();
    const box = await d.locator("aside").boundingBox();
    expect(box?.width).toBeGreaterThan(380);
    await shot(page, "18-phone-browser-check");
  });

  test("Screen 4 — two makers disagree: saved text, Use this one, Neither is right", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openParts(page);
    await page.getByTestId("parts-row").filter({ hasText: "Rear brake shoes" }).getByRole("button", { name: "Choose" }).click();
    const d = page.getByTestId("research-drawer");
    await expect(d.getByTestId("drawer-state-pill")).toHaveText("Two makers disagree");
    await expect(d.getByTestId("maker-card")).toHaveCount(2);
    await expect(d).not.toContainText("Maker A");
    await d.getByTestId("maker-card").first().getByRole("button", { name: "See the saved page text" }).click();
    await expect(d.getByTestId("saved-page-text")).toContainText("M900A rear shoe 00000-A0001");
    await shot(page, "04-request-drawer-two-makers-disagree");
    await d.getByTestId("use-this-one").first().click();
    await expect.poll(() => calls.find((c) => c.path === "/conflicts/cf-1/resolve")?.body).toEqual({ resolution: "picked", proposalId: "p-a" });
    await page.getByTestId("parts-row").filter({ hasText: "Rear brake shoes" }).click();
    await page.getByTestId("neither-is-right").click();
    await expect.poll(() => calls.filter((c) => c.path === "/conflicts/cf-1/resolve").at(-1)?.body).toEqual({ resolution: "both_wrong" });
  });

  test("Screen 5 — all caught up: fill-plan strip and See what's waiting", async ({ page }) => {
    await install(page, [], { caughtUp: true });
    await openParts(page);
    await expect(page.getByTestId("all-caught-up")).toContainText("You're all caught up");
    await expect(page.getByTestId("fill-strip")).toContainText("Cars being filled first: 200");
    await expect(page.getByTestId("fill-strip")).toContainText("fully ready 38");
    await shot(page, "05-all-caught-up");
    await page.getByTestId("see-whats-waiting").click();
    await expect(page.getByTestId("parts-row")).toHaveCount(1);
  });

  test("Screen 17 — paused card with Resume", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls, { paused: true });
    await openParts(page);
    await expect(page.getByTestId("research-paused")).toContainText("Research is paused");
    await expect(page.getByTestId("research-paused")).toContainText("Google's daily search limit reached — paused until 00:05 UTC");
    await shot(page, "17-states-paused");
    await page.getByTestId("research-paused").getByRole("button", { name: "Resume" }).click();
    await expect.poll(() => calls.find((c) => c.path === "/settings")?.body).toEqual({ paused: false });
  });

  test("Screens 6 + 7 — vehicles list, proposal drawer, Approve, Reject with a reason", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await page.goto("/?page=pending-motor-vehicles&tab=vehicles");
    await expect(page.getByTestId("vehicles-row")).toHaveCount(3, { timeout: 60_000 });
    await expect(page.getByTestId("vehicles-row").first()).toContainText("New version");
    await shot(page, "06-pending-vehicles-list");
    await page.getByTestId("vehicles-row").first().click();
    const d = page.getByTestId("vehicle-proposal-drawer");
    await expect(d.getByTestId("duplicate-check")).toContainText("Duplicate check passed");
    await expect(d.getByTestId("fact-grid")).toContainText("1KR-VET");
    await expect(d.getByTestId("fact-grid")).not.toContainText("Body style");
    await expect(d.getByTestId("fact-grid")).not.toContainText("Power");
    await shot(page, "07-vehicle-proposal-drawer");
    await noDropWords(page);
    await d.getByTestId("reject-vehicle").click();
    await page.getByTestId("reject-dialog").locator("textarea").fill("Wrong engine");
    await page.getByTestId("reject-dialog").getByRole("button", { name: "Reject" }).click();
    await expect.poll(() => calls.find((c) => c.path === "/vehicle-proposals/vp-1/reject")?.body).toEqual({ reason: "Wrong engine" });
    await page.getByTestId("vehicles-row").first().click();
    await page.getByTestId("approve-vehicle").click();
    await expect.poll(() => calls.some((c) => c.path === "/vehicle-proposals/vp-1/approve")).toBe(true);
    await expect(page.getByTestId("research-toast")).toContainText("Added Toyota Roomy 2020 on · 2WD to Vehicles");
  });

  test("Screen 8 — Research this model review: Approve all new, per-row Approve / Reject", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await page.goto("/?page=pending-motor-vehicles&tab=vehicles");
    await page.getByTestId("vehicles-row").filter({ hasText: "every version" }).click();
    const m = page.getByTestId("model-review");
    await expect(m).toContainText("Roam found 5 versions");
    await expect(m.getByTestId("model-summary")).toContainText("2 Unchanged");
    await expect(m.getByTestId("model-summary")).toContainText("1 Update");
    await expect(m.getByTestId("model-summary")).toContainText("2 New");
    await expect(m.getByTestId("model-row-changes")).toContainText("Frame range added");
    await expect(m).toContainText("Nothing is overwritten until confirmed.");
    await shot(page, "08-research-this-model");
    await noDropWords(page);
    await m.getByTestId("approve-all-new").click();
    await expect.poll(() => calls.filter((c) => /\/vehicle-proposals\/m-[45]\/approve/.test(c.path)).length).toBe(2);
    await m.getByTestId("model-row-reject").first().click();
    await page.getByTestId("reject-dialog").getByRole("button", { name: "Keep it" }).click();
    await m.getByTestId("model-row-approve").first().click();
    await expect.poll(() => calls.some((c) => c.path === "/vehicle-proposals/m-3/approve")).toBe(true);
    await m.getByTestId("back-to-vehicles").click();
    await expect(page.getByTestId("research-vehicles-tab")).toBeVisible();
  });

  test("Screen 9 — settings and health: Pause, practice mode, turn off asks first, Retry, Manage trusted sites", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await page.goto("/?page=pending-motor-vehicles&tab=settings");
    const s = page.getByTestId("research-settings");
    await expect(s.getByTestId("streak")).toHaveText("6 of 20");
    await expect(s.getByTestId("cost-per-job")).toHaveText("US$0.075 / job");
    await expect(s.getByTestId("spend-today")).toContainText("US$0.31");
    await expect(s.getByTestId("fill-goal")).toContainText("18 Feb 2027");
    await expect(s.getByText("On track")).toBeVisible();
    await expect(s.getByTestId("expected-finish")).toContainText("30 Jan 2027");
    await expect(s.getByTestId("identity-first")).toContainText("763");
    await expect(s.getByTestId("queue-pending")).toContainText("Queue · 21 items pending");
    await expect(s.getByTestId("trusted-link-card")).toContainText("4 sites");
    await shot(page, "09-research-settings-health");
    await noDropWords(page);
    await s.getByTestId("engine-pause").click();
    await expect.poll(() => calls.find((c) => c.path === "/settings")?.body).toEqual({ paused: true });
    await s.getByTestId("practice-toggle").click();
    await expect.poll(() => calls.some((c) => JSON.stringify(c.body) === JSON.stringify({ shadow_mode: false }))).toBe(true);
    await s.getByTestId("engine-toggle").click();
    await expect(page.getByTestId("engine-off-dialog")).toBeVisible();
    await page.getByTestId("engine-off-dialog").getByRole("button", { name: "Keep it on" }).click();
    await s.getByTestId("incident-retry").click();
    await expect.poll(() => calls.some((c) => c.path === "/jobs/job-inc/retry")).toBe(true);
    await s.getByTestId("manage-trusted-sites").click();
    await expect(page.getByTestId("trusted-sites")).toBeVisible({ timeout: 60_000 });
  });

  test("Screens 10 + 11 + 12 — trusted sources, add a site, recipes with Test on a car", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await page.goto("/?page=parts-catalog&tab=trusted-sources");
    const t = page.getByTestId("trusted-sites");
    await expect(t.getByTestId("site-group-part_maker").getByTestId("site-row")).toHaveCount(2, { timeout: 60_000 });
    await expect(t.getByTestId("site-group-car_maker")).toContainText("Browser check only");
    await expect(t.getByTestId("trust-rule-card")).toContainText("Reference sites can suggest but never confirm.");
    await expect(t.getByTestId("site-group-reference")).not.toContainText("Pages confirmed");
    await shot(page, "10-trusted-sources");
    await noDropWords(page);
    await t.getByTestId("site-reads").first().click();
    await expect(t.getByTestId("site-read-log")).toContainText("Row found");

    await t.getByTestId("add-site").click();
    const a = page.getByTestId("add-site-dialog");
    await a.getByTestId("site-address").fill("http://example-parts.jp");
    await expect(a.getByTestId("needs-https")).toBeVisible();
    await a.getByTestId("site-address").fill("example-parts.jp");
    await expect(a.getByTestId("add-site-save")).toBeDisabled();
    await a.getByRole("button", { name: "NiBK" }).click();
    await a.getByTestId("add-another-maker").fill("Aisin");
    await a.getByRole("button", { name: "Add", exact: true }).click();
    await expect(a).toContainText("You check its pages in your browser");
    await shot(page, "11-add-a-site");
    await a.getByTestId("add-site-save").click();
    await expect.poll(() => (calls.find((c) => c.path === "/trusted-sites")?.body as { domain?: string; makers?: string[] })?.makers).toEqual(["NiBK", "Aisin"]);

    await t.getByTestId("site-mark").first().click();
    await expect.poll(() => calls.some((c) => c.method === "PATCH" && c.path.startsWith("/trusted-sites/"))).toBe(true);
    await t.getByTestId("site-remove").first().click();
    await page.getByTestId("remove-site-dialog").getByRole("button", { name: "Keep it" }).click();

    await t.getByTestId("site-recipes").first().click();
    const r = page.getByTestId("recipes-drawer");
    await expect(r.getByTestId("recipe-card")).toHaveCount(2);
    await expect(r.getByTestId("recipe-worked").first()).toContainText("Worked 14 times · last on 20 Nov 2026");
    await expect(r.getByTestId("recipe-worked").nth(1)).toContainText("Not run yet");
    await expect(r).toContainText("Changes take effect on the next run.");
    await r.getByTestId("recipe-test").first().click();
    // Make → Model → Year in plain words; the only version that year is picked for the person (no codes to type).
    await expect(r.getByTestId("recipe-test-model")).toBeDisabled();
    await r.getByTestId("recipe-test-make").click();
    await page.getByRole("option", { name: "Toyota" }).click();
    await r.getByTestId("recipe-test-model").click();
    await page.getByRole("option", { name: "Roomy" }).click();
    await r.getByTestId("recipe-test-year").click();
    await page.getByRole("option", { name: "2018" }).click();
    await expect(r.getByTestId("recipe-test-only-version")).toBeVisible();
    await expect(r.getByTestId("recipe-test-panel")).not.toContainText("M900A");
    await r.getByTestId("recipe-test-run").click();
    await expect(r.getByTestId("saved-page-text")).toContainText("M900A front pad");

    // Part-number recipe: the number is picked from the parts on file for that car (or typed).
    await r.getByTestId("recipe-test").nth(1).click();
    await expect(r.getByTestId("recipe-test-number")).toBeDisabled();
    await r.getByTestId("recipe-test-make").click();
    await page.getByRole("option", { name: "Toyota" }).click();
    await r.getByTestId("recipe-test-model").click();
    await page.getByRole("option", { name: "Roomy" }).click();
    await r.getByTestId("recipe-test-year").click();
    await page.getByRole("option", { name: "2018" }).click();
    await r.getByTestId("recipe-test-number").click();
    await page.getByRole("option", { name: /Brake pads/ }).click();
    await r.getByTestId("recipe-test-run").click();
    await expect
      .poll(() => calls.find((c) => c.method === "POST" && c.path === "/recipes/rc-2/test")?.body)
      .toEqual({ vehicleCatalogId: CAR, number: "00000-T0001" });
    await shot(page, "12-site-recipes");
    await noDropWords(page);
    await r.getByRole("button", { name: "Turn off" }).first().click();
    await expect.poll(() => calls.find((c) => c.path === "/recipes/rc-1")?.body).toEqual({ active: false });
    await r.getByTestId("add-recipe").click();
    await expect(r.getByTestId("recipe-form")).toBeVisible();

    // Rev 4.2 (RE-30): a form recipe needs its form fields before it can be saved.
    const f = r.getByTestId("recipe-form");
    await f.getByLabel("Name").fill("Search by part number");
    await f.getByLabel("How it looks things up").selectOption("form_then_page");
    await f.getByLabel("Lookup address").fill("https://www.example-parts.test/catalogue/cars");
    await expect(f.getByTestId("recipe-save")).toBeDisabled();
    await f.getByTestId("recipe-form-fields").fill("txtPartNo={number}&txtClass=1");
    await f.getByTestId("recipe-save").click();
    await expect
      .poll(() => calls.find((c) => c.method === "POST" && c.path.endsWith("/sbparts.jp/recipes"))?.body)
      .toEqual({
        name: "Search by part number",
        kind: "form_then_page",
        searchUrlTemplate: "https://www.example-parts.test/catalogue/cars",
        formBodyTemplate: "txtPartNo={number}&txtClass=1",
        resultLinkRule: "",
      });
  });

  test("Screen 13 — car coverage tab: every tile state and its one action", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await page.goto("/?page=motor-vehicles&vehiclesCapture=toyota_roomy_parts_on_file");
    await page.getByRole("tab", { name: "Coverage" }).click();
    const c = page.getByTestId("car-coverage");
    await expect(c.getByTestId("coverage-ring")).toContainText("4 of 10");
    const tile = (state: string) => c.locator(`[data-testid="coverage-tile"][data-state="${state}"]`);
    await expect(tile("confirmed")).toHaveCount(4);
    await expect(tile("not_applicable")).toHaveCount(1);
    await expect(tile("not_applicable").getByRole("button")).toHaveCount(0);
    await expect(tile("researching").getByRole("button")).toHaveCount(0);
    await expect(tile("couldnt_find").getByRole("button", { name: "Research again" })).toBeVisible();
    await expect(tile("disagree").getByRole("button", { name: "Choose" })).toBeVisible();
    await expect(tile("browser_check").getByRole("button", { name: "Open browser check" })).toBeVisible();
    await expect(tile("needs_checking").getByRole("button", { name: "Review" })).toBeVisible();
    await expect(c.getByTestId("coverage-summary").first()).toContainText("4 Confirmed");
    await shot(page, "13-car-coverage");
    await noDropWords(page);
    await c.locator('[data-testid="spec-tile"][data-state="not_started"]').getByRole("button", { name: "Research this spec" }).click();
    await expect.poll(() => calls.find((x) => x.path === "/fill/item")?.body).toEqual({ vehicleCatalogId: CAR, specKey: "engine_oil_grade" });
    await tile("couldnt_find").getByRole("button", { name: "Research again" }).click();
    await expect.poll(() => calls.some((x) => x.path === "/jobs/job-c9/retry")).toBe(true);
    await c.getByTestId("fill-this-car").click();
    await expect.poll(() => calls.some((x) => x.path === "/fill/car")).toBe(true);
    await c.getByTestId("fill-every-version").click();
    await expect.poll(() => calls.find((x) => x.path === "/fill/model")?.body).toEqual({ make: "Toyota", model: "Roomy" });
    await c.getByTestId("research-this-model").click();
    await expect.poll(() => calls.find((x) => x.path === "/model")?.body).toEqual({ make: "Toyota", model: "Roomy" });
    await tile("needs_checking").getByRole("button", { name: "Review" }).click();
    await expect(page.getByTestId("research-drawer")).toBeVisible();
  });

  test("Screen 14 — identity first: Find this car's identity, every tile waits", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls, { identityMissing: true });
    await page.goto("/?page=motor-vehicles&vehiclesCapture=toyota_roomy_parts_on_file");
    await page.getByRole("tab", { name: "Coverage" }).click();
    const c = page.getByTestId("car-coverage");
    await expect(c.getByTestId("identity-first")).toContainText("Roam needs this car's frame code before it can look up parts.");
    await expect(c.getByTestId("identity-first")).toContainText("Once the frame code is found, Roam looks up the parts and specs below.");
    await expect(c.locator('[data-testid="coverage-tile"][data-state="waiting_identity"]')).toHaveCount(10);
    await expect(c.getByTestId("coverage-ring")).toContainText("0 of 10");
    await shot(page, "14-identity-first");
    await c.getByTestId("find-identity").click();
    await expect.poll(() => calls.find((x) => x.path === "/identity")?.body).toEqual({ vehicleCatalogId: CAR });
  });

  test("Screen 15 — car specs with trust: source lines, Research this spec, brakes rows", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await page.goto("/?page=motor-vehicles&vehiclesCapture=toyota_roomy_car_specs");
    const s = page.getByTestId("car-specs-trust");
    await expect(s.getByTestId("spec-row").filter({ hasText: "Battery size" })).toContainText("Confirmed");
    await expect(s.getByTestId("spec-row").filter({ hasText: "Battery size" }).getByTestId("spec-source")).toHaveText("SB · Read on 20 Nov 2026");
    await expect(s.getByTestId("spec-row").filter({ hasText: "Tyre size" }).getByTestId("spec-source")).toHaveText("From the old import");
    await expect(s.getByTestId("spec-row").filter({ hasText: "Front brakes" })).toContainText("Needs checking");
    await expect(s.getByTestId("specs-header-chips")).toContainText("4 of 10 key parts ready");
    await shot(page, "15-car-specs-trust");
    await noDropWords(page);
    await s.getByTestId("spec-row").filter({ hasText: "Front brakes" }).getByTestId("research-this-spec").click();
    await expect.poll(() => calls.find((x) => x.path === "/fill/item")?.body).toEqual({ vehicleCatalogId: CAR, specKey: "front_brake_type" });
  });

  test("Screen 16 — Overview shows the two banners only", async ({ page }) => {
    await install(page, []);
    await page.goto("/?page=dashboard");
    await expect(page.getByTestId("notice-engine_paused")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("notice-site_blocked")).toContainText("Open trusted sources");
    await shot(page, "16-overview-banners");
    await noDropWords(page);
  });
});
