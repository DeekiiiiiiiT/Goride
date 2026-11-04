/**
 * Manual: ADMIN_BASE_URL=http://127.0.0.1:4173 pnpm exec playwright test e2e/capture-am-screens.spec.ts --project=dominion-admin
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AM_COMPONENT_ID, AM_PLATFORM_ID, AM_VARIANT_ID, installDominionAutoMatchMocks } from "./partsAutoMatchMocks";

const dominionShotsDir = join(process.cwd(), "docs", "stitch", "dominion-redesign", "screenshots");
const STITCH_VIEWPORT = { width: 1440, height: 900 };
const THEME_KEY = "preference_dark_mode";

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

function sessionPayload() {
  const access = token();
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    app_metadata: { role: "platform_owner" },
    user_metadata: { name: "Dominion Owner" },
  };
  return {
    access_token: access,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}

async function seedSession(page: import("@playwright/test").Page, dark: boolean) {
  const session = sessionPayload();
  await page.addInitScript(({ stored, useDark, themeKey }) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", JSON.stringify(stored));
    localStorage.setItem(themeKey, String(useDark));
    const root = document.documentElement;
    if (useDark) {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }
  }, { stored: session, useDark: dark, themeKey: THEME_KEY });
}

function hideAppTopBar(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const searchInput = document.querySelector('input[placeholder*="Search entities"]');
    const header =
      searchInput?.closest("header") ??
      document.querySelector("header.sticky");
    if (header instanceof HTMLElement) {
      header.dataset.amCapturePrevDisplay = header.style.display;
      header.style.display = "none";
    }
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      main.dataset.amCapturePrevMinHeight = main.style.minHeight;
      main.dataset.amCapturePrevPaddingTop = main.style.paddingTop;
      main.style.minHeight = "auto";
      main.style.paddingTop = "0";
    }
  });
}

function restoreAppTopBar(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const searchInput = document.querySelector('input[placeholder*="Search entities"]');
    const header =
      searchInput?.closest("header") ??
      document.querySelector("header.sticky");
    if (header instanceof HTMLElement) {
      header.style.display = header.dataset.amCapturePrevDisplay ?? "";
      delete header.dataset.amCapturePrevDisplay;
    }
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      main.style.minHeight = main.dataset.amCapturePrevMinHeight ?? "";
      main.style.paddingTop = main.dataset.amCapturePrevPaddingTop ?? "";
      delete main.dataset.amCapturePrevMinHeight;
      delete main.dataset.amCapturePrevPaddingTop;
    }
  });
}

async function captureVehicleRecord(page: import("@playwright/test").Page, fileName: string) {
  await page.goto("/?page=motor-vehicles");
  await page.getByRole("heading", { name: /Vehicle catalog/i }).waitFor({ timeout: 60_000 });
  await page.getByTitle("View specs").first().click();
  await page.getByRole("button", { name: /Factory part numbers/i }).click();
  await page.getByText("04465-B1190").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Add number/i }).click();
  await page.locator("input.font-mono-md.text-on-surface").first().fill("04465-B1190");
  await page.getByText("CLEANED MATCH ON").waitFor({ timeout: 15_000 });
  const record = page.locator(".vehicle-factory-record").first();
  await record.waitFor({ timeout: 15_000 });
  await page.getByText(/Numbers added here are matched within a minute/i).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /Save number/i }).waitFor({ timeout: 15_000 });
  await hideAppTopBar(page);
  await page.getByText("SYS_ID:").waitFor({ timeout: 5_000 });
  await record.screenshot({ path: join(dominionShotsDir, fileName) });
  await restoreAppTopBar(page);
}

async function capturePlatforms(page: import("@playwright/test").Page, fileName: string) {
  await page.goto(`/?page=platforms&platform=${AM_PLATFORM_ID}`);
  await page.locator(".platform-shared-record").waitFor({ timeout: 60_000 });
  await page.getByText("VIEW B // ACTIVE RECORD").waitFor({ timeout: 30_000 });
  await page.getByPlaceholder("Search platform code or maker").fill("DAI-M900");
  await page.getByRole("button", { name: /Add shared component/i }).first().click();
  await page.getByText("WORKFLOW // FITMENT LINK").waitFor({ timeout: 15_000 });
  await page.getByText("OVERLAP VALID").waitFor({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Save link" })).toBeEnabled({ timeout: 15_000 });
  const root = page.locator(".platform-shared-record").first();
  await hideAppTopBar(page);
  await root.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  const linksTable = page.locator(".platform-links-table").first();
  await expect(linksTable.getByRole("columnheader", { name: "Actions" })).toBeVisible();
  await expect(linksTable.locator("td:last-child button").first()).toBeVisible();
  await root.screenshot({ path: join(dominionShotsDir, fileName) });
  await restoreAppTopBar(page);
}

async function captureConflicts(page: import("@playwright/test").Page, fileName: string) {
  await page.goto("/?page=pending-motor-vehicles&tab=conflicts");
  await page.locator(".auto-match-conflicts-workspace").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Batch Resolve Rules" }).waitFor({ timeout: 30_000 });
  await page.getByText("Conflict heatmap / Chassis", { exact: false }).waitFor({ timeout: 30_000 });
  await page.getByText("Geometry verification", { exact: false }).waitFor({ timeout: 15_000 });
  const geoImg = page.locator(".am-conflict-geometry-image").first();
  const geoPlaceholder = page.locator(".am-conflict-geometry-placeholder").first();
  await Promise.race([
    geoImg.waitFor({ state: "visible", timeout: 45_000 }).then(async () => {
      await page.waitForFunction(() => {
        const img = document.querySelector(".am-conflict-geometry-image");
        return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
      }, { timeout: 45_000 });
    }),
    geoPlaceholder.waitFor({ state: "visible", timeout: 45_000 }),
  ]).catch(() => {});
  const conflictsTable = page.locator(".auto-match-conflicts-table").first();
  // Stitch has no row actions: Keep / Remove live in the drawer. Status is the last column
  // and must sit fully inside the table card.
  await expect(conflictsTable.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await expect(conflictsTable.locator(".am-conflict-status-badge").first()).toBeVisible();
  const statusInCard = await conflictsTable.evaluate((table) => {
    const card = table.parentElement as HTMLElement;
    const badge = table.querySelector(".am-conflict-status-badge") as HTMLElement | null;
    if (!badge) return false;
    return badge.getBoundingClientRect().right <= card.getBoundingClientRect().right + 0.5;
  });
  expect(statusInCard).toBe(true);
  const root = page.locator(".pending-parts-stitch.auto-match-conflicts").first();
  await hideAppTopBar(page);
  await root.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await root.screenshot({ path: join(dominionShotsDir, fileName) });
  await restoreAppTopBar(page);
}

async function captureFindParts(page: import("@playwright/test").Page, fileName: string) {
  await page.goto(`/?page=parts-catalog&car=${AM_VARIANT_ID}&part=${AM_COMPONENT_ID}&pos=front`);
  await page.locator(".find-parts-results").waitFor({ timeout: 60_000 });
  await page.getByText("Made for your car", { exact: false }).waitFor({ timeout: 30_000 });
  await page.getByText("Auto-matching engine active").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /Batch validation mode/i }).click();
  await page.getByPlaceholder(/Batch commit note/i).fill("AM-S4 batch note");
  const batchBox = page.locator(".find-parts-results input[type=checkbox]").first();
  await batchBox.waitFor({ timeout: 10_000 });
  await batchBox.check();
  await expect(page.getByRole("button", { name: /Commit active fitments/i })).toBeEnabled();
  const root = page.locator(".parts-database-stitch.flex.flex-col.w-full").first();
  await hideAppTopBar(page);
  await root.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await root.screenshot({ path: join(dominionShotsDir, fileName) });
  await restoreAppTopBar(page);
}

async function captureCatalogQuality(page: import("@playwright/test").Page, fileName: string) {
  await installDominionAutoMatchMocks(page, { profile: "error" });
  await page.goto("/?page=catalog-quality");
  const root = page.locator(".catalog-quality-record").first();
  await root.waitFor({ timeout: 60_000 });
  await page.getByRole("heading", { name: "Data Quality" }).waitFor({ timeout: 30_000 });
  await page.getByRole("heading", { name: "Auto-match health" }).waitFor({ timeout: 15_000 });
  await page.getByText("Interval · Daily at 03:00 UTC").waitFor({ timeout: 15_000 });
  await page.getByText("Position clean-up queue", { exact: false }).waitFor({ timeout: 15_000 });
  await hideAppTopBar(page);
  await root.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await root.screenshot({ path: join(dominionShotsDir, fileName) });
  await restoreAppTopBar(page);
}

async function capturePartDrawer(page: import("@playwright/test").Page, fileName: string) {
  await page.goto("/?page=parts-catalog&tab=database");
  await page.getByText("D0051M-01-J").first().waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "View details" }).first().click();
  await page.getByRole("heading", { level: 1, name: /MK Kashiyama D0051M-01-J/i }).waitFor({ timeout: 30_000 });
  const drawer = page.locator(".find-parts-sheet").first();
  await drawer.waitFor({ timeout: 15_000 });
  await drawer.scrollIntoViewIfNeeded();
  await drawer.screenshot({ path: join(dominionShotsDir, fileName) });
}

function pngBytesDiffer(a: string, b: string): boolean {
  return readFileSync(a).compare(readFileSync(b)) !== 0;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(STITCH_VIEWPORT);
  const session = sessionPayload();
  await page.addInitScript(({ stored }) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify(stored));
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", JSON.stringify(stored));
  }, { stored: session });
  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({ json: session });
  });
  await installDominionAutoMatchMocks(page, { profile: "default" });
});

test("capture AM-S6 catalog quality screenshots (light)", async ({ page }) => {
  await seedSession(page, false);
  await page.emulateMedia({ colorScheme: "light" });
  await captureCatalogQuality(page, "AM-S6-app.png");
  expect(join(dominionShotsDir, "AM-S6-app.png")).toBeTruthy();
});

test("capture AM-S6 catalog quality dark mode screenshots", async ({ page }) => {
  await seedSession(page, true);
  await page.emulateMedia({ colorScheme: "dark" });
  await captureCatalogQuality(page, "AM-S6-app-dark.png");
  expect(
    pngBytesDiffer(join(dominionShotsDir, "AM-S6-app.png"), join(dominionShotsDir, "AM-S6-app-dark.png")),
    "AM-S6 light and dark must differ",
  ).toBe(true);
});

test("capture AM-S5 conflicts screenshots (light)", async ({ page }) => {
  await seedSession(page, false);
  await page.emulateMedia({ colorScheme: "light" });
  await captureConflicts(page, "AM-S5-app.png");
  expect(join(dominionShotsDir, "AM-S5-app.png")).toBeTruthy();
});

test("capture AM-S5 conflicts dark mode screenshots", async ({ page }) => {
  await seedSession(page, true);
  await page.emulateMedia({ colorScheme: "dark" });
  await captureConflicts(page, "AM-S5-app-dark.png");
  expect(
    pngBytesDiffer(join(dominionShotsDir, "AM-S5-app.png"), join(dominionShotsDir, "AM-S5-app-dark.png")),
    "AM-S5 light and dark must differ",
  ).toBe(true);
});

test("capture AM-S4 find parts screenshots (light)", async ({ page }) => {
  await seedSession(page, false);
  await page.emulateMedia({ colorScheme: "light" });
  await captureFindParts(page, "AM-S4-app.png");
  expect(join(dominionShotsDir, "AM-S4-app.png")).toBeTruthy();
});

test("capture AM-S4 find parts dark mode screenshots", async ({ page }) => {
  await seedSession(page, true);
  await page.emulateMedia({ colorScheme: "dark" });
  await captureFindParts(page, "AM-S4-app-dark.png");
  expect(
    pngBytesDiffer(join(dominionShotsDir, "AM-S4-app.png"), join(dominionShotsDir, "AM-S4-app-dark.png")),
    "AM-S4 light and dark must differ",
  ).toBe(true);
});

test("capture AM-S1, AM-S2, and AM-S3 app screenshots (light)", async ({ page }) => {
  await seedSession(page, false);
  await page.emulateMedia({ colorScheme: "light" });
  await captureVehicleRecord(page, "AM-S1-app.png");
  await capturePartDrawer(page, "AM-S2-app.png");
  await capturePlatforms(page, "AM-S3-app.png");
  expect(join(dominionShotsDir, "AM-S3-app.png")).toBeTruthy();
});

test("capture AM-S1, AM-S2, and AM-S3 dark mode screenshots", async ({ page }) => {
  await seedSession(page, true);
  await page.emulateMedia({ colorScheme: "dark" });
  await captureVehicleRecord(page, "AM-S1-app-dark.png");
  await capturePartDrawer(page, "AM-S2-app-dark.png");
  await capturePlatforms(page, "AM-S3-app-dark.png");
  const pairs: Array<[string, string]> = [
    ["AM-S1-app.png", "AM-S1-app-dark.png"],
    ["AM-S2-app.png", "AM-S2-app-dark.png"],
    ["AM-S3-app.png", "AM-S3-app-dark.png"],
  ];
  for (const [light, dark] of pairs) {
    expect(
      pngBytesDiffer(join(dominionShotsDir, light), join(dominionShotsDir, dark)),
      `${light} and ${dark} must differ`,
    ).toBe(true);
  }
});
