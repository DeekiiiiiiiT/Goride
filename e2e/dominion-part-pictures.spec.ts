/**
 * Part pictures — Dominion screens S1–S3 (docs/part-pictures-audit.md §4 / §4b, done-test 19). Every route is answered
 * with made-up data (invented numbers, a generated picture); every new button is pressed, and no §4b "Drop" text may
 * appear. Set PP_SHOTS=<folder> to save each screen for the Stitch check, and PP_PHOTO=<file> to show a real photo.
 * Run: node node_modules/@playwright/test/cli.js test -c playwright.dominion.config.ts e2e/dominion-part-pictures.spec.ts
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CAR = "ap900005-0000-4000-8000-000000000002";

// §4b Drop lists: text Stitch invented that must never reach the real screens.
const BANNED = [
  "Confirm & Proceed", "Ready for Dispatch", "Direct view", "OEM Matched", "Synthesized", "MEDIA PREVIEW", "High Fidelity",
  "SYNC ENGINE", "Rendering Engine", "SYNTH-IMG", "MESH", "Mesh", "Neural", "Pipeline", "match results", "items rendered",
  "RENDER PARAMETERS", "Deactivated", "Awaiting Source Data", "Operations Dispatch", "Queue Inactive",
];

// A plain 64×64 grey PNG unless a real photo is given for the Stitch check.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAL0lEQVR42u3NMQEAAAwCoNm/9Ex/IgQt0ul0Op1Op9PpdDqdTqfT6XQ6nU6n0+l0OtUBcAcBAxP6H9EAAAAASUVORK5CYII=",
  "base64",
);
const PHOTO = process.env.PP_PHOTO?.trim() ? readFileSync(process.env.PP_PHOTO.trim()) : PNG;
const MEDIA = "https://media.roamfleet.co/catalogue/parts";

type Calls = Array<{ method: string; path: string; body: string }>;

const pic = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: "made",
  waitingReason: null,
  url: { src: `${MEDIA}/${id}/v1.jpg`, srcSet: "" },
  urlDetail: { src: `${MEDIA}/${id}/v1.jpg`, srcSet: "" },
  partNumber: "00000-F1001",
  partName: "Air filter",
  manufacturer: "Testmake",
  catalogGroup: { id: "g-filters", name: "Filters" },
  madeAt: "2026-11-26T10:00:00Z",
  version: 1,
  templateVersion: 1,
  hasDiagram: true,
  ...over,
});

const SHOCK = { id: "g-susp", name: "Suspension & steering" };
const LIST_ITEMS = [
  pic("p1"),
  pic("p2", { partNumber: "00000-S1001", partName: "Front shock absorber", catalogGroup: SHOCK }),
  pic("p3", { partNumber: "00000-S1002", partName: "Front shock absorber", catalogGroup: SHOCK, status: "being_made", url: null, urlDetail: null, madeAt: null }),
  pic("p4", { partNumber: "00000-S2001", partName: "Front shock absorber", catalogGroup: SHOCK, status: "waiting", waitingReason: "budget", url: null, urlDetail: null, madeAt: null }),
  pic("p5", { partNumber: "00000-S2002", partName: "Front shock absorber", catalogGroup: SHOCK, status: "hidden" }),
  pic("p6", { partNumber: "00000-P1001", partName: "Front brake pads", catalogGroup: { id: "g-brakes", name: "Brakes" } }),
  pic("p7", { partNumber: "00000-L1001", partName: "Front stabilizer link", catalogGroup: SHOCK }),
  pic("p8", { partNumber: "00000-E1001", partName: "Spark plug", catalogGroup: { id: "g-engine", name: "Engine" }, status: "failed", url: null, urlDetail: null, madeAt: null }),
];

const list = (over: Record<string, unknown> = {}) => ({
  items: LIST_ITEMS,
  total: 46,
  page: 1,
  pageSize: 24,
  hasOlder: true,
  hasNewer: false,
  nextAfter: "after-1",
  nextBefore: "before-1",
  counts: { ready: 41, beingMade: 2, waiting: 1, failed: 1, hidden: 1 },
  madeToday: { count: 3, dailyMax: 50 },
  partPictureSpendUsd: 0.16,
  pictureSpend: { usedUsd: 0.31, budgetUsd: 80 },
  aiPicturesOn: true,
  pause: null,
  banners: [],
  ...over,
});

const TEMPLATES = [
  { catalogGroupId: "g-filters", name: "Filters", materials: "Molded black polypropylene housings, pleated white/off-white filter media with orange/amber rubber gasket trim, stamped steel clips.", enabled: true, version: 2, updatedBy: "u1", updatedByName: "Deeki T", updatedAt: "2026-11-26T10:00:00Z" },
  { catalogGroupId: "g-brakes", name: "Brakes", materials: "Machined cast-iron rotors with a cross-hatched friction surface.", enabled: true, version: 1, updatedBy: null, updatedByName: null, updatedAt: "2026-11-26T08:00:00Z" },
  { catalogGroupId: "g-fluids", name: "Fluids", materials: "", enabled: false, version: 1, updatedBy: null, updatedByName: null, updatedAt: "2026-11-26T08:00:00Z" },
];

const ROWS = [
  { partType: "Air filter", place: null, number: "00000-F1001", dates: "11.2016 – 09.2020", group: "already", reason: null, jobId: "job-f" },
  { partType: "Hose", place: null, number: "00000-X0001", dates: null, group: "not_roam_type", reason: null, jobId: null },
  { partType: "Hose clip", place: null, number: "00000-X0002", dates: null, group: "not_roam_type", reason: null, jobId: null },
];
const savedPage = (fileName: string, picture: unknown) => ({
  id: "sp-1", vehicle_catalog_id: CAR, job_id: null, domain: "catalog.example", source_url: "https://catalog.example/epc/m900a/1",
  file_name: fileName, status: "done", stop_reason: null, created_at: "2026-11-26T10:00:00Z",
  result: {
    counts: { saved: 0, already: 1, held: 0, not_roam_type: 2 },
    rows: ROWS.map((r) => (r.group === "already" ? { ...r, picture } : r)),
    otherTypes: ["Hose", "Hose clip"],
    pictures: { queued: 1, alreadyHave: 0, noDiagram: fileName.endsWith(".html") ? 1 : 0, failed: false, rows: [{ number: "00000-F1001", status: fileName.endsWith(".html") ? "noDiagram" : "queued" }] },
  },
});

const coverage = () => ({
  vehicleCatalogId: CAR, make: "Toyota", model: "Roomy", chassisCode: "M900A", engineCode: "1KR-FE", partsReady: 4,
  parts: [{ componentId: "c6", opCode: "SUS-SHOCK", name: "Shock absorber", cell: "missing", partNumber: null, maker: null, sourceUrl: null, jobId: "job-s", jobState: "needs_review", conflictId: null }],
  specs: [], allSpecs: [],
});

const proposal = (n: string) => ({
  id: `prop-${n}`, job_id: "job-s", brand: "Testmake", part_number: n, part_name: "Shock absorber", position_key: "front",
  status: "promoted", trust_route: "owner_browser", match_kind: "oem", checks: {}, fits: {},
  sources: [{ url: "https://catalog.example/p", domain: "catalog.example", readId: "r1", block: "x" }],
});
const jobDetail = () => ({
  car: { id: CAR, make: "Toyota", model: "Roomy", production_start_year: 2016, production_end_year: 2020, chassis_code: "M900A", engine_code: "1KR-FE", drivetrain: "2WD", engine_words: "regular engine" },
  partType: { id: "c6", name: "Shock absorber", position_scheme: "four_corners" },
  spec: null, browserCheckUrl: null, knownVersion: null,
  reads: [{ id: "r1", read_at: "2026-11-26T10:00:00Z" }],
  proposals: ["00000-S1001", "00000-S1002", "00000-S2001", "00000-S2002"].map(proposal),
  vehicleProposals: [], specProposals: [], conflicts: [], events: [],
  job: { id: "job-s", job_type: "part", state: "added", vehicle_catalog_id: CAR, maintenance_component_id: "c6", fit_descriptor: "front", spec_key: null, attempts: 1, last_error: null, updated_at: "2026-11-26T10:00:00Z" },
});

function token() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ aal: "aal2", sub: "11111111-1111-4111-8111-111111111111", role: "authenticated", exp: 4_000_000_000, app_metadata: { role: "platform_owner" } })}.sig`;
}

async function install(page: Page, calls: Calls, opts: { savedFile?: string; listOver?: Record<string, unknown>; listFails?: boolean } = {}) {
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: { role: "platform_owner" }, user_metadata: {} };
  const session = { access_token: token(), refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await page.addInitScript((s) => localStorage.setItem("sb-example-auth-token", JSON.stringify(s)), session);
  await page.route("**/auth/v1/**", (route) =>
    route.request().url().includes("/mfa/") ? route.fulfill({ json: { currentLevel: "aal2", nextLevel: "aal2" } }) : route.fulfill({ json: session }),
  );
  await page.route(`${MEDIA}/**`, (route) => route.fulfill({ body: PHOTO, contentType: process.env.PP_PHOTO ? "image/jpeg" : "image/png" }));
  const shockPictures = {
    "00000-S1001": pic("p2", { partNumber: "00000-S1001", partName: "Shock absorber", catalogGroup: SHOCK }),
    "00000-S1002": pic("p3", { partNumber: "00000-S1002", partName: "Shock absorber", catalogGroup: SHOCK, status: "being_made", url: null, urlDetail: null, madeAt: null }),
    "00000-S2001": pic("p4", { partNumber: "00000-S2001", partName: "Shock absorber", catalogGroup: SHOCK, status: "waiting", waitingReason: "budget", url: null, urlDetail: null, madeAt: null }),
    "00000-S2002": pic("p5", { partNumber: "00000-S2002", partName: "Shock absorber", catalogGroup: SHOCK, status: "hidden" }),
  } as Record<string, unknown>;
  const handler = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const at = (p: string) => (path.includes(p) ? path.slice(path.indexOf(p) + p.length) : null);
    const pp = at("/admin/part-pictures");
    const pt = at("/admin/part-picture-templates");
    const cr = at("/admin/catalog-research");
    if (pp !== null || pt !== null) calls.push({ method, path: `${pp !== null ? "pictures" : "templates"}${pp ?? pt}${url.search}`, body: req.postData() ?? "" });

    if (pp !== null) {
      if (method === "GET" && pp === "") {
        if (opts.listFails) return route.fulfill({ status: 500, json: { error: "down" } });
        return route.fulfill({ json: list({ hasNewer: url.searchParams.has("after"), ...opts.listOver }) });
      }
      if (method === "GET" && pp === "/by-numbers") {
        const numbers = (url.searchParams.get("numbers") ?? "").split(",");
        return route.fulfill({ json: { aiPicturesOn: true, items: numbers.map((n) => ({ number: n, picture: shockPictures[n] ?? null })) } });
      }
      if (method === "PUT" && pp === "/settings") return route.fulfill({ json: { ok: true } });
      const m = /^\/([^/]+)\/(remake|hide|show)$/.exec(pp);
      if (m) {
        const base = LIST_ITEMS.find((p) => p.id === m[1]) ?? pic(m[1]);
        const status = m[2] === "remake" ? "being_made" : m[2] === "hide" ? "hidden" : "made";
        return route.fulfill({ json: { ok: true, picture: { ...base, status } } });
      }
    }
    if (pt !== null) {
      if (method === "GET" && pt === "") return route.fulfill({ json: { items: TEMPLATES } });
      if (method === "GET" && pt.endsWith("/remake-older")) {
        return route.fulfill({ json: pt.startsWith("/g-filters") ? { count: 3, needUpload: 1, costUsd: 0.12, days: 1 } : { count: 0, needUpload: 0, costUsd: 0, days: 0 } });
      }
      if (method === "POST" && pt.endsWith("/remake-older")) return route.fulfill({ json: { ok: true, queued: 3, needUpload: 1 } });
      if (method === "PUT") return route.fulfill({ json: { ok: true, template: { ...TEMPLATES[0], version: 3 } } });
    }
    if (cr !== null) {
      if (method === "GET" && cr.startsWith("/saved-pages/")) {
        const file = opts.savedFile ?? "Air cleaner.mhtml";
        const picture = file.endsWith(".html") ? null : pic("p1", { status: "being_made", url: null, urlDetail: null, madeAt: null });
        return route.fulfill({ json: { savedPage: savedPage(file, picture), picturesAiOn: true } });
      }
      if (method === "GET" && cr === "/saved-pages") {
        return route.fulfill({ json: { items: [{ id: "sp-1", createdAt: "2026-11-26T10:00:00Z", domain: "catalog.example", status: "done", counts: { saved: 0, already: 1, held: 0, not_roam_type: 2 } }] } });
      }
      if (cr.startsWith("/coverage/")) return route.fulfill({ json: coverage() });
      if (cr.startsWith("/jobs/")) return route.fulfill({ json: jobDetail() });
      if (cr === "/browser-checks/summary") return route.fulfill({ json: { open: 0, waiting: 0, max: 25 } });
    }
    if (path.includes("platform-status")) return route.fulfill({ json: { maintenanceMode: false, maintenanceMessage: "", platformName: "Dominion" } });
    if (path.includes("settings/preferences")) return route.fulfill({ json: { darkMode: false } });
    if (method !== "GET") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: {} });
  };
  await page.route("**/functions/v1/**", handler);
  await page.route("**/__sb/functions/v1/**", handler);
}

const SHOTS = process.env.PP_SHOTS?.trim();
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}
async function noDropWords(page: Page) {
  const text = await page.locator("body").innerText();
  for (const w of BANNED) expect(text, `"${w}" must not appear`).not.toContain(w);
}

async function openCoverage(page: Page) {
  await page.goto("/?page=motor-vehicles&vehiclesCapture=toyota_roomy_parts_on_file");
  await page.getByRole("tab", { name: "Coverage" }).click();
  await expect(page.getByTestId("car-coverage")).toBeVisible({ timeout: 60_000 });
}

test.describe("Part pictures (S1–S3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test("S1 — single-file result: Making, the pictures line, Nothing new to save, See pictures opens S3 for this upload", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openCoverage(page);
    await page.getByTestId("saved-pages-read").getByTestId("saved-page-list-row").first().click();
    const o = page.getByTestId("saved-page-overlay");
    await expect(o.getByTestId("saved-page-result-title")).toHaveText("Nothing new to save");
    await expect(o.getByTestId("saved-page-picture-state")).toContainText("Making");
    await expect(o.getByTestId("saved-page-pictures-line")).toContainText("Pictures: 1 being made");
    await expect(o.getByTestId("saved-page-needs-drawing")).toHaveCount(0);
    await shot(page, "02-result-already-making");
    await noDropWords(page);
    await o.getByTestId("saved-page-see-pictures").click();
    await expect(page.getByTestId("part-pictures-page")).toBeVisible();
    await expect(page).toHaveURL(/page=part-pictures&savedPageId=sp-1/);
    expect(calls.some((c) => c.method === "GET" && c.path.startsWith("pictures?") && c.path.includes("savedPageId=sp-1"))).toBe(true);
    await page.getByTestId("part-pictures-upload-filter").click();
    await expect(page.getByTestId("part-pictures-upload-filter")).toHaveCount(0);
  });

  test("S1 — a normal .html save: the drawing notice and No diagram, no See pictures", async ({ page }) => {
    await install(page, [], { savedFile: "Air cleaner.html" });
    await openCoverage(page);
    await page.getByTestId("saved-pages-read").getByTestId("saved-page-list-row").first().click();
    const o = page.getByTestId("saved-page-overlay");
    await expect(o.getByTestId("saved-page-needs-drawing")).toContainText("Pictures need the drawing.");
    await expect(o.getByTestId("saved-page-picture-state")).toContainText("No diagram");
    await expect(o.getByTestId("saved-page-see-pictures")).toHaveCount(0);
    await shot(page, "04-result-html-no-drawing");
    await noDropWords(page);
  });

  test("S2 — job panel: four states, Remake asks with the cost, Hide and Show act, the large view closes", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openCoverage(page);
    await page.locator('[data-testid="coverage-tile"]').filter({ hasText: "Shock absorber" }).getByTestId(/^tile-action-/).click();
    const d = page.getByTestId("research-drawer");
    await expect(d.getByTestId("roam-found-card")).toHaveCount(4);
    const states = d.getByTestId("card-picture-state");
    await expect(states.nth(0)).toContainText("Made by AI from the maker's diagram");
    await expect(states.nth(1)).toContainText("Making the picture");
    await expect(states.nth(2)).toContainText("Today's budget is used up");
    await expect(states.nth(3)).toContainText("Hidden from Fleet");
    await shot(page, "06-job-panel-four-states");
    await noDropWords(page);
    const first = d.getByTestId("roam-found-card").nth(0);
    await first.getByRole("button", { name: /Remake/ }).click();
    const confirm = page.getByRole("dialog", { name: "Make this picture again?" });
    await expect(confirm).toContainText("US$0.04");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await first.getByRole("button", { name: /Remake/ }).click();
    await page.getByRole("dialog", { name: "Make this picture again?" }).getByRole("button", { name: /Remake/ }).click();
    await expect.poll(() => calls.some((c) => c.method === "POST" && c.path === "pictures/p2/remake")).toBe(true);
    await d.getByTestId("roam-found-card").nth(3).getByRole("button", { name: /Show in Fleet/ }).click();
    await expect.poll(() => calls.some((c) => c.method === "POST" && c.path === "pictures/p5/show")).toBe(true);
    await d.getByRole("button", { name: /Open the picture of 00000-S2002/ }).click();
    const view = page.getByRole("dialog", { name: /Picture of 00000-S2002/ });
    await expect(view).toContainText("Made by AI from the maker's diagram");
    await shot(page, "07-large-view");
    await view.getByRole("button", { name: "Close" }).click();
    await expect(view).toHaveCount(0);
  });

  test("S3 — Pictures tab: tiles, filters, cards, Hide, Older/Newer, the switch", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await page.goto("/?page=part-pictures");
    const p = page.getByTestId("part-pictures-page");
    await expect(p.getByTestId("part-picture-card")).toHaveCount(8, { timeout: 60_000 });
    await expect(p.getByTestId("part-pictures-settings")).toContainText("3 of 50");
    await expect(p.getByTestId("part-pictures-settings")).toContainText("US$0.16");
    await shot(page, "08-pictures-tab");
    await noDropWords(page);
    await p.getByRole("button", { name: /Failed\s*1/ }).click();
    await expect.poll(() => calls.some((c) => c.path.includes("status=failed"))).toBe(true);
    await p.getByRole("combobox", { name: "Part group" }).selectOption("g-brakes");
    await expect.poll(() => calls.some((c) => c.path.includes("catalogGroupId=g-brakes"))).toBe(true);
    await p.getByRole("searchbox").fill("00000-S1001");
    await expect.poll(() => calls.some((c) => c.path.includes("search=00000-S1001"))).toBe(true);
    await p.getByRole("button", { name: /Older/ }).click();
    await expect.poll(() => calls.some((c) => c.path.includes("after=after-1"))).toBe(true);
    await p.getByRole("button", { name: /Newer/ }).click();
    await expect.poll(() => calls.some((c) => c.path.includes("before=before-1"))).toBe(true);
    await p.getByTestId("part-picture-card").filter({ hasText: "00000-F1001" }).getByRole("button", { name: /^Hide$/ }).click();
    await expect.poll(() => calls.some((c) => c.method === "POST" && c.path === "pictures/p1/hide")).toBe(true);
    await p.getByRole("switch", { name: "AI part pictures" }).click();
    await expect.poll(() => calls.some((c) => c.method === "PUT" && c.path === "pictures/settings" && c.body.includes("false"))).toBe(true);
  });

  test("S3 — Templates tab: Save, and the bulk remake shows count, cost and days, Cancel, then Remake", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await page.goto("/?page=part-pictures");
    await page.getByRole("tab", { name: /Templates/ }).click();
    const cards = page.getByTestId("part-picture-template");
    await expect(cards).toHaveCount(3, { timeout: 60_000 });
    await expect(cards.nth(0)).toContainText("3 pictures · about US$0.12 · about 1 day at 50 a day");
    await expect(cards.nth(2)).toContainText("Off — Fluids parts get no picture.");
    await shot(page, "09-templates-tab");
    await noDropWords(page);
    await cards.nth(1).getByRole("textbox").fill("Machined cast-iron rotors, steel backing plates.");
    await cards.nth(1).getByRole("button", { name: /Save/ }).click();
    await expect.poll(() => calls.some((c) => c.method === "PUT" && c.path === "templates/g-brakes")).toBe(true);
    await cards.nth(0).getByRole("button", { name: /Remake pictures made with an older version/ }).click();
    const dialog = page.getByRole("dialog", { name: /Remake 3 Filters pictures/ });
    await expect(dialog).toContainText("About US$0.12");
    await expect(dialog).toContainText("1 more picture needs its page uploaded again");
    await shot(page, "10-remake-older-dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("remake-older"))).toBe(false);
    await cards.nth(0).getByRole("button", { name: /Remake pictures made with an older version/ }).click();
    await page.getByRole("dialog", { name: /Remake 3 Filters pictures/ }).getByRole("button", { name: /Remake 3 pictures/ }).click();
    await expect.poll(() => calls.some((c) => c.method === "POST" && c.path === "templates/g-filters/remake-older")).toBe(true);
  });

  test("S3 — banner, empty and couldn't-load states with Try again", async ({ page }) => {
    await install(page, [], { listOver: { banners: [{ kind: "ai_off" }], aiPicturesOn: false } });
    await page.goto("/?page=part-pictures");
    await expect(page.getByTestId("part-pictures-banners")).toContainText("AI part pictures are off.", { timeout: 60_000 });
    await shot(page, "11-pictures-off-banner");

    const empty = await page.context().newPage();
    await empty.setViewportSize({ width: 1440, height: 1000 });
    await install(empty, [], { listOver: { items: [], total: 0, counts: { ready: 0, beingMade: 0, waiting: 0, failed: 0, hidden: 0 } } });
    await empty.goto("/?page=part-pictures");
    await expect(empty.getByTestId("part-pictures-empty")).toContainText("No part pictures yet", { timeout: 60_000 });
    await shot(empty, "14-no-pictures-yet");

    const down = await page.context().newPage();
    await down.setViewportSize({ width: 1440, height: 1000 });
    await install(down, [], { listFails: true });
    await down.goto("/?page=part-pictures");
    const err = down.getByTestId("part-pictures-error");
    await expect(err).toContainText("Couldn't load the pictures", { timeout: 60_000 });
    await shot(down, "13-couldnt-load");
    await err.getByRole("button", { name: /Try again/ }).click();
    await expect(err).toBeVisible();
  });
});
