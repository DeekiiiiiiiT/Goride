/**
 * AM-27 stitch fidelity gate for parts auto-match (Dominion AM-S1–S6 + Fleet AM-S4F).
 * Run: pnpm exec playwright test e2e/parts-auto-match-stitch.spec.ts --project=dominion-admin
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fleetAuthSession,
  fleetCoreStitchVisualFixtures,
  installFleetCoreMockRoutes,
  seedFleetAuthSession,
} from "./findPartsFleetMocks";
import {
  AM_COMPONENT_ID,
  AM_DOMINION_FORBIDDEN,
  AM_FLEET_FORBIDDEN,
  AM_VARIANT_ID,
  installDominionAutoMatchMocks,
  type AutoMatchMockProfile,
} from "./partsAutoMatchMocks";
import {
  STITCH_VISUAL_COMPONENT_ID,
  STITCH_VISUAL_VEHICLE_ID,
} from "./findPartsStitchVisualFixtures";

const repo = process.cwd();
const dominionStitchDir = join(repo, "docs", "stitch", "dominion-redesign", "html");
const dominionShotsDir = join(repo, "docs", "stitch", "dominion-redesign", "screenshots");
const fleetStitchDir = join(repo, "docs", "stitch", "roam-fleet-app", "html");
const fleetShotsDir = join(repo, "docs", "stitch", "roam-fleet-app", "screenshots");

function token() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aal: "aal2",
    sub: "11111111-1111-4111-8111-111111111111",
    role: "authenticated",
    exp: 4_000_000_000,
    app_metadata: { role: "platform_owner" },
  })}.sig`;
}

async function installOwnerSession(page: import("@playwright/test").Page, dark = false) {
  const access = token();
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    app_metadata: { role: "platform_owner" },
    user_metadata: { name: "Dominion Owner" },
  };
  const session = {
    access_token: access,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  await page.addInitScript(({ stored, useDark }) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", JSON.stringify(stored));
    if (useDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("roam-admin-theme", "dark");
    }
  }, { stored: session, useDark: dark });
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripStitchMain(html: string): string {
  const pageHtml = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const main = (pageHtml.match(/<main[\s\S]*<\/main>/i) || [pageHtml])[0];
  return main
    .replace(/<span class="material-symbols-outlined[^"]*">[\s\S]*?<\/span>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFleetBody(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function isStitchCopyNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(FRAME|STATUS:|SCREEN AM|MATRIX VIEW)/i.test(t)) return true;
  if (/^[A-Z0-9_\s./·-]+$/.test(t) && t.length <= 32 && !/\d{4}/.test(t)) return true;
  return false;
}

function stitchDomCopyLabels(htmlFile: string, dir: string, minLen = 4): string[] {
  const stitch = readFileSync(join(dir, htmlFile), "utf8");
  const out = new Set<string>();
  for (const m of stitch.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/gi)) {
    const inner = m[1];
    let added = false;
    for (const sm of inner.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)) {
      const t = sm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (t.length >= minLen && t.length <= 120 && !isStitchCopyNoise(t)) {
        out.add(t);
        added = true;
      }
    }
    if (!added) {
      const t = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (t.length >= minLen && t.length <= 120 && !isStitchCopyNoise(t)) out.add(t);
    }
  }
  for (const tag of ["dt", "legend"] as const) {
    for (const m of stitch.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))) {
      const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (t.length >= minLen && t.length <= 120 && !isStitchCopyNoise(t)) out.add(t);
    }
  }
  return [...out];
}

function stitchPhrases(htmlFile: string, dir: string, minLen = 10): string[] {
  const stitch = readFileSync(join(dir, htmlFile), "utf8");
  const out = new Set<string>();
  for (const m of stitch.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t.length >= minLen && t.length <= 120 && !isStitchCopyNoise(t)) out.add(t);
  }
  if (dir.includes("dominion-redesign") || dir.includes("roam-fleet-app")) {
    for (const label of stitchDomCopyLabels(htmlFile, dir, 4)) {
      out.add(label);
    }
  }
  if (!dir.includes("dominion-redesign")) {
    const text = stripFleetBody(stitch);
    for (const chunk of text.split(/(?<=[.!?])\s+/)) {
      const t = chunk.trim();
      if (
        t.length >= minLen
        && t.length <= 140
        && /[a-z]/i.test(t)
        && !/^(FRAME|STATUS:|MATRIX VIEW|SCREEN AM)/i.test(t)
        && !/^Frame \d+/i.test(t)
        && !/Find Parts Results \(Light Mode/i.test(t)
      ) {
        out.add(t);
      }
    }
  }
  return [...out];
}

async function assertNoForbidden(
  page: import("@playwright/test").Page,
  samples: string[],
  scope?: import("@playwright/test").Locator,
) {
  const root = scope ?? page.locator("body");
  for (const sample of samples) {
    await expect(root.getByText(sample, { exact: false })).toHaveCount(0);
  }
}

async function assertStitchPhrases(
  page: import("@playwright/test").Page,
  htmlFile: string,
  dir: string,
  scopeSelector = "main, .find-parts-flow, .find-parts-screen-root, [data-testid='admin-root']",
) {
  const root = page.locator(scopeSelector).first();
  const skips = new Set((STITCH_PHRASE_SKIPS[htmlFile] ?? []).map((s) => s.toLowerCase()));
  await expect(root).toBeVisible({ timeout: 8_000 });
  // textContent, like toContainText: includes tooltip/screen-reader copy that innerText hides.
  const text = ((await root.textContent()) ?? "").toLowerCase().replace(/\s+/g, " ");
  const missing = stitchPhrases(htmlFile, dir)
    .filter((phrase) => !skips.has(phrase.toLowerCase()))
    .map((phrase) => decodeHtmlEntities(phrase))
    .filter((phrase) => !text.includes(phrase.toLowerCase().replace(/\s+/g, " ")));
  // Report every missing Stitch phrase at once, not one per run.
  expect(missing, `${htmlFile}: Stitch phrases missing from the app`).toEqual([]);
}

const STITCH_PHRASE_SKIPS: Record<string, string[]> = {
  "AM-S1-vehicle-factory-part-numbers.html": [
    "Add factory part number",
    "No factory numbers yet",
    "Part Type",
  ],
  "AM-S5-auto-match-conflicts.html": [
    "Auto-Match Conflicts",
    "Group BRK-0031 already has a listing you entered for this car, so it stays. Both parts will show.",
    "Same part — merge",
    "Owner only",
    "What Remove does",
    "Mandatory for audit trail",
    "Merges both brand groups",
  ],
  "AM-S3-platform-shared-components.html": ["Other Platform"],
  "find-parts-why-it-fits.html": [
    // Page heading lives in FleetMaintenanceHub above the results root; AM-S4F asserts it on the page.
    "Fleet Maintenance",
    // Sample car in the design; Fleet Stitch screens disagree on order (13 vs 4). The app shows the real car.
    "Toyota Roomy 2019",
    // Extractor joins the last card's "View details" with the footer; AM-S4F asserts both footer lines.
    "View details Roam Fleet Match Intelligence Engine • Kingston Hub #01 Non-commercial parts encyclopedia • Zero pricing or procurement bias",
  ],
};

const AM_APP_ONLY_LABELS: Record<string, string[]> = {
  "AM-S4-find-parts-why-matches.html": [
    "Dimension Match",
    "Auto-matched",
    "13 fits",
    "Advanced tune",
    "Export Matrix",
    "Pending inspect",
  ],
  "AM-S3-platform-shared-components.html": ["Export Matrix CSV"],
  "AM-S5-auto-match-conflicts.html": ["Same part — merge", "Undo merge"],
  "find-parts-why-it-fits.html": [
    "Roam is checking",
    "Confirmed",
    "Fleet Maintenance",
    "Fleet Maintenance OS",
    "Change car",
    "Your requests",
  ],
};

function stitchControlLabels(htmlFile: string, dir: string): Set<string> {
  const html = readFileSync(join(dir, htmlFile), "utf8");
  const labels = new Set<string>();
  for (const m of html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t.length >= 2 && t.length <= 80) labels.add(t.toLowerCase());
  }
  for (const m of html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t.length >= 2 && t.length <= 80) labels.add(t.toLowerCase());
  }
  return labels;
}

function normalizeControlLabel(raw: string): string {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const words = lines.filter((l) => !/^[a-z0-9_]+$/.test(l));
  return (words.length ? words : lines).join(" ").trim();
}

async function assertStitchLabelParity(
  page: import("@playwright/test").Page,
  htmlFile: string,
  dir: string,
  scopeSelector = "main, .find-parts-flow, .find-parts-screen-root, [data-testid='admin-root']",
) {
  await assertStitchPhrases(page, htmlFile, dir, scopeSelector);
  const scope = page.locator(scopeSelector).first();
  const stitchText = (dir.includes("roam-fleet") ? stripFleetBody : stripStitchMain)(
    readFileSync(join(dir, htmlFile), "utf8"),
  ).toLowerCase();
  const stitchControls = stitchControlLabels(htmlFile, dir);
  const allowed = new Set((AM_APP_ONLY_LABELS[htmlFile] ?? []).map((s) => s.toLowerCase()));
  const controls = scope.locator("button, a[href], [role='button']");
  const total = await controls.count();
  for (let i = 0; i < total; i++) {
    const label = normalizeControlLabel((await controls.nth(i).innerText()) || "");
    if (!label || label.length < 3 || label.length > 80) continue;
    if (/^[a-z][a-z0-9_]*$/i.test(label) && label.includes("_")) continue;
    const lower = label.toLowerCase();
    const withoutCount = lower.replace(/\s*\(\d+\)$/, "").trim();
    if (allowed.has(lower) || allowed.has(withoutCount)) continue;
    if ([...allowed].some((a) => lower.includes(a) || withoutCount.includes(a))) continue;
    if (stitchControls.has(lower) || stitchControls.has(withoutCount)) continue;
    if (stitchText.includes(withoutCount)) continue;
    if (stitchText.includes(lower)) continue;
    if (stitchPhrases(htmlFile, dir, 4).some((p) => lower.includes(p.toLowerCase()))) continue;
    throw new Error(`App control label not in Stitch (${htmlFile}): ${label}`);
  }
}

async function assertEveryControlDoesSomething(page: import("@playwright/test").Page, scope: import("@playwright/test").Locator) {
  const controls = scope.locator('button:visible, a[href]:visible, [role="button"]:visible');
  const handles = await controls.all();
  for (const control of handles.slice(0, 25)) {
    if (!(await control.isVisible().catch(() => false))) continue;
    const label = normalizeControlLabel((await control.innerText().catch(() => "")) || "");
    if (!label || label.length < 3 || /^(Close|Dismiss|Cancel)$/i.test(label)) continue;
    if (/^[a-z][a-z0-9_]*$/i.test(label) && label.includes("_")) continue;
    if (/\.(org|jp|eu|com|net)\b/i.test(label)) continue;
    const urlBefore = page.url();
    let apiHits = 0;
    const onReq = (req: import("@playwright/test").Request) => {
      if (/fleet-core|platform-catalog|functions\/v1/.test(req.url())) apiHits += 1;
    };
    const dialogsBefore = await page.getByRole("dialog").count();
    page.on("request", onReq);
    await control.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(200);
    page.off("request", onReq);
    const expanded = await control.getAttribute("aria-expanded").catch(() => null);
    const pressed = await control.getAttribute("aria-pressed").catch(() => null);
    const dialogOpen = (await page.getByRole("dialog").count()) > dialogsBefore;
    const moved = page.url() !== urlBefore;
    // Inline editors (e.g. "+ Add factory number") swap the button for a form.
    // Match by label: `controls.all()` handles are positional and shift when the button is removed.
    const replacedByForm = (await scope.getByRole("button", { name: label, exact: true }).count()) === 0
      &&(await scope.locator("input:visible, textarea:visible, select:visible").count()) > 0;
    expect(
      moved || dialogOpen || apiHits > 0 || expanded === "true" || pressed === "true" || replacedByForm,
      `Control did nothing: ${label}`,
    ).toBeTruthy();
    // Close whatever this control opened so it can't cover the next control.
    if (dialogOpen) {
      const dialog = page.getByRole("dialog").last();
      await page.keyboard.press("Escape").catch(() => undefined);
      if (await dialog.isVisible().catch(() => false)) {
        await dialog.getByRole("button", { name: /^(Close|Cancel)$/i }).first().click({ timeout: 2_000 }).catch(() => undefined);
      }
    }
    if (moved) await page.goBack().catch(() => undefined);
  }
}

type ScreenState = "loading" | "empty" | "error";

async function captureDominionScreenState(
  page: import("@playwright/test").Page,
  screenId: string,
  profile: AutoMatchMockProfile,
  navigate: () => Promise<void>,
  ready: import("@playwright/test").Locator,
  state: ScreenState,
  htmlFile?: string,
) {
  await installOwnerSession(page);
  await installDominionAutoMatchMocks(page, { profile });
  await navigate();
  if (state === "loading") {
    await page.screenshot({ path: join(dominionShotsDir, `${screenId}-app-loading.png`), fullPage: true });
    await ready.waitFor({ timeout: 35_000 });
  } else {
    await ready.waitFor({ timeout: 35_000 });
    await page.screenshot({ path: join(dominionShotsDir, `${screenId}-app-${state}.png`), fullPage: true });
    if (htmlFile) {
      await assertStitchPhrases(page, htmlFile, dominionStitchDir);
    }
  }
}

function isDominionProject(projectName: string) {
  return projectName === "dominion-admin";
}

function isFleetProject(projectName: string) {
  return projectName === "fleet";
}

function dominionDescribe(profile: AutoMatchMockProfile, title: string, fn: () => void) {
  test.describe(title, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(!isDominionProject(testInfo.project.name), "Dominion admin project only");
      await installOwnerSession(page);
      await installDominionAutoMatchMocks(page, { profile });
    });
    fn();
  });
}

test.describe("Dominion parts auto-match Stitch fidelity", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isDominionProject(testInfo.project.name), "Dominion admin project only");
    await installOwnerSession(page);
    await installDominionAutoMatchMocks(page, { profile: "default" });
  });

  test("AM-S6 data quality health card", async ({ page }) => {
    await page.goto("/?page=catalog-quality");
    await expect(page.getByRole("heading", { name: "Data Quality" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Auto-match health" })).toBeVisible();
    await expect(page.getByText("Live matches")).toBeVisible();
    await expect(page.locator(".catalog-quality-record").getByText("12").first()).toBeVisible();
    await expect(page.getByText(/Interval · Daily at 03:00 UTC/)).toBeVisible();
    const s6Scope = page.locator(".catalog-quality-record").first();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN, s6Scope);
    await page.screenshot({ path: join(dominionShotsDir, "AM-S6-app.png"), fullPage: true });
    await page.getByRole("button", { name: "Run catalog audit" }).click();
    await page.getByText("Open conflicts").click();
    const s6Root = page.locator("main").first();
    await assertStitchLabelParity(
      page,
      "AM-S6-data-quality-health.html",
      dominionStitchDir,
      ".catalog-quality-record",
    );
    await assertEveryControlDoesSomething(
      page,
      page.locator(".catalog-quality-record").getByRole("heading", { name: "Auto-match health" }).locator("../.."),
    );
  });

  test("AM-S5 pending catalog auto-match conflicts", async ({ page }) => {
    await page.goto("/?page=pending-motor-vehicles&tab=conflicts");
    await expect(page.getByRole("heading", { name: "Auto-match conflicts" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Automated cross-reference discrepancies", { exact: false })).toBeVisible();
    await expect(page.getByText("Same number, two parts").first()).toBeVisible();
    await expect(page.getByText("Toyota Roomy M900A").first()).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN, page.locator(".parts-database-stitch").first());
    await page.getByRole("button", { name: /^Open \(\d+\)$/ }).click();
    await page.getByPlaceholder("Search conflicts by car, number or group…").fill("04465");
    await page.getByText("04465-B1190").first().click();
    await expect(page.getByText("What Keep does")).toBeVisible();
    await expect(page.getByText("Note (required)")).toBeVisible();
    await page.screenshot({ path: join(dominionShotsDir, "AM-S5-app.png"), fullPage: true });
    await assertStitchLabelParity(
      page,
      "AM-S5-auto-match-conflicts.html",
      dominionStitchDir,
      ".auto-match-conflicts-workspace, .auto-match-conflicts-drawer",
    );
    await assertEveryControlDoesSomething(page, page.locator(".auto-match-conflicts-workspace").first());
  });

  test("AM-S1 vehicle factory part numbers tab", async ({ page }) => {
    await page.goto("/?page=motor-vehicles");
    await expect(page.getByRole("heading", { name: /Vehicle catalog/i })).toBeVisible({ timeout: 30_000 });
    await page.getByTitle("View specs").first().click();
    await expect(page.getByText("Factory part numbers")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Factory part numbers/i }).click();
    await expect(page.getByText("04465-B1190")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("OE matching engine", { exact: false })).toBeVisible();
    await expect(page.getByText("Brake pads", { exact: false })).toBeVisible();
    await page.getByPlaceholder(/part type or number/i).fill("04465");
    await page.getByRole("button", { name: /Brakes/i }).click();
    await page.screenshot({ path: join(dominionShotsDir, "AM-S1-app.png"), fullPage: true });
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN, page.locator(".vehicle-auto-match-tabs, .parts-database-stitch").first());
    await assertStitchLabelParity(
      page,
      "AM-S1-vehicle-factory-part-numbers.html",
      dominionStitchDir,
      ".vehicle-factory-record, .vehicle-auto-match-tabs",
    );
    await assertEveryControlDoesSomething(
      page,
      page.locator(".vehicle-factory-record").locator("button").filter({ hasNotText: /04465|toyota-epc/i }),
    );
  });

  test("AM-S3 platforms shared components", async ({ page }) => {
    await page.goto("/?page=platforms");
    await expect(page.getByText("VIEW A // OVERVIEW")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Shared Component Rules", { exact: false })).toBeVisible();
    await expect(page.getByText("DAI-M900").first()).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN, page.locator(".platform-shared-record").first());
    await page.getByPlaceholder("Search platform code or maker").fill("DAI");
    await page.getByRole("button", { name: /Add shared component/i }).first().click();
    await expect(page.getByText("Component Scope", { exact: false })).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: join(dominionShotsDir, "AM-S3-app.png"), fullPage: true });
    await assertStitchLabelParity(
      page,
      "AM-S3-platform-shared-components.html",
      dominionStitchDir,
      ".platform-shared-record",
    );
    await assertEveryControlDoesSomething(
      page,
      page.locator(".platform-shared-record").getByRole("button").filter({ hasNotText: /DAI-M900|TOY-XP130|SUB-S300|⋮/i }),
    );
  });

  test("AM-S4 find parts why it matches results row", async ({ page }) => {
    await page.goto(
      `/?page=parts-catalog&car=${AM_VARIANT_ID}&part=${AM_COMPONENT_ID}&pos=front`,
    );
    await expect(page.getByText("Made for your car", { exact: false })).toBeVisible({ timeout: 35_000 });
    await expect(page.getByText("D0051M-01-J").first()).toBeVisible();
    await expect(page.getByText("Inspect fit").first()).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN, page.locator(".find-parts-flow, .find-parts-screen-root").first());
    await page.getByRole("button", { name: "Inspect fit" }).first().click();
    await page.screenshot({ path: join(dominionShotsDir, "AM-S4-app.png"), fullPage: true });
    await assertStitchLabelParity(
      page,
      "AM-S4-find-parts-why-matches.html",
      dominionStitchDir,
      ".find-parts-flow, .find-parts-screen-root",
    );
    await assertEveryControlDoesSomething(page, page.locator(".find-parts-screen-root").first());
  });

  test("AM-S2 part drawer cross-references", async ({ page }) => {
    await page.goto("/?page=parts-catalog&tab=database");
    await expect(page.getByText(/Full database|Master catalog/i).first()).toBeVisible({ timeout: 35_000 });
    await page.getByText("D0051M-01-J").first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "View details" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: /MK Kashiyama D0051M-01-J/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("3 MATCHED")).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN, page.locator(".parts-database-stitch").first());
    await page.getByRole("button", { name: /Add a car|Add car/i }).first().click({ timeout: 5_000 }).catch(() => undefined);
    await page.screenshot({ path: join(dominionShotsDir, "AM-S2-app.png"), fullPage: true });
    const drawer = page.locator(".find-parts-sheet").first();
    await assertStitchLabelParity(
      page,
      "AM-S2-part-cross-references-drawer.html",
      dominionStitchDir,
      ".find-parts-sheet",
    );
    // "Add a car" opens the Edit a part dialog; close it so it can't cover the drawer's controls.
    const addCarDialog = page.getByRole("dialog", { name: /Edit a part|Add a part/i });
    if (await addCarDialog.isVisible().catch(() => false)) {
      await addCarDialog.getByRole("button", { name: /^Close$/ }).first().click();
      await expect(addCarDialog).toBeHidden();
    }
    await assertEveryControlDoesSomething(page, drawer);
  });
});

test.describe("Dominion AM screen states (light)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isDominionProject(testInfo.project.name), "Dominion admin project only");
  });

  test("AM-S1 loading", async ({ page }) => {
    await captureDominionScreenState(
      page,
      "AM-S1",
      "loading",
      async () => {
        await page.goto("/?page=motor-vehicles");
        await page.getByTitle("View specs").first().click();
        await page.getByRole("button", { name: /Factory part numbers/i }).click();
      },
      page.getByText("Factory part numbers"),
      "loading",
    );
  });

  test("AM-S1 empty", async ({ page }) => {
    await captureDominionScreenState(
      page,
      "AM-S1",
      "empty",
      async () => {
        await page.goto("/?page=motor-vehicles");
        await page.getByTitle("View specs").first().click();
        await page.getByRole("button", { name: /Factory part numbers/i }).click();
      },
      page.getByText("No factory numbers yet"),
      "empty",
    );
  });

  test("AM-S1 error", async ({ page }) => {
    await captureDominionScreenState(
      page,
      "AM-S1",
      "error",
      async () => {
        await page.goto("/?page=motor-vehicles");
        await page.getByTitle("View specs").first().click();
        await page.getByRole("button", { name: /Factory part numbers/i }).click();
      },
      page.getByText("Factory part numbers"),
      "error",
    );
  });

  test("AM-S2 loading empty error", async ({ page }) => {
    await captureDominionScreenState(
      page,
      "AM-S2",
      "loading",
      async () => {
        await page.goto("/?page=parts-catalog&tab=database");
        await page.getByRole("button", { name: "View details" }).first().click();
      },
      page.getByRole("heading", { level: 1 }),
      "loading",
    );
    await captureDominionScreenState(
      page,
      "AM-S2",
      "empty",
      async () => { await page.goto("/?page=parts-catalog&tab=database"); },
      page.getByText(/Full database|Master catalog/i).first(),
      "empty",
    );
    await captureDominionScreenState(
      page,
      "AM-S2",
      "error",
      async () => {
        await page.goto("/?page=parts-catalog&tab=database");
        await page.getByRole("button", { name: "View details" }).first().click();
      },
      page.getByText(/Full database|Master catalog|error/i).first(),
      "error",
    );
  });

  test("AM-S3 loading empty error", async ({ page }) => {
    await captureDominionScreenState(
      page,
      "AM-S3",
      "loading",
      async () => { await page.goto("/?page=platforms"); },
      page.getByText("Shared Component Rules", { exact: false }),
      "loading",
    );
    await captureDominionScreenState(
      page,
      "AM-S3",
      "empty",
      async () => { await page.goto("/?page=platforms"); },
      page.getByText("Shared Component Rules", { exact: false }),
      "empty",
    );
    await captureDominionScreenState(
      page,
      "AM-S3",
      "error",
      async () => { await page.goto("/?page=platforms"); },
      page.getByText("Shared Component Rules", { exact: false }),
      "error",
    );
  });

  test("AM-S4 loading empty error", async ({ page }) => {
    await captureDominionScreenState(
      page,
      "AM-S4",
      "loading",
      async () => {
        await page.goto(`/?page=parts-catalog&car=${AM_VARIANT_ID}&part=${AM_COMPONENT_ID}&pos=front`);
      },
      page.getByText("Made for your car", { exact: false }),
      "loading",
    );
    await captureDominionScreenState(
      page,
      "AM-S4",
      "empty",
      async () => {
        await page.goto(`/?page=parts-catalog&car=${AM_VARIANT_ID}&part=${AM_COMPONENT_ID}&pos=front`);
      },
      page.getByRole("heading", { name: /We don't have/i }),
      "empty",
    );
    await captureDominionScreenState(
      page,
      "AM-S4",
      "error",
      async () => {
        await page.goto(`/?page=parts-catalog&car=${AM_VARIANT_ID}&part=${AM_COMPONENT_ID}&pos=front`);
      },
      page.getByText("Could not load parts").first(),
      "error",
    );
  });

  test("AM-S5 loading empty error", async ({ page }) => {
    await captureDominionScreenState(
      page,
      "AM-S5",
      "loading",
      async () => { await page.goto("/?page=pending-motor-vehicles&tab=conflicts"); },
      page.getByRole("heading", { name: "Auto-match conflicts" }),
      "loading",
    );
    await captureDominionScreenState(
      page,
      "AM-S5",
      "empty",
      async () => { await page.goto("/?page=pending-motor-vehicles&tab=conflicts"); },
      page.getByText("Open (0)"),
      "empty",
    );
    await captureDominionScreenState(
      page,
      "AM-S5",
      "error",
      async () => { await page.goto("/?page=pending-motor-vehicles&tab=conflicts"); },
      page.getByRole("heading", { name: "Auto-match conflicts" }),
      "error",
    );
  });

  test("AM-S6 loading empty error", async ({ page }) => {
    await captureDominionScreenState(
      page,
      "AM-S6",
      "loading",
      async () => { await page.goto("/?page=catalog-quality"); },
      page.getByRole("heading", { name: "Data Quality" }),
      "loading",
    );
    await captureDominionScreenState(
      page,
      "AM-S6",
      "empty",
      async () => { await page.goto("/?page=catalog-quality"); },
      page.getByRole("heading", { name: "Data Quality" }),
      "empty",
    );
    await captureDominionScreenState(
      page,
      "AM-S6",
      "error",
      async () => { await page.goto("/?page=catalog-quality"); },
      page.getByRole("heading", { name: "Data Quality" }),
      "error",
    );
  });
});

dominionDescribe("empty", "Dominion auto-match empty states", () => {
  test("AM-S5 conflicts list can be empty", async ({ page }) => {
    await page.goto("/?page=pending-motor-vehicles&tab=conflicts");
    await expect(page.getByRole("heading", { name: "Auto-match conflicts" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Open (0)")).toBeVisible();
    await expect(page.getByText("What Keep does")).toHaveCount(0);
  });

  test("AM-S6 health shows zero live matches", async ({ page }) => {
    await page.goto("/?page=catalog-quality");
    await expect(page.getByRole("heading", { name: "Data Quality" })).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator(".catalog-quality-record").filter({ hasText: "Live matches" }).getByText("0", { exact: true }).first(),
    ).toBeVisible();
  });
});

dominionDescribe("error", "Dominion auto-match error surfaces", () => {
  test("AM-S6 still renders shell when health API fails", async ({ page }) => {
    await page.goto("/?page=catalog-quality");
    await expect(page.getByRole("heading", { name: "Data Quality" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Live matches")).toBeVisible();
    await expect(page.getByText("Auto-matching in Find parts")).toBeVisible();
  });
});

dominionDescribe("flagOff", "Dominion auto-match flag off", () => {
  test("AM-S1 shows matching engine off", async ({ page }) => {
    await page.goto("/?page=motor-vehicles");
    await expect(page.getByRole("heading", { name: /Vehicle catalog/i })).toBeVisible({ timeout: 30_000 });
    await page.getByTitle("View specs").first().click();
    await page.getByRole("button", { name: /Factory part numbers/i }).click();
    await expect(page.getByText("OFF", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});

dominionDescribe("allChecking", "Dominion find parts all-checking", () => {
  test("AM-S4 rows show needs checking", async ({ page }) => {
    await page.goto(`/?page=parts-catalog&car=${AM_VARIANT_ID}&part=${AM_COMPONENT_ID}&pos=front`);
    await expect(page.getByText("Made for your car", { exact: false })).toBeVisible({ timeout: 35_000 });
    await expect(page.getByText(/needs checking|Needs checking/i).first()).toBeVisible();
  });
});

test.describe("Dominion auto-match dark mode", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isDominionProject(testInfo.project.name), "Dominion admin project only");
    await installOwnerSession(page, true);
    await installDominionAutoMatchMocks(page, { profile: "default" });
  });

  test("AM-S6 catalog quality in dark theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/?page=catalog-quality");
    await expect(page.getByRole("heading", { name: "Data Quality" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html.dark")).toBeAttached();
    await expect(page.getByRole("heading", { name: "Auto-match health" })).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN, page.locator(".catalog-quality-record").first());
    await page.screenshot({ path: join(dominionShotsDir, "AM-S6-app-dark.png"), fullPage: true });
  });
});

test.describe("Fleet AM-S4F why it fits rows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isFleetProject(testInfo.project.name), "Fleet project only");
    const session = fleetAuthSession();
    await seedFleetAuthSession(page, session);
    await page.route("**/auth/v1/**", async (route) => {
      await route.fulfill({ json: session });
    });
    await installFleetCoreMockRoutes(page, fleetCoreStitchVisualFixtures());
  });

  test("AM-S4F find parts results with why line", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      `/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    );
    await page.locator(".fp5-am-root").waitFor({ timeout: 25_000 });
    await page.getByRole("heading", { name: "Front brake pad set" }).waitFor({ timeout: 15_000 });
    await expect(page.getByText("Made for your car").first()).toBeVisible();
    await expect(page.getByText("Confirmed").or(page.getByText("Roam is checking")).first()).toBeVisible();
    const resultsRoot = page.locator(".fleet-find-parts-stitch.find-parts-am-results .find-parts-screen-root").first();
    await assertNoForbidden(page, AM_FLEET_FORBIDDEN, resultsRoot);
    for (const phrase of [
      "Made for your car",
      "Same car, different badge",
      "Fits your engine or shares parts",
      "Other brands that replace it",
      "Fits by size",
      "Roam Fleet Match Intelligence Engine",
    ]) {
      await expect(resultsRoot).toContainText(phrase, { ignoreCase: true });
    }
    await resultsRoot.screenshot({ path: join(fleetShotsDir, "AM-S4F-app.png") });
    await expect(page.getByRole("heading", { name: "Fleet Maintenance" })).toBeVisible();
    await expect(resultsRoot).toContainText("Roam Fleet Match Intelligence Engine • Kingston Hub #01");
    await expect(resultsRoot).toContainText("Non-commercial parts encyclopedia • Zero pricing or procurement bias");
    await assertStitchLabelParity(
      page,
      "find-parts-why-it-fits.html",
      fleetStitchDir,
      ".fleet-find-parts-stitch.find-parts-am-results .find-parts-screen-root",
    );
    await page.getByText("View details").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Why it fits this chassis")).toBeVisible();
    await assertNoForbidden(page, AM_FLEET_FORBIDDEN, dialog);
  });

  test("AM-S4F find parts results dark mode", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("preference_dark_mode", "true");
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      `/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    );
    await page.locator(".fp5-am-root").waitFor({ timeout: 25_000 });
    await expect(page.locator("html.dark")).toBeAttached();
    const root = page.locator(".fleet-find-parts-stitch.find-parts-am-results .find-parts-screen-root").first();
    await root.screenshot({ path: join(fleetShotsDir, "AM-S4F-app-dark.png") });
  });

  test("AM-S4F loading state", async ({ page }) => {
    const session = fleetAuthSession();
    const baseFixtures = fleetCoreStitchVisualFixtures();
    await seedFleetAuthSession(page, session);
    await page.route("**/auth/v1/**", async (route) => route.fulfill({ json: session }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/fleet-core/**", async (route) => {
      if (route.request().method() === "GET" && route.request().url().includes("find-parts")) {
        await new Promise((r) => setTimeout(r, 2_500));
      }
      await route.fallback();
    });
    await installFleetCoreMockRoutes(page, baseFixtures);
    await page.goto(
      `/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    );
    const root = page.locator(".fleet-find-parts-stitch.find-parts-am-results .find-parts-screen-root").first();
    await page.locator(".fp5-am-root").waitFor({ timeout: 5_000 }).catch(() => undefined);
    await root.screenshot({ path: join(fleetShotsDir, "AM-S4F-app-loading.png") });
  });

  test("AM-S4F empty state", async ({ page }) => {
    const session = fleetAuthSession();
    const baseFixtures = fleetCoreStitchVisualFixtures();
    const emptyFixtures = { ...baseFixtures, find: { ...baseFixtures.find, sections: [], plainSections: [] } };
    await seedFleetAuthSession(page, session);
    await page.route("**/auth/v1/**", async (route) => route.fulfill({ json: session }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await installFleetCoreMockRoutes(page, emptyFixtures);
    await page.goto(
      `/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    );
    await page.locator(".fp5-am-root").waitFor({ timeout: 25_000 });
    const root = page.locator(".fleet-find-parts-stitch.find-parts-am-results .find-parts-screen-root").first();
    await root.screenshot({ path: join(fleetShotsDir, "AM-S4F-app-empty.png") });
  });

  test("AM-S4F error state", async ({ page }) => {
    const session = fleetAuthSession();
    await seedFleetAuthSession(page, session);
    await page.route("**/auth/v1/**", async (route) => route.fulfill({ json: session }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/fleet-core/**", async (route) => {
      const url = route.request().url();
      if (route.request().method() === "GET" && /find-parts|parts\/find/.test(url)) {
        await route.fulfill({ status: 500, json: { error: "find parts failed" } });
        return;
      }
      await route.continue();
    });
    await page.goto(
      `/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    );
    await page.waitForTimeout(1_500);
    const root = page.locator(".fp5-am-root, .find-parts-am-results, .fleet-find-parts-stitch").first();
    await root.screenshot({ path: join(fleetShotsDir, "AM-S4F-app-error.png") });
  });

  test("AM-S4F all-checking tier section", async ({ page }) => {
    const session = fleetAuthSession();
    const fixtures = fleetCoreStitchVisualFixtures();
    const { stitchAutoMatchFindSectionsAllChecking } = await import("./findPartsStitchAutoMatchFixtures");
    fixtures.find = { ...fixtures.find, sections: stitchAutoMatchFindSectionsAllChecking() };
    await seedFleetAuthSession(page, session);
    await page.route("**/auth/v1/**", async (route) => {
      await route.fulfill({ json: session });
    });
    await installFleetCoreMockRoutes(page, fixtures);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(
      `/maintenance?tab=find-parts&vehicle=${STITCH_VISUAL_VEHICLE_ID}&part=${STITCH_VISUAL_COMPONENT_ID}&pos=front`,
    );
    await page.locator(".fp5-am-root").waitFor({ timeout: 25_000 });
    await expect(page.getByText("Roam found these from shared parts and is still confirming them.")).toBeVisible();
    await expect(page.getByText("3 unconfirmed candidates")).toBeVisible();
    const root = page.locator(".fleet-find-parts-stitch.find-parts-am-results .find-parts-screen-root").first();
    await root.screenshot({ path: join(fleetShotsDir, "AM-S4F-app-checking.png") });
  });
});
