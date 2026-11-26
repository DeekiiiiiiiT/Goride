/**
 * Saved catalogue pages → parts — Dominion screens S1–S6 (docs/saved-page-parts-audit.md §6 / §6b, done-test 18).
 * Every saved-page route is answered with made-up fixture data (invented numbers, no real site page); every button in
 * S1–S6 is pressed, and no §6b "Drop" word may appear. Set RE_SHOTS=<folder> to save each screen for the Stitch check.
 * Run: node node_modules/@playwright/test/cli.js test -c playwright.dominion.config.ts e2e/dominion-saved-page-parts.spec.ts
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const CAR = "ap900005-0000-4000-8000-000000000002";
const JOB = "job-c6";
const roomy = {
  id: CAR, make: "Toyota", model: "Roomy", production_start_year: 2016, production_end_year: 2020,
  chassis_code: "M900A", engine_code: "1KR-FE", drivetrain: "2WD", transmission: "CVT",
};

// §6b: invented technical labels Stitch drew; none may reach the real screens.
const BANNED = [
  "Telemetry", "telemetry", "Ingest", "ingest", "Schema", "STATE 0", "DOM-SRC", "PARSER", "CHASSIS GROUP", "MATCHED OEM",
  "Ready to publish", "Safety Gate", "SHA-256", "Finalizing", "Phase 3", "quota", "Tier-1",
];

type Calls = Array<{ method: string; path: string; body: string }>;
type Mode = {
  list?: "rows" | "empty" | "slow";
  upload?: "saved" | "held" | "read_before" | "wrong_car" | "part_maker_page" | "slow";
};

const SAVED_ROWS = [
  { partType: "Shock absorber", place: "front right", number: "00000-S1001", dates: "11.2016 – 11.2018", group: "saved", reason: null, jobId: "job-s" },
  { partType: "Shock absorber", place: "front right", number: "00000-S1002", dates: "11.2018 – 09.2020", group: "saved", reason: null, jobId: "job-s" },
  { partType: "Shock absorber", place: "front left", number: "00000-S2001", dates: "11.2016 – 11.2018", group: "saved", reason: null, jobId: "job-s" },
  { partType: "Shock absorber", place: "front left", number: "00000-S2002", dates: "11.2018 – 09.2020", group: "saved", reason: null, jobId: "job-s" },
  { partType: "Front Stabilizer Link", place: null, number: "00000-L1001", dates: "11.2016 – 09.2020", group: "saved", reason: null, jobId: "job-l" },
  { partType: "Front Stabilizer Link", place: null, number: "00000-L1002", dates: "11.2016 – 09.2020", group: "saved", reason: null, jobId: "job-l" },
  { partType: "Front Stabilizer Bar", place: null, number: "00000-B1001", dates: "11.2016 – 09.2020", group: "saved", reason: null, jobId: "job-b" },
  { partType: "Coil spring", place: null, number: "00000-X0001", dates: null, group: "not_roam_type", reason: null, jobId: null },
  { partType: "Bump stopper", place: null, number: "00000-X0002", dates: null, group: "not_roam_type", reason: null, jobId: null },
];
const HELD_ROWS = [
  { partType: "Rear Stabilizer Link", place: null, number: "00000-L3001", dates: "11.2016 – 09.2020", group: "saved", reason: null, jobId: "job-rl" },
  { partType: "Shock absorber", place: "front right", number: "00000-S1001", dates: "11.2016 – 11.2018", group: "already", reason: null, jobId: "job-s" },
  { partType: "Shock absorber", place: "rear right", number: "00000-S3001", dates: "11.2016 – 11.2018", group: "held", reason: "Dates missing 12.2018 – 08.2020", jobId: "job-rs" },
  { partType: "Shock absorber", place: "rear left", number: "00000-S4001", dates: "11.2016 – 09.2020", group: "held", reason: "Waits with the other side, so both sides save together", jobId: "job-rs" },
  { partType: "Front Stabilizer Link", place: null, number: "00000-L1003", dates: "11.2016 – 09.2020", group: "held", reason: "The two reads don't agree", jobId: "job-l" },
  { partType: "Coil spring", place: null, number: "00000-X0001", dates: null, group: "not_roam_type", reason: null, jobId: null },
];
const count = (rows: Array<{ group: string }>) => ({
  saved: rows.filter((r) => r.group === "saved").length,
  already: rows.filter((r) => r.group === "already").length,
  held: rows.filter((r) => r.group === "held").length,
  not_roam_type: rows.filter((r) => r.group === "not_roam_type").length,
});
const page1 = (rows: typeof SAVED_ROWS | typeof HELD_ROWS, over: Record<string, unknown> = {}) => ({
  id: "sp-1", vehicle_catalog_id: CAR, job_id: null, domain: "catalog.example", source_url: "https://catalog.example/epc/m900a/1",
  file_name: "Front suspension.html", status: "done", stop_reason: null, created_at: "2026-11-25T10:00:00Z",
  result: { counts: count(rows), rows, otherTypes: ["Coil spring", "Bump stopper"] }, ...over,
});

function coverage() {
  const p = (componentId: string, name: string, jobState: string | null) => ({
    componentId, opCode: "SUS-SHOCK", name, cell: "missing", partNumber: null, maker: null, sourceUrl: null, jobId: jobState ? `job-${componentId}` : null, jobState, conflictId: null,
  });
  return {
    vehicleCatalogId: CAR, make: "Toyota", model: "Roomy", chassisCode: "M900A", engineCode: "1KR-FE", partsReady: 4,
    parts: [p("c6", "Shock absorber", "browser_check"), p("c7", "Cabin filter", null)],
    specs: [], allSpecs: [],
  };
}

function jobDetail(jobId: string) {
  return {
    car: { ...roomy, engine_words: "regular engine (not turbo)" },
    partType: { id: "c-10", name: "Shock absorber", position_scheme: "four_corners" },
    spec: null, browserCheckUrl: "https://catalog.example/epc/m900a/1",
    knownVersion: { domain: "catalog.example", code: "M900A-AAAAA", url: "https://catalog.example/epc/m900a/1" },
    reads: [], proposals: [], vehicleProposals: [], specProposals: [], conflicts: [], events: [],
    job: { id: jobId, job_type: "part", state: "browser_check", vehicle_catalog_id: CAR, maintenance_component_id: "c-10", fit_descriptor: "front", spec_key: null, attempts: 1, last_error: null, updated_at: "2026-11-20T10:00:00Z" },
  };
}

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
    const rel = path.includes(R) ? path.slice(path.indexOf(R) + R.length) : path;
    if (path.includes(R)) calls.push({ method, path: rel, body: req.postData() ?? "" });

    if (method === "POST" && rel === "/saved-pages") {
      const body = req.postData() ?? "";
      const again = /name="again"\r\n\r\ntrue/.test(body);
      if (mode.upload === "slow") await new Promise((r) => setTimeout(r, 4000));
      if (mode.upload === "read_before" && !again) return route.fulfill({ json: { savedPage: page1(SAVED_ROWS), alreadyRead: true, readAt: "2026-11-25T10:00:00Z" } });
      if (mode.upload === "wrong_car") {
        return route.fulfill({ json: { savedPage: page1([], { status: "stopped", stop_reason: "wrong_car" }), stop: { code: "wrong_car", detail: "Page shows M910A-BBBBB · This car M900A" }, versionShown: "M910A-BBBBB", carFrame: "M900A" } });
      }
      if (mode.upload === "part_maker_page") {
        return route.fulfill({ json: { savedPage: page1([], { status: "stopped", stop_reason: "part_maker_page" }), stop: { code: "part_maker_page", detail: "Use the browser check for this site." } } });
      }
      if (mode.upload === "held") return route.fulfill({ json: { savedPage: page1(HELD_ROWS) } });
      return route.fulfill({ json: { savedPage: page1(SAVED_ROWS) } });
    }
    if (method === "GET" && rel.startsWith("/saved-pages/")) return route.fulfill({ json: { savedPage: page1(HELD_ROWS, { id: rel.split("/").pop() }) } });
    if (method === "GET" && rel === "/saved-pages") {
      if (mode.list === "slow") await new Promise((r) => setTimeout(r, 4000));
      if (mode.list === "empty") return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: { items: [
        { id: "sp-1", createdAt: "2026-11-25T10:00:00Z", domain: "catalog.example", status: "done", counts: count(SAVED_ROWS) },
        { id: "sp-2", createdAt: "2026-11-24T10:00:00Z", domain: "catalog.example", status: "done", counts: count(HELD_ROWS) },
      ] } });
    }
    if (method !== "GET") return route.fulfill({ json: { ok: true, result: {} } });
    if (rel.startsWith("/coverage/")) return route.fulfill({ json: coverage() });
    if (rel.startsWith("/jobs/")) return route.fulfill({ json: jobDetail(rel.split("/jobs/")[1]) });
    if (rel === "/browser-checks/summary") return route.fulfill({ json: { open: 2, waiting: 0, max: 25 } });
    if (path.includes("platform-status")) return route.fulfill({ json: { maintenanceMode: false, maintenanceMessage: "", platformName: "Dominion" } });
    if (path.includes("settings/preferences")) return route.fulfill({ json: { darkMode: false } });
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

async function openCoverage(page: Page) {
  await page.goto("/?page=motor-vehicles&vehiclesCapture=toyota_roomy_parts_on_file");
  await page.getByRole("tab", { name: "Coverage" }).click();
  await expect(page.getByTestId("car-coverage")).toBeVisible({ timeout: 60_000 });
}

/** A made-up saved page: the browser's "saved from url" line, then a tiny page. */
function savedFile(withLink = true) {
  const head = withLink ? "<!DOCTYPE html>\n<!-- saved from url=(0036)https://catalog.example/epc/m900a/1 -->\n" : "<!DOCTYPE html>\n";
  return { name: "Front suspension.html", mimeType: "text/html", buffer: Buffer.from(`${head}<html><body><table><tr><td>00000-S1001</td></tr></table></body></html>`) };
}

async function chooseFile(page: Page, withLink = true) {
  await page.getByTestId("saved-page-file-input").setInputFiles(savedFile(withLink));
}

test.describe("Saved catalogue pages (S1–S6)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test("Screen 1 — Coverage: Add from a saved page, Saved pages read rows, a row opens that result", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openCoverage(page);
    const card = page.getByTestId("saved-pages-read");
    await expect(card).toContainText("Pages you saved and uploaded for this car. Nothing from the file is kept except the part facts.");
    await expect(card.getByTestId("saved-page-list-row")).toHaveCount(2);
    await expect(card.getByTestId("saved-page-list-row").first()).toContainText("25 Nov 2026 · catalog.example");
    await expect(card.getByTestId("saved-page-list-row").first()).toContainText("Saved 7");
    await expect(card.getByTestId("saved-page-list-row").first()).toContainText("Needs you 0");
    await expect(card.getByTestId("saved-page-list-row").first()).toContainText("Not a Roam part type 2");
    await expect(page.getByTestId("add-from-saved-page")).toBeVisible();
    await shot(page, "01-coverage-saved-pages");
    await noDropWords(page);
    await card.getByTestId("saved-page-list-row").nth(1).click();
    const o = page.getByTestId("saved-page-overlay");
    await expect(o.getByTestId("saved-page-result-title")).toHaveText("1 part saved · 3 need you");
    expect(calls.some((c) => c.method === "GET" && c.path === "/saved-pages/sp-2")).toBe(true);
    await o.getByTestId("saved-page-done").click();
    await expect(o).toHaveCount(0);
  });

  test("Screen 1 — Saved pages read: empty and loading states", async ({ page }) => {
    await install(page, [], { list: "slow" });
    await openCoverage(page);
    await expect(page.getByTestId("saved-pages-loading")).toBeVisible();
    await expect(page.getByTestId("saved-page-list-row").first()).toBeVisible({ timeout: 15_000 });
    const empty = await page.context().newPage();
    await empty.setViewportSize({ width: 1440, height: 1000 });
    await install(empty, [], { list: "empty" });
    await openCoverage(empty);
    await expect(empty.getByTestId("saved-pages-empty")).toHaveText("No saved pages yet. Use Add from a saved page.");
  });

  test("Screens 2 + 5 + 6 — choose a file, link found, Read page, reading, all saved, Done", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls, { upload: "slow" });
    await openCoverage(page);
    await page.getByTestId("add-from-saved-page").click();
    const o = page.getByTestId("saved-page-overlay");
    await expect(o.getByTestId("saved-page-howto")).toContainText("Open the page for this car on the catalogue website.");
    await expect(o.getByTestId("saved-page-howto")).toContainText("Save it as Webpage, Single File. That also brings the drawing, so Roam can make a picture of each part.");
    await expect(o.getByTestId("saved-page-dropzone")).toBeVisible();
    await expect(o.getByTestId("saved-page-read")).toBeDisabled();
    await shot(page, "02a-upload-empty");
    await chooseFile(page);
    await expect(o.getByTestId("saved-page-file")).toContainText("Front suspension.html");
    await expect(o.getByTestId("saved-page-url")).toHaveValue("https://catalog.example/epc/m900a/1");
    await expect(o.getByTestId("saved-page-url-found")).toContainText("Found in the file");
    await shot(page, "02-upload-file-chosen");
    await noDropWords(page);
    await o.getByTestId("saved-page-read").click();
    // S4: no buttons and no close while reading.
    await expect(o.getByTestId("saved-page-reading")).toBeVisible();
    await expect(o.getByRole("button")).toHaveCount(0);
    await expect(o.getByTestId("reading-step-1")).toHaveAttribute("data-state", "done", { timeout: 3000 });
    await shot(page, "05-reading");
    await noDropWords(page);
    await expect(o.getByTestId("saved-page-result-title")).toHaveText("7 parts saved", { timeout: 15_000 });
    const post = calls.find((c) => c.method === "POST" && c.path === "/saved-pages")!;
    expect(post.body).toContain(`name="vehicleCatalogId"\r\n\r\n${CAR}`);
    expect(post.body).toContain(`name="url"\r\n\r\nhttps://catalog.example/epc/m900a/1`);
    expect(post.body).toContain('filename="Front suspension.html"');
    await expect(o.getByTestId("count-saved")).toHaveText("Saved 7");
    await expect(o.getByTestId("count-held")).toHaveText("Needs you 0");
    await expect(o.getByTestId("group-saved").getByTestId("saved-page-row")).toHaveCount(7);
    await expect(o.getByTestId("group-saved").getByTestId("saved-page-row").first()).toContainText("Shock absorber · front right");
    await expect(o.getByTestId("group-saved").getByTestId("saved-page-row").first()).toContainText("00000-S1001 · 11.2016 – 11.2018");
    await o.getByTestId("saved-page-other-toggle").click();
    await expect(o.getByTestId("saved-page-other-list")).toContainText("Coil spring");
    await shot(page, "06-result-all-saved");
    await noDropWords(page);
    const listsBefore = calls.filter((c) => c.method === "GET" && c.path === "/saved-pages").length;
    await o.getByTestId("saved-page-done").click();
    await expect(o).toHaveCount(0);
    await expect.poll(() => calls.filter((c) => c.method === "GET" && c.path === "/saved-pages").length).toBeGreaterThan(listsBefore);
  });

  test("Screen 4 — a file with no link: the link is required; Cancel closes", async ({ page }) => {
    await install(page, []);
    await openCoverage(page);
    await page.getByTestId("add-from-saved-page").click();
    const o = page.getByTestId("saved-page-overlay");
    await chooseFile(page, false);
    await o.getByTestId("saved-page-url").click();
    await o.getByTestId("saved-page-url").blur();
    await expect(o.getByTestId("saved-page-url-error")).toContainText("Paste the page's link from the address bar.");
    await expect(o.getByTestId("saved-page-read")).toBeDisabled();
    await shot(page, "04-upload-link-required");
    await o.getByTestId("saved-page-url").fill("https://catalog.example/epc/m900a/1");
    await expect(o.getByTestId("saved-page-read")).toBeEnabled();
    await o.getByTestId("saved-page-choose-another").click();
    await o.getByTestId("saved-page-cancel").click();
    await expect(o).toHaveCount(0);
  });

  test("Screen 7 — some rows need you: reasons, Check this part opens that browser check", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls, { upload: "held" });
    await openCoverage(page);
    await page.getByTestId("add-from-saved-page").click();
    const o = page.getByTestId("saved-page-overlay");
    await chooseFile(page);
    await o.getByTestId("saved-page-read").click();
    await expect(o.getByTestId("saved-page-result-title")).toHaveText("1 part saved · 3 need you");
    await expect(o.getByTestId("count-already")).toHaveText("Already on file 1");
    await expect(o.getByTestId("count-held")).toHaveText("Needs you 3");
    const held = o.getByTestId("group-held");
    await expect(held.getByTestId("saved-page-reason")).toContainText([
      "Dates missing 12.2018 – 08.2020",
      "Waits with the other side, so both sides save together",
      "The two reads don't agree",
    ]);
    await expect(held).toContainText("Check this part opens the usual check with the numbers from the page already listed.");
    await expect(o.getByTestId("group-already")).toContainText("Already on file");
    await shot(page, "07-result-some-need-you");
    await noDropWords(page);
    await held.getByTestId("saved-page-check-part").first().click();
    await expect(o).toHaveCount(0);
    await expect(page.getByTestId("research-drawer")).toBeVisible();
    await expect.poll(() => calls.some((c) => c.method === "GET" && c.path === "/jobs/job-rs")).toBe(true);
  });

  test("Screen 8 — read before: See the result, Read again sends again=true, Cancel", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls, { upload: "read_before" });
    await openCoverage(page);
    await page.getByTestId("add-from-saved-page").click();
    const o = page.getByTestId("saved-page-overlay");
    await chooseFile(page);
    await o.getByTestId("saved-page-read").click();
    await expect(o).toContainText("You've read this page before");
    await expect(o.getByTestId("saved-page-earlier")).toContainText("Read on 25 Nov 2026 · catalog.example");
    await expect(o).toContainText("Reading it again checks every row once more.");
    await shot(page, "08-read-before");
    await noDropWords(page);
    await o.getByTestId("saved-page-see-result").click();
    await expect(o.getByTestId("saved-page-result-title")).toHaveText("7 parts saved");
    await o.getByTestId("saved-page-done").click();
    await page.getByTestId("add-from-saved-page").click();
    await chooseFile(page);
    await o.getByTestId("saved-page-read").click();
    await o.getByTestId("saved-page-read-again").click();
    await expect(o.getByTestId("saved-page-result-title")).toHaveText("7 parts saved");
    expect(calls.filter((c) => c.method === "POST" && c.path === "/saved-pages").pop()!.body).toContain('name="again"\r\n\r\ntrue');
    await o.getByTestId("saved-page-done").click();
    await page.getByTestId("add-from-saved-page").click();
    await chooseFile(page);
    await o.getByTestId("saved-page-read").click();
    await o.getByTestId("saved-page-cancel").click();
    await expect(o).toHaveCount(0);
  });

  test("Screen 9 — stop cards: wrong car shows the server's detail and goes back; part maker's page; too big", async ({ page }) => {
    await install(page, [], { upload: "wrong_car" });
    await openCoverage(page);
    await page.getByTestId("add-from-saved-page").click();
    const o = page.getByTestId("saved-page-overlay");
    await chooseFile(page);
    await o.getByTestId("saved-page-read").click();
    await expect(o.getByTestId("saved-page-stop")).toHaveAttribute("data-code", "wrong_car");
    await expect(o.getByTestId("saved-page-stop")).toContainText("This page is for a different car");
    await expect(o.getByTestId("saved-page-stop-detail")).toHaveText("Page shows M910A-BBBBB · This car M900A");
    await shot(page, "09-stop-wrong-car");
    await noDropWords(page);
    await o.getByTestId("saved-page-choose-another").click();
    await expect(o.getByTestId("saved-page-dropzone")).toBeVisible();
    // Too big is caught before uploading.
    await page.getByTestId("saved-page-file-input").setInputFiles({ name: "huge.html", mimeType: "text/html", buffer: Buffer.alloc(8 * 1024 * 1024 + 10, 32) });
    await expect(o.getByTestId("saved-page-stop")).toHaveAttribute("data-code", "too_big");
    await expect(o.getByTestId("saved-page-stop-detail")).toHaveText("8.0 MB");

    const pm = await page.context().newPage();
    await pm.setViewportSize({ width: 1440, height: 1000 });
    await install(pm, [], { upload: "part_maker_page" });
    await openCoverage(pm);
    await pm.getByTestId("add-from-saved-page").click();
    await chooseFile(pm);
    await pm.getByTestId("saved-page-read").click();
    const po = pm.getByTestId("saved-page-overlay");
    await expect(po.getByTestId("saved-page-stop")).toContainText("Saved pages work with the car maker's own catalogue");
    await expect(po.getByTestId("saved-page-stop")).toContainText("Use the browser check for this site.");
    await po.getByTestId("saved-page-done").click();
    await expect(po).toHaveCount(0);
  });

  test("Screen 3 — browser check step 1: Use a saved page opens the upload for this car and job", async ({ page }) => {
    const calls: Calls = [];
    await install(page, calls);
    await openCoverage(page);
    await page.locator('[data-testid="coverage-tile"][data-state="browser_check"]').getByRole("button", { name: "Open browser check" }).click();
    const d = page.getByTestId("research-drawer");
    const card = d.getByTestId("use-saved-page-card");
    await expect(card).toContainText("Faster: upload the page instead");
    await expect(card).toContainText("Save the page with Ctrl+S and upload it. Roam fills in every number and date for you.");
    await expect(d.getByTestId("browser-check-next")).toBeVisible();
    await expect(d.getByTestId("not-on-page")).toBeVisible();
    await shot(page, "03-browser-check-use-saved-page");
    await noDropWords(page);
    await card.getByTestId("use-saved-page").click();
    const o = page.getByTestId("saved-page-overlay");
    await expect(o).toContainText("Toyota Roomy · M900A");
    await chooseFile(page);
    await o.getByTestId("saved-page-read").click();
    await expect(o.getByTestId("saved-page-result-title")).toHaveText("7 parts saved");
    expect(calls.find((c) => c.method === "POST" && c.path === "/saved-pages")!.body).toContain(`name="jobId"\r\n\r\n${JOB}`);
    await o.getByTestId("saved-page-done").click();
    await expect(o).toHaveCount(0);
  });

  test("Screen 10 — phone: the result is a bottom sheet and row names never cut off the place", async ({ page }) => {
    await install(page, [], { upload: "saved" });
    await page.setViewportSize({ width: 390, height: 844 });
    await openCoverage(page);
    await page.getByTestId("add-from-saved-page").click();
    const o = page.getByTestId("saved-page-overlay");
    await chooseFile(page);
    await o.getByTestId("saved-page-read").click();
    await expect(o.getByTestId("saved-page-result-title")).toHaveText("7 parts saved");
    const row = o.getByTestId("group-saved").getByTestId("saved-page-row").first();
    await expect(row).toContainText("Shock absorber · front right");
    const box = await row.boundingBox();
    expect(box && box.width).toBeLessThanOrEqual(390);
    await shot(page, "10-phone-result");
    await noDropWords(page);
  });
});
