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

async function installOwnerSession(page: import("@playwright/test").Page) {
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
  await page.addInitScript((stored) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", JSON.stringify(stored));
  }, session);
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
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

function stitchPhrases(htmlFile: string, dir: string, minLen = 10): string[] {
  const stitch = readFileSync(join(dir, htmlFile), "utf8");
  const out = new Set<string>();
  for (const m of stitch.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t.length >= minLen && t.length <= 120) out.add(t);
  }
  const text = dir.includes("roam-fleet") ? stripFleetBody(stitch) : stripStitchMain(stitch);
  for (const chunk of text.split(/(?<=[.!?])\s+/)) {
    const t = chunk.trim();
    if (t.length >= minLen && t.length <= 140 && /[a-z]/i.test(t) && !/^(FRAME|STATUS:|MATRIX VIEW|SCREEN AM)/i.test(t)) {
      out.add(t);
    }
  }
  return [...out].slice(0, 10);
}

async function assertNoForbidden(page: import("@playwright/test").Page, samples: string[]) {
  for (const sample of samples) {
    await expect(page.getByText(sample, { exact: false })).toHaveCount(0);
  }
}

async function assertStitchPhrases(page: import("@playwright/test").Page, htmlFile: string, dir: string) {
  for (const phrase of stitchPhrases(htmlFile, dir)) {
    await expect(page.locator("main, .find-parts-flow, .find-parts-screen-root, [data-testid='admin-root']").first()).toContainText(phrase, { timeout: 8_000, ignoreCase: true });
  }
}

function isDominionProject(projectName: string) {
  return projectName === "dominion-admin";
}

function isFleetProject(projectName: string) {
  return projectName === "fleet";
}

test.describe("Dominion parts auto-match Stitch fidelity", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isDominionProject(testInfo.project.name), "Dominion admin project only");
    await installOwnerSession(page);
    await installDominionAutoMatchMocks(page);
  });

  test("AM-S6 data quality health card", async ({ page }) => {
    await page.goto("/?page=catalog-quality");
    await expect(page.getByRole("heading", { name: "Data Quality" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Auto-match health" })).toBeVisible();
    await expect(page.getByText("Live matches")).toBeVisible();
    await expect(page.getByText("12")).toBeVisible();
    await expect(page.getByText(/Interval · nightly/i)).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN);
    await page.getByRole("button", { name: "Run catalog audit" }).click();
    await page.getByText("Open conflicts").click();
    await page.screenshot({ path: join(dominionShotsDir, "AM-S6-app.png"), fullPage: true });
    for (const phrase of stitchPhrases("AM-S6-data-quality-health.html", dominionStitchDir)) {
      await expect(page.locator("main").first()).toContainText(phrase, { timeout: 8_000, ignoreCase: true });
    }
  });

  test("AM-S5 pending catalog auto-match conflicts", async ({ page }) => {
    await page.goto("/?page=pending-motor-vehicles&tab=conflicts");
    await expect(page.getByText("Auto-match conflicts", { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Review before turning on auto-matching.")).toBeVisible();
    await expect(page.getByText("Same number, two parts")).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN);
    await page.getByRole("button", { name: "Open" }).click();
    await page.getByRole("button", { name: "Kept" }).click();
    await page.getByPlaceholder("Search car, number, group…").fill("D0051M");
    await page.getByRole("button", { name: "Review" }).first().click();
    await expect(page.getByText("Note · mandatory for audit trail")).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await page.screenshot({ path: join(dominionShotsDir, "AM-S5-app.png"), fullPage: true });
    await assertStitchPhrases(page, "AM-S5-auto-match-conflicts.html", dominionStitchDir);
  });

  test("AM-S1 vehicle factory part numbers tab", async ({ page }) => {
    await page.goto("/?page=motor-vehicles");
    await expect(page.getByText("Vehicle Catalog", { exact: false })).toBeVisible({ timeout: 30_000 });
    await page.getByTitle("View specs").first().click();
    await expect(page.getByText("Factory part numbers")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Factory part numbers/i }).click();
    await expect(page.getByText("D0051M-01-J")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("OE matching engine")).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN);
    await page.getByPlaceholder("part type or number").fill("D0051");
    await page.getByRole("button", { name: "brakes" }).click();
    await page.screenshot({ path: join(dominionShotsDir, "AM-S1-app.png"), fullPage: true });
    await assertStitchPhrases(page, "AM-S1-vehicle-factory-part-numbers.html", dominionStitchDir);
  });

  test("AM-S3 platforms shared components", async ({ page }) => {
    await page.goto("/?page=platforms");
    await expect(page.getByRole("heading", { name: /Platforms/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Shared component rules")).toBeVisible();
    await expect(page.getByText("DAI-M900")).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN);
    await page.getByPlaceholder("Search platform code").fill("DAI");
    await page.screenshot({ path: join(dominionShotsDir, "AM-S3-app.png"), fullPage: true });
    await assertStitchPhrases(page, "AM-S3-platform-shared-components.html", dominionStitchDir);
  });

  test("AM-S4 find parts why it matches results row", async ({ page }) => {
    await page.goto(
      `/?page=parts-catalog&car=${AM_VARIANT_ID}&part=${AM_COMPONENT_ID}&pos=front`,
    );
    await expect(page.getByText("Made for your car", { exact: false })).toBeVisible({ timeout: 35_000 });
    await expect(page.getByText("D0051M-01-J")).toBeVisible();
    await expect(page.getByText("Inspect fit")).toBeVisible();
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN);
    await page.getByText("Inspect fit").first().click();
    await page.screenshot({ path: join(dominionShotsDir, "AM-S4-app.png"), fullPage: true });
    await assertStitchPhrases(page, "AM-S4-find-parts-why-matches.html", dominionStitchDir);
  });

  test("AM-S2 part drawer cross-references", async ({ page }) => {
    await page.goto("/?page=parts-catalog&tab=database");
    await expect(page.getByText(/Full database|Master catalog/i).first()).toBeVisible({ timeout: 35_000 });
    const row = page.getByText("D0051M-01-J").first();
    await row.waitFor({ timeout: 20_000 });
    await row.click();
    await expect(page.getByText(/Front brake pad set/i)).toBeVisible({ timeout: 15_000 });
    await assertNoForbidden(page, AM_DOMINION_FORBIDDEN);
    await page.getByRole("button", { name: /Add a car|Add car/i }).first().click({ timeout: 5_000 }).catch(() => undefined);
    await page.screenshot({ path: join(dominionShotsDir, "AM-S2-app.png"), fullPage: true });
    await assertStitchPhrases(page, "AM-S2-part-cross-references-drawer.html", dominionStitchDir);
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
    await page.getByText("Structured Match Categories", { exact: false }).waitFor({ timeout: 25_000 });
    await expect(page.getByText("Confirmed").or(page.getByText("Roam is checking")).first()).toBeVisible();
    await assertNoForbidden(page, AM_FLEET_FORBIDDEN);
    await page.getByText("View details ›").first().click();
    await page.screenshot({ path: join(fleetShotsDir, "AM-S4F-app.png"), fullPage: true });
    for (const phrase of stitchPhrases("find-parts-why-it-fits.html", fleetStitchDir, 12)) {
      await expect(page.locator(".find-parts-screen-root, main").first()).toContainText(phrase, { timeout: 8_000, ignoreCase: true });
    }
  });
});
